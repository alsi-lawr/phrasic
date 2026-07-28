//! Windows-only byte-stream named-pipe ownership and child supervision.

#[path = "windows_security.rs"]
mod security;

use std::ffi::OsString;
use std::io::{self, IsTerminal};
use std::pin::Pin;
use std::process::Stdio;
use std::task::{Context, Poll};
use std::time::Duration;

use hyper_util::rt::TokioIo;
use phrasic_rpc::local::GetInstanceInfoRequest;
use phrasic_rpc::local::local_media_client::LocalMediaClient;
use phrasic_rpc::local::local_media_server::LocalMediaServer;
use phrasic_rpc::{InstanceId, LocalMediaService, SnapshotState};
use tokio::io::{
    AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader, ReadBuf,
};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeServer, PipeMode, ServerOptions};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;
use tonic::transport::server::Connected;
use tonic::transport::{Endpoint, Server, Uri};
use tower::service_fn;

use crate::command::{BrowserHandoff, Diagnostic, DiagnosticCode, ServingConfiguration};

#[used]
pub(super) static MODULE_MARKER: [u8; 18] = *b"windows-native-ipc";

const READINESS_DEADLINE: Duration = Duration::from_secs(2);
const CONTROL_DEADLINE: Duration = Duration::from_secs(5);
const GRACEFUL_SHUTDOWN_DEADLINE: Duration = Duration::from_secs(2);
const FORCED_SHUTDOWN_DEADLINE: Duration = Duration::from_secs(2);
const MAX_CONTROL_BYTES: u64 = 2_048;
const MAX_NATIVE_CONCURRENCY: usize = 16;
const LOCAL_HOST_PROGRAM: &str = "phrasic-local-host.exe";

pub(super) fn run_adapter(configuration: &ServingConfiguration) -> Result<(), Diagnostic> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|_| Diagnostic::new(DiagnosticCode::NativeRuntimeUnavailable))?;
    runtime.block_on(run(configuration))
}

async fn run(configuration: &ServingConfiguration) -> Result<(), Diagnostic> {
    let _source_pin = configuration.source_pin();
    let instance_id =
        InstanceId::random().map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
    let endpoint = named_pipe_endpoint(configuration.port().get());
    let service = LocalMediaService::new(SnapshotState::with_fake_collector(instance_id.clone()));
    let (shutdown_sender, shutdown_receiver) = watch::channel(false);
    let mut server = start_server(endpoint.clone(), service, shutdown_receiver)?;
    if let Err(error) = prove_readiness(endpoint.clone(), &instance_id).await {
        let _ = shutdown_sender.send(true);
        let server_result = stop_server(&mut server).await;
        return if is_forced_termination(&server_result) {
            server_result
        } else {
            Err(error)
        };
    }
    let child_shutdown = CancellationToken::new();
    let mut child = tokio::spawn(supervise_bun(
        endpoint,
        instance_id,
        configuration.browser_handoff(),
        child_shutdown.clone(),
    ));
    let (mut result, server_consumed) = tokio::select! {
        child_result = &mut child => {
            let _ = shutdown_sender.send(true);
            (match child_result {
                Ok(result) => result,
                Err(_) => Err(Diagnostic::new(DiagnosticCode::BunExited)),
            }, false)
        },
        server_result = &mut server => {
            child_shutdown.cancel();
            let child_result = child.await;
            let result = match child_result {
                Ok(result) if is_forced_termination(&result) => result,
                _ => match server_result {
                    Ok(Ok(())) | Ok(Err(_)) | Err(_) => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
                },
            };
            (result, true)
        }
    };
    if !server_consumed {
        let _ = shutdown_sender.send(true);
        let server_result = stop_server(&mut server).await;
        if is_forced_termination(&server_result) {
            result = server_result;
        }
    }
    result
}

async fn stop_server(
    server: &mut JoinHandle<Result<(), tonic::transport::Error>>,
) -> Result<(), Diagnostic> {
    stop_server_with_deadlines(server, GRACEFUL_SHUTDOWN_DEADLINE, FORCED_SHUTDOWN_DEADLINE).await
}

async fn stop_server_with_deadlines(
    server: &mut JoinHandle<Result<(), tonic::transport::Error>>,
    graceful_deadline: Duration,
    forced_deadline: Duration,
) -> Result<(), Diagnostic> {
    match timeout(graceful_deadline, &mut *server).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(_) => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
        Err(_) => {
            server.abort();
            let _ = timeout(forced_deadline, &mut *server).await;
            Err(Diagnostic::new(DiagnosticCode::LifecycleForcedTermination))
        }
    }
}

fn is_forced_termination(result: &Result<(), Diagnostic>) -> bool {
    matches!(
        result,
        Err(diagnostic) if diagnostic.code() == DiagnosticCode::LifecycleForcedTermination
    )
}

fn start_server(
    endpoint: String,
    service: LocalMediaService,
    shutdown_receiver: watch::Receiver<bool>,
) -> Result<JoinHandle<Result<(), tonic::transport::Error>>, Diagnostic> {
    let first = create_pipe(&endpoint, true)?;
    let (incoming_sender, incoming_receiver) = mpsc::channel(16);
    tokio::spawn(accept_connections(
        endpoint,
        first,
        incoming_sender,
        shutdown_receiver.clone(),
    ));
    Ok(tokio::spawn(async move {
        let mut shutdown_receiver = shutdown_receiver;
        Server::builder()
            .concurrency_limit_per_connection(MAX_NATIVE_CONCURRENCY)
            .timeout(READINESS_DEADLINE)
            .load_shed(true)
            .add_service(LocalMediaServer::new(service))
            .serve_with_incoming_shutdown(ReceiverStream::new(incoming_receiver), async move {
                let _ = shutdown_receiver.changed().await;
            })
            .await
    }))
}

async fn prove_readiness(endpoint: String, instance_id: &InstanceId) -> Result<(), Diagnostic> {
    let result = timeout(READINESS_DEADLINE, async move {
        let channel = Endpoint::try_from("http://[::]:50051")
            .map_err(|_| ())?
            .connect_with_connector(service_fn(move |_: Uri| {
                let endpoint = endpoint.clone();
                async move { ClientOptions::new().open(endpoint).map(TokioIo::new) }
            }))
            .await
            .map_err(|_| ())?;
        let mut client = LocalMediaClient::new(channel);
        client
            .get_instance_info(GetInstanceInfoRequest {})
            .await
            .map_err(|_| ())
    })
    .await;

    match result {
        Ok(Ok(response)) if response.get_ref().instance_id == instance_id.to_vec() => Ok(()),
        _ => Err(Diagnostic::new(DiagnosticCode::NativeReadinessFailed)),
    }
}

async fn supervise_bun(
    endpoint: String,
    instance_id: InstanceId,
    handoff: BrowserHandoff,
    shutdown: CancellationToken,
) -> Result<(), Diagnostic> {
    let mut child = child_command(&endpoint, &instance_id)
        .spawn()
        .map_err(|_| Diagnostic::new(DiagnosticCode::BunLaunchFailed))?;
    let stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = force_reap_child(&mut child).await;
            return Err(Diagnostic::new(DiagnosticCode::BunControlFailed));
        }
    };
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let stop_result = stop_child(&mut child, stdin).await;
            if is_forced_termination(&stop_result) {
                return stop_result;
            }
            return Err(Diagnostic::new(DiagnosticCode::BunControlFailed));
        }
    };
    let control = tokio::select! {
        control = read_control_record(stdout, browser_port(&endpoint)?) => control,
        _ = shutdown.cancelled() => Err(Diagnostic::new(DiagnosticCode::BunExited)),
    };
    let url = match control {
        Ok(url) => url,
        Err(error) => {
            let stop_result = stop_child(&mut child, stdin).await;
            return if is_forced_termination(&stop_result) {
                stop_result
            } else {
                Err(error)
            };
        }
    };
    if let Err(error) = deliver_control_message(&url, handoff).await {
        let stop_result = stop_child(&mut child, stdin).await;
        return if is_forced_termination(&stop_result) {
            stop_result
        } else {
            Err(error)
        };
    }
    tokio::select! {
        waited = child.wait() => {
            let _ = waited;
            Err(Diagnostic::new(DiagnosticCode::BunExited))
        }
        _ = shutdown.cancelled() => {
            let stop_result = stop_child(&mut child, stdin).await;
            if is_forced_termination(&stop_result) {
                stop_result
            } else {
                Err(Diagnostic::new(DiagnosticCode::BunExited))
            }
        }
    }
}

async fn read_control_record(
    stdout: tokio::process::ChildStdout,
    browser_port: u16,
) -> Result<url::Url, Diagnostic> {
    let mut bytes = Vec::new();
    let mut control = BufReader::new(stdout).take(MAX_CONTROL_BYTES + 1);
    match timeout(CONTROL_DEADLINE, control.read_until(b'\n', &mut bytes)).await {
        Ok(Ok(_))
            if u64::try_from(bytes.len())
                .ok()
                .is_none_or(|len| len > MAX_CONTROL_BYTES) =>
        {
            Err(Diagnostic::new(DiagnosticCode::BunControlFailed))
        }
        Ok(Ok(_)) => parse_control_record(&bytes, browser_port),
        _ => Err(Diagnostic::new(DiagnosticCode::BunControlFailed)),
    }
}

fn parse_control_record(bytes: &[u8], browser_port: u16) -> Result<url::Url, Diagnostic> {
    let record = std::str::from_utf8(bytes)
        .map_err(|_| Diagnostic::new(DiagnosticCode::BunControlFailed))?;
    let value = record
        .strip_prefix("PAIRING_URL ")
        .and_then(|value| value.strip_suffix('\n'))
        .filter(|value| !value.contains('\n'))
        .ok_or(Diagnostic::new(DiagnosticCode::BunControlFailed))?;
    let parsed =
        url::Url::parse(value).map_err(|_| Diagnostic::new(DiagnosticCode::BunControlFailed))?;
    if parsed.scheme() == "http"
        && parsed.host_str() == Some("127.0.0.1")
        && parsed.port() == Some(browser_port)
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.query().is_none()
        && parsed.path() == "/local/"
        && parsed
            .fragment()
            .is_some_and(|fragment| !fragment.is_empty())
    {
        Ok(parsed)
    } else {
        Err(Diagnostic::new(DiagnosticCode::BunControlFailed))
    }
}

async fn force_reap_child(child: &mut tokio::process::Child) -> Result<(), Diagnostic> {
    match timeout(FORCED_SHUTDOWN_DEADLINE, child.kill()).await {
        Ok(Ok(())) => Ok(()),
        _ => Err(Diagnostic::new(DiagnosticCode::BunExited)),
    }
}

async fn stop_child(
    child: &mut tokio::process::Child,
    control: tokio::process::ChildStdin,
) -> Result<(), Diagnostic> {
    stop_child_with_deadlines(
        child,
        control,
        GRACEFUL_SHUTDOWN_DEADLINE,
        FORCED_SHUTDOWN_DEADLINE,
    )
    .await
}

async fn stop_child_with_deadlines(
    child: &mut tokio::process::Child,
    mut control: tokio::process::ChildStdin,
    graceful_deadline: Duration,
    forced_deadline: Duration,
) -> Result<(), Diagnostic> {
    let _ = control.write_all(b"REVOKE_SESSIONS\nSHUTDOWN\n").await;
    let _ = control.shutdown().await;
    drop(control);
    match timeout(graceful_deadline, child.wait()).await {
        Ok(Ok(_)) => Ok(()),
        Ok(Err(_)) => {
            let _ = timeout(forced_deadline, child.kill()).await;
            Err(Diagnostic::new(DiagnosticCode::BunExited))
        }
        Err(_) => {
            let _ = timeout(forced_deadline, child.kill()).await;
            Err(Diagnostic::new(DiagnosticCode::LifecycleForcedTermination))
        }
    }
}

fn browser_port(endpoint: &str) -> Result<u16, Diagnostic> {
    endpoint
        .rsplit('-')
        .next()
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or(Diagnostic::new(DiagnosticCode::BunControlFailed))
}

fn host_program() -> OsString {
    match std::env::var_os("PHRASIC_LOCAL_HOST") {
        Some(program) => program,
        None => OsString::from(LOCAL_HOST_PROGRAM),
    }
}

fn child_command(endpoint: &str, instance_id: &InstanceId) -> Command {
    let program = host_program();
    let mut command = Command::new(program);
    command
        .arg("--native-endpoint")
        .arg(endpoint)
        .arg("--expected-instance-id")
        .arg(hex_instance_id(instance_id))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    command
}

fn hex_instance_id(instance_id: &InstanceId) -> String {
    instance_id
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

async fn deliver_control_message(
    url: &url::Url,
    handoff: BrowserHandoff,
) -> Result<(), Diagnostic> {
    match handoff {
        BrowserHandoff::Print => {
            if !std::io::stdout().is_terminal() {
                return Err(Diagnostic::new(DiagnosticCode::BunControlFailed));
            }
            println!("{url}");
            Ok(())
        }
        BrowserHandoff::Open => Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|_| Diagnostic::new(DiagnosticCode::BunControlFailed)),
    }
}

fn named_pipe_endpoint(port: u16) -> String {
    format!(r"\\.\pipe\LOCAL\phrasic-local-v1-{port}")
}

fn create_pipe(endpoint: &str, first_instance: bool) -> Result<NamedPipeServer, Diagnostic> {
    let mut options = ServerOptions::new();
    options
        .pipe_mode(PipeMode::Byte)
        .first_pipe_instance(first_instance)
        .reject_remote_clients(true);
    security::create_pipe_with_current_user_dacl(&options, endpoint)
        .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))
}

async fn accept_connections(
    endpoint: String,
    first: NamedPipeServer,
    incoming: mpsc::Sender<Result<IpcStream, io::Error>>,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut pending = Some(first);
    loop {
        let pipe = match pending.take() {
            Some(pipe) => pipe,
            None => return,
        };
        tokio::select! {
            connected = pipe.connect() => {
                if let Err(error) = connected {
                    let _ = incoming.send(Err(error)).await;
                    return;
                }
            }
            changed = shutdown.changed() => {
                let _ = changed;
                return;
            }
        }
        let replacement = match create_pipe(&endpoint, false) {
            Ok(pipe) => pipe,
            Err(_) => return,
        };
        if incoming.send(Ok(IpcStream::new(pipe))).await.is_err() {
            return;
        }
        pending = Some(replacement);
    }
}

struct IpcStream {
    inner: NamedPipeServer,
}

impl IpcStream {
    const fn new(inner: NamedPipeServer) -> Self {
        Self { inner }
    }
}

impl Connected for IpcStream {
    type ConnectInfo = ();

    fn connect_info(&self) -> Self::ConnectInfo {}
}

impl AsyncRead for IpcStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(context, buffer)
    }
}

impl AsyncWrite for IpcStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &[u8],
    ) -> Poll<io::Result<usize>> {
        Pin::new(&mut self.inner).poll_write(context, buffer)
    }

    fn poll_flush(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(context)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pipe_name_is_local_v1_and_child_uses_only_non_secret_connection_data() {
        let endpoint = named_pipe_endpoint(8080);
        assert_eq!(endpoint, r"\\.\pipe\LOCAL\phrasic-local-v1-8080");
        let command = child_command(&endpoint, &InstanceId::from_bytes([1_u8; 16]));
        let debug = format!("{command:?}");
        assert!(debug.contains("--native-endpoint"));
        assert!(debug.contains("--expected-instance-id"));
        assert!(!debug.contains("api-major"));
    }
}
