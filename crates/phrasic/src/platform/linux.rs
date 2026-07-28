//! Linux-only Unix-domain-socket ownership and child supervision.

use std::ffi::OsString;
use std::fs::{File, OpenOptions};

use fs2::FileExt;
use std::io::{self, IsTerminal};
use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use hyper_util::rt::TokioIo;
use phrasic_rpc::local::GetInstanceInfoRequest;
use phrasic_rpc::local::local_media_client::LocalMediaClient;
use phrasic_rpc::local::local_media_server::LocalMediaServer;
use phrasic_rpc::{InstanceId, LocalMediaService, SnapshotState};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::process::Command;
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_stream::wrappers::UnixListenerStream;
use tokio_util::sync::CancellationToken;
use tonic::transport::{Endpoint, Server, Uri};
use tower::service_fn;

use crate::command::{BrowserHandoff, Diagnostic, DiagnosticCode, ServingConfiguration};

#[used]
pub(super) static MODULE_MARKER: [u8; 16] = *b"linux-native-ipc";

const SOCKET_MODE: u32 = 0o600;
const DIRECTORY_MODE: u32 = 0o700;
const READINESS_DEADLINE: Duration = Duration::from_secs(2);
const CONTROL_DEADLINE: Duration = Duration::from_secs(5);
const GRACEFUL_SHUTDOWN_DEADLINE: Duration = Duration::from_secs(2);
const FORCED_SHUTDOWN_DEADLINE: Duration = Duration::from_secs(2);
const MAX_CONTROL_BYTES: u64 = 2_048;
const MAX_NATIVE_CONCURRENCY: usize = 16;
const RUNTIME_DIRECTORY_NAME: &str = "phrasic";
const LOCAL_HOST_PROGRAM: &str = "phrasic-local-host";

pub(super) fn run_adapter(configuration: &ServingConfiguration) -> Result<(), Diagnostic> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|_| Diagnostic::new(DiagnosticCode::NativeRuntimeUnavailable))?;
    runtime.block_on(run(configuration))
}

async fn run(configuration: &ServingConfiguration) -> Result<(), Diagnostic> {
    let external_shutdown = CancellationToken::new();
    let signal_shutdown = external_shutdown.clone();
    tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        signal_shutdown.cancel();
    });
    run_with_shutdown(configuration, external_shutdown).await
}

async fn supervise_lifecycle(
    server: &mut JoinHandle<Result<(), tonic::transport::Error>>,
    child: &mut JoinHandle<Result<(), Diagnostic>>,
    server_shutdown: CancellationToken,
    child_shutdown: CancellationToken,
    external_shutdown: CancellationToken,
) -> Result<(), Diagnostic> {
    supervise_lifecycle_with_deadlines(
        server,
        child,
        server_shutdown,
        child_shutdown,
        external_shutdown,
        GRACEFUL_SHUTDOWN_DEADLINE,
        FORCED_SHUTDOWN_DEADLINE,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn supervise_lifecycle_with_deadlines(
    server: &mut JoinHandle<Result<(), tonic::transport::Error>>,
    child: &mut JoinHandle<Result<(), Diagnostic>>,
    server_shutdown: CancellationToken,
    child_shutdown: CancellationToken,
    external_shutdown: CancellationToken,
    graceful_deadline: Duration,
    forced_deadline: Duration,
) -> Result<(), Diagnostic> {
    tokio::select! {
        child_result = &mut *child => {
            server_shutdown.cancel();
            let server_result =
                stop_server_with_deadlines(server, graceful_deadline, forced_deadline).await;
            if is_forced_termination(&server_result) {
                return server_result;
            }
            match child_result {
                Ok(result) => result,
                Err(_) => Err(Diagnostic::new(DiagnosticCode::BunExited)),
            }
        }
        _ = &mut *server => {
            child_shutdown.cancel();
            let child_result = child.await;
            match child_result {
                Ok(result) if is_forced_termination(&result) => result,
                _ => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
            }
        }
        _ = external_shutdown.cancelled() => {
            child_shutdown.cancel();
            let child_result = child.await;
            server_shutdown.cancel();
            let server_result =
                stop_server_with_deadlines(server, graceful_deadline, forced_deadline).await;
            if is_forced_termination(&server_result) {
                server_result
            } else {
                match child_result {
                    Ok(result) if is_forced_termination(&result) => result,
                    _ => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
                }
            }
        }
    }
}

async fn run_with_shutdown(
    configuration: &ServingConfiguration,
    external_shutdown: CancellationToken,
) -> Result<(), Diagnostic> {
    let _source_pin = configuration.source_pin();
    let instance_id =
        InstanceId::random().map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
    let state = SnapshotState::with_fake_collector(instance_id.clone());
    let mut endpoint = EndpointGuard::prepare(configuration.port().get())?;
    let listener = endpoint.bind_listener()?;
    let server_shutdown = CancellationToken::new();
    let child_shutdown = CancellationToken::new();
    let mut server = start_server(listener, state, server_shutdown.clone());

    if let Err(error) = prove_readiness(endpoint.path(), &instance_id).await {
        server_shutdown.cancel();
        let server_result = stop_server(&mut server).await;
        return if is_forced_termination(&server_result) {
            server_result
        } else {
            Err(error)
        };
    }
    let mut child = tokio::spawn(supervise_bun(
        endpoint.path().to_path_buf(),
        configuration.port().get(),
        instance_id,
        configuration.browser_handoff(),
        child_shutdown.clone(),
    ));

    supervise_lifecycle(
        &mut server,
        &mut child,
        server_shutdown,
        child_shutdown,
        external_shutdown,
    )
    .await
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
    listener: UnixListener,
    state: SnapshotState,
    shutdown: CancellationToken,
) -> JoinHandle<Result<(), tonic::transport::Error>> {
    tokio::spawn(async move {
        Server::builder()
            .concurrency_limit_per_connection(MAX_NATIVE_CONCURRENCY)
            .timeout(READINESS_DEADLINE)
            .load_shed(true)
            .add_service(LocalMediaServer::new(LocalMediaService::new(state)))
            .serve_with_incoming_shutdown(
                UnixListenerStream::new(listener),
                shutdown.cancelled_owned(),
            )
            .await
    })
}

async fn prove_readiness(endpoint: &Path, instance_id: &InstanceId) -> Result<(), Diagnostic> {
    let path = endpoint.to_path_buf();
    let result = timeout(READINESS_DEADLINE, async move {
        let channel = Endpoint::try_from("http://[::]:50051")
            .map_err(|_| ())?
            .connect_with_connector(service_fn(move |_: Uri| {
                let path = path.clone();
                async move { UnixStream::connect(path).await.map(TokioIo::new) }
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
        Ok(Ok(response)) => {
            if response.into_inner().instance_id == instance_id.to_vec() {
                Ok(())
            } else {
                Err(Diagnostic::new(DiagnosticCode::NativeReadinessFailed))
            }
        }
        _ => Err(Diagnostic::new(DiagnosticCode::NativeReadinessFailed)),
    }
}

async fn supervise_bun(
    endpoint: PathBuf,
    browser_port: u16,
    instance_id: InstanceId,
    handoff: BrowserHandoff,
    shutdown: CancellationToken,
) -> Result<(), Diagnostic> {
    supervise_bun_command(
        child_command(&endpoint, &instance_id),
        browser_port,
        shutdown,
        move |url| deliver_control_message(url, handoff),
    )
    .await
}

async fn supervise_bun_command<Deliver>(
    mut command: Command,
    browser_port: u16,
    shutdown: CancellationToken,
    deliver: Deliver,
) -> Result<(), Diagnostic>
where
    Deliver: FnOnce(&url::Url) -> Result<(), Diagnostic>,
{
    let mut child = command
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

    let result = tokio::select! {
        control = read_control_record(stdout, browser_port) => match control {
            Ok(url) => deliver(&url),
            Err(error) => Err(error),
        },
        _ = shutdown.cancelled() => Err(Diagnostic::new(DiagnosticCode::BunExited)),
    };
    if let Err(error) = result {
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
    let result = timeout(CONTROL_DEADLINE, control.read_until(b'\n', &mut bytes)).await;
    match result {
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
    let url = record
        .strip_prefix("PAIRING_URL ")
        .and_then(|value| value.strip_suffix('\n'))
        .filter(|value| !value.contains('\n'))
        .ok_or(Diagnostic::new(DiagnosticCode::BunControlFailed))?;
    let parsed =
        url::Url::parse(url).map_err(|_| Diagnostic::new(DiagnosticCode::BunControlFailed))?;
    let matches_origin = parsed.scheme() == "http"
        && parsed.host_str() == Some("127.0.0.1")
        && parsed.port() == Some(browser_port)
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.query().is_none()
        && parsed.path() == "/local/"
        && parsed
            .fragment()
            .is_some_and(|fragment| !fragment.is_empty());
    if matches_origin {
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

async fn send_graceful_shutdown<Writer>(control: &mut Writer) -> io::Result<()>
where
    Writer: AsyncWrite + Unpin,
{
    control.write_all(b"REVOKE_SESSIONS\nSHUTDOWN\n").await?;
    control.shutdown().await
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
    let _ = send_graceful_shutdown(&mut control).await;
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

fn host_program() -> OsString {
    match std::env::var_os("PHRASIC_LOCAL_HOST") {
        Some(program) => program,
        None => OsString::from(LOCAL_HOST_PROGRAM),
    }
}

fn child_command(endpoint: &Path, instance_id: &InstanceId) -> Command {
    let program = host_program();
    let mut command = Command::new(program);
    command
        .arg("--native-endpoint")
        .arg(endpoint)
        .arg("--expected-instance-id")
        .arg(hex_instance_id(instance_id))
        .stdin(Stdio::piped())
        // stdout is the inherited private typed control channel, not a log sink.
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

fn deliver_control_message(url: &url::Url, handoff: BrowserHandoff) -> Result<(), Diagnostic> {
    match handoff {
        BrowserHandoff::Print => print_url_to_terminal(url, std::io::stdout().is_terminal()),
        BrowserHandoff::Open => Command::new("xdg-open")
            .arg(url.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|_| Diagnostic::new(DiagnosticCode::BunControlFailed)),
    }
}

fn print_url_to_terminal(url: &url::Url, is_terminal: bool) -> Result<(), Diagnostic> {
    if !is_terminal {
        return Err(Diagnostic::new(DiagnosticCode::BunControlFailed));
    }
    println!("{url}");
    Ok(())
}

struct RuntimeDirectory {
    path: PathBuf,
}

impl RuntimeDirectory {
    fn from_environment() -> Result<Self, Diagnostic> {
        let path = std::env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .ok_or(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
        Self::from_path(path)
    }

    fn from_path(path: PathBuf) -> Result<Self, Diagnostic> {
        verify_private_directory(&path)?;
        Ok(Self { path })
    }

    fn private_child(&self) -> Result<PathBuf, Diagnostic> {
        let path = self.path.join(RUNTIME_DIRECTORY_NAME);
        match std::fs::create_dir(&path) {
            Ok(()) => {
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(DIRECTORY_MODE))
                    .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
        }
        verify_private_directory(&path)?;
        Ok(path)
    }
}

fn verify_private_directory(path: &Path) -> Result<(), Diagnostic> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
    let owner_matches = metadata.uid() == current_uid();
    let private_mode = metadata.mode() & 0o777 == DIRECTORY_MODE;
    if metadata.is_dir() && !metadata.file_type().is_symlink() && owner_matches && private_mode {
        Ok(())
    } else {
        Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))
    }
}

fn current_uid() -> u32 {
    nix::unistd::Uid::effective().as_raw()
}

struct EndpointGuard {
    path: PathBuf,
    bound: bool,
    lock: File,
}

impl EndpointGuard {
    fn prepare(port: u16) -> Result<Self, Diagnostic> {
        let runtime = RuntimeDirectory::from_environment()?;
        Self::prepare_in(&runtime, port)
    }

    fn prepare_in(runtime: &RuntimeDirectory, port: u16) -> Result<Self, Diagnostic> {
        let directory = runtime.private_child()?;
        let lock_path = directory.join(format!("v1-{port}.lock"));
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
        lock.try_lock_exclusive()
            .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
        let endpoint = Self {
            path: directory.join(format!("v1-{port}.sock")),
            bound: false,
            lock,
        };
        endpoint.remove_stale_socket()?;
        Ok(endpoint)
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn bind_listener(&mut self) -> Result<UnixListener, Diagnostic> {
        let listener = UnixListener::bind(&self.path)
            .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
        self.bound = true;
        std::fs::set_permissions(&self.path, std::fs::Permissions::from_mode(SOCKET_MODE))
            .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable))?;
        Ok(listener)
    }

    fn remove_stale_socket(&self) -> Result<(), Diagnostic> {
        let metadata = match std::fs::symlink_metadata(&self.path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(_) => return Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
        };
        if !metadata.file_type().is_socket() {
            return Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable));
        }
        match std::os::unix::net::UnixStream::connect(&self.path) {
            Ok(_) => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
            Err(error) if is_stale_socket_error(&error) => std::fs::remove_file(&self.path)
                .map_err(|_| Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
            Err(_) => Err(Diagnostic::new(DiagnosticCode::NativeIpcUnavailable)),
        }
    }
}

impl Drop for EndpointGuard {
    fn drop(&mut self) {
        if self.bound {
            let _ = std::fs::remove_file(&self.path);
        }
        let _ = FileExt::unlock(&self.lock);
    }
}

fn is_stale_socket_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::ConnectionRefused | io::ErrorKind::NotFound
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permanent_lifecycle_lock_is_reused_after_the_previous_holder_exits()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let lock_path = temporary
            .path()
            .join(RUNTIME_DIRECTORY_NAME)
            .join("v1-8080.lock");

        let first = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        assert!(lock_path.exists());
        let blocked = EndpointGuard::prepare_in(&runtime, 8080).map_err(Diagnostic::code);
        assert!(matches!(blocked, Err(DiagnosticCode::NativeIpcUnavailable)));
        drop(first);
        assert!(lock_path.exists());

        let second = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        drop(second);
        assert!(lock_path.exists());
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_runtime_directories_are_rejected() -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        let target = temporary.path().join("target");
        std::fs::create_dir(&target)?;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(DIRECTORY_MODE))?;
        let link = temporary.path().join("link");
        std::os::unix::fs::symlink(&target, &link)?;
        let result = RuntimeDirectory::from_path(link).map_err(Diagnostic::code);
        assert!(matches!(result, Err(DiagnosticCode::NativeIpcUnavailable)));
        Ok(())
    }

    #[tokio::test]
    async fn private_runtime_child_and_socket_have_exact_owner_modes()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let directory = temporary.path().join(RUNTIME_DIRECTORY_NAME);
        let mut endpoint = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let listener = endpoint
            .bind_listener()
            .map_err(|diagnostic| diagnostic.code().as_str())?;

        assert_eq!(
            std::fs::metadata(&directory)?.mode() & 0o777,
            DIRECTORY_MODE
        );
        assert_eq!(
            std::fs::metadata(endpoint.path())?.mode() & 0o777,
            SOCKET_MODE
        );
        drop(listener);
        drop(endpoint);
        assert!(!directory.join("v1-8080.sock").exists());
        assert!(directory.join("v1-8080.lock").exists());
        Ok(())
    }

    #[test]
    fn stale_cleanup_waits_for_the_permanent_lock_and_live_endpoints_fail_closed()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let directory = runtime
            .private_child()
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let endpoint_path = directory.join("v1-8080.sock");
        let lock_path = directory.join("v1-8080.lock");
        let blocker = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&lock_path)?;
        blocker.try_lock_exclusive()?;
        let stale = std::os::unix::net::UnixListener::bind(&endpoint_path)?;
        drop(stale);
        let blocked = EndpointGuard::prepare_in(&runtime, 8080).map_err(Diagnostic::code);
        assert!(matches!(blocked, Err(DiagnosticCode::NativeIpcUnavailable)));
        assert!(endpoint_path.exists());

        FileExt::unlock(&blocker)?;
        let endpoint = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        assert!(!endpoint_path.exists());

        let live = std::os::unix::net::UnixListener::bind(&endpoint_path)?;
        assert_eq!(
            endpoint.remove_stale_socket().map_err(Diagnostic::code),
            Err(DiagnosticCode::NativeIpcUnavailable)
        );
        drop(live);
        Ok(())
    }

    #[tokio::test]
    async fn uds_server_handles_concurrent_generated_unary_clients_and_cleans_up()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let mut endpoint = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let endpoint_path = endpoint.path().to_path_buf();
        let listener = endpoint
            .bind_listener()
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let instance_id = InstanceId::from_bytes([3_u8; 16]);
        let state = SnapshotState::with_fake_collector(instance_id.clone());
        let shutdown = CancellationToken::new();
        let server = start_server(listener, state, shutdown.clone());

        prove_readiness(endpoint.path(), &instance_id)
            .await
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let channel = Endpoint::try_from("http://[::]:50051")?
            .connect_with_connector(service_fn({
                let path = endpoint.path().to_path_buf();
                move |_: Uri| {
                    let path = path.clone();
                    async move { UnixStream::connect(path).await.map(TokioIo::new) }
                }
            }))
            .await?;
        let mut first = LocalMediaClient::new(channel.clone());
        let mut second = LocalMediaClient::new(channel.clone());
        let mut third = LocalMediaClient::new(channel);
        let request = GetInstanceInfoRequest {};
        let (one, two, three) = tokio::join!(
            first.get_instance_info(request),
            second.get_instance_info(GetInstanceInfoRequest {}),
            third.get_instance_info(GetInstanceInfoRequest {})
        );
        for response in [one?, two?, three?] {
            assert_eq!(response.into_inner().instance_id, instance_id.to_vec());
        }

        shutdown.cancel();
        match server.await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return Err(error.into()),
            Err(error) => return Err(error.into()),
        }
        drop(endpoint);
        assert!(!endpoint_path.exists());
        Ok(())
    }

    #[test]
    fn invalid_endpoint_state_fails_closed_and_remains_untouched()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let directory = runtime
            .private_child()
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let endpoint_path = directory.join("v1-8080.sock");
        std::fs::write(&endpoint_path, b"invalid endpoint state")?;

        let invalid = EndpointGuard::prepare_in(&runtime, 8080).map_err(Diagnostic::code);
        assert!(matches!(invalid, Err(DiagnosticCode::NativeIpcUnavailable)));
        assert_eq!(std::fs::read(&endpoint_path)?, b"invalid endpoint state");
        assert!(directory.join("v1-8080.lock").exists());
        Ok(())
    }

    #[test]
    fn control_record_requires_the_exact_local_origin_and_one_bounded_record() {
        let accepted = parse_control_record(
            b"PAIRING_URL http://127.0.0.1:8080/local/#capability\n",
            8080,
        );
        assert!(accepted.is_ok());
        for invalid in [
            b"PAIRING_URL http://localhost:8080/local/#capability\n".as_slice(),
            b"PAIRING_URL http://user@127.0.0.1:8080/local/#capability\n".as_slice(),
            b"PAIRING_URL http://127.0.0.1:8081/local/#capability\n".as_slice(),
            b"PAIRING_URL https://127.0.0.1:8080/local/#capability\n".as_slice(),
            b"PAIRING_URL http://127.0.0.1:8080/local/?token=value\n".as_slice(),
            b"PAIRING_URL http://127.0.0.1:8080/local/\n".as_slice(),
            b"PAIRING_URL http://127.0.0.1:8080/local/#one\nPAIRING_URL http://127.0.0.1:8080/local/#two\n".as_slice(),
        ] {
            assert_eq!(
                parse_control_record(invalid, 8080).map_err(Diagnostic::code),
                Err(DiagnosticCode::BunControlFailed)
            );
        }
    }

    #[tokio::test]
    async fn live_child_pairing_record_is_delivered_without_waiting_for_stdout_eof()
    -> Result<(), Box<dyn std::error::Error>> {
        let shutdown = CancellationToken::new();
        let cancel_after_delivery = shutdown.clone();
        let delivered = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let observed = delivered.clone();
        let mut command = Command::new("sh");
        command
            .arg("-c")
            .arg(
                "printf 'PAIRING_URL http://127.0.0.1:8080/local/#capability\\n'; \
                 while read -r line; do :; done",
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped());

        let result = supervise_bun_command(command, 8080, shutdown, move |url| {
            observed.store(true, std::sync::atomic::Ordering::SeqCst);
            cancel_after_delivery.cancel();
            if url.as_str() == "http://127.0.0.1:8080/local/#capability" {
                Ok(())
            } else {
                Err(Diagnostic::new(DiagnosticCode::BunControlFailed))
            }
        })
        .await;

        assert_eq!(
            result.map_err(Diagnostic::code),
            Err(DiagnosticCode::BunExited)
        );
        assert!(delivered.load(std::sync::atomic::Ordering::SeqCst));
        Ok(())
    }

    #[test]
    fn print_handoff_rejects_non_terminal_output() -> Result<(), Box<dyn std::error::Error>> {
        let url = url::Url::parse("http://127.0.0.1:8080/local/#capability")?;
        assert_eq!(
            print_url_to_terminal(&url, false).map_err(Diagnostic::code),
            Err(DiagnosticCode::BunControlFailed)
        );
        Ok(())
    }

    #[tokio::test]
    async fn forced_child_shutdown_reports_the_stable_diagnostic_and_reaps()
    -> Result<(), Box<dyn std::error::Error>> {
        let mut child = Command::new("sleep")
            .arg("60")
            .stdin(Stdio::piped())
            .spawn()?;
        let control = match child.stdin.take() {
            Some(control) => control,
            None => return Err("missing child control pipe".into()),
        };
        let result = stop_child_with_deadlines(
            &mut child,
            control,
            Duration::from_millis(10),
            Duration::from_secs(1),
        )
        .await;
        assert_eq!(
            result.map_err(Diagnostic::code),
            Err(DiagnosticCode::LifecycleForcedTermination)
        );
        assert!(child.id().is_none());
        Ok(())
    }

    #[tokio::test]
    async fn graceful_child_shutdown_reaps_an_already_exiting_process()
    -> Result<(), Box<dyn std::error::Error>> {
        let mut child = Command::new("true").stdin(Stdio::piped()).spawn()?;
        let control = match child.stdin.take() {
            Some(control) => control,
            None => return Err("missing child control pipe".into()),
        };
        stop_child(&mut child, control)
            .await
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        assert!(child.id().is_none());
        Ok(())
    }

    #[tokio::test]
    async fn graceful_control_seam_writes_revoke_then_shutdown_to_a_live_peer()
    -> Result<(), Box<dyn std::error::Error>> {
        let (mut writer, mut reader) = tokio::io::duplex(64);
        let received = tokio::spawn(async move {
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).await.map(|_| bytes)
        });
        send_graceful_shutdown(&mut writer).await?;
        drop(writer);
        assert_eq!(received.await??, b"REVOKE_SESSIONS\nSHUTDOWN\n");
        Ok(())
    }

    #[tokio::test]
    async fn server_completion_cancels_and_joins_the_child() {
        let child_shutdown = CancellationToken::new();
        let child_observed_shutdown =
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let observed = child_observed_shutdown.clone();
        let mut server = tokio::spawn(async { Ok::<(), tonic::transport::Error>(()) });
        let mut child = tokio::spawn({
            let child_shutdown = child_shutdown.clone();
            async move {
                child_shutdown.cancelled().await;
                observed.store(true, std::sync::atomic::Ordering::SeqCst);
                Ok(())
            }
        });
        let result = supervise_lifecycle(
            &mut server,
            &mut child,
            CancellationToken::new(),
            child_shutdown,
            CancellationToken::new(),
        )
        .await;
        assert_eq!(
            result.map_err(Diagnostic::code),
            Err(DiagnosticCode::NativeIpcUnavailable)
        );
        assert!(child_observed_shutdown.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn lifecycle_reports_a_forced_server_stop() {
        let mut server = tokio::spawn(async {
            std::future::pending::<()>().await;
            Ok::<(), tonic::transport::Error>(())
        });
        let mut child = tokio::spawn(async { Ok::<(), Diagnostic>(()) });
        let result = supervise_lifecycle_with_deadlines(
            &mut server,
            &mut child,
            CancellationToken::new(),
            CancellationToken::new(),
            CancellationToken::new(),
            Duration::from_millis(10),
            Duration::from_secs(1),
        )
        .await;
        assert_eq!(
            result.map_err(Diagnostic::code),
            Err(DiagnosticCode::LifecycleForcedTermination)
        );
    }

    #[tokio::test]
    async fn external_shutdown_cancels_and_drains_server_and_child() {
        let external = CancellationToken::new();
        external.cancel();
        let server_shutdown = CancellationToken::new();
        let child_shutdown = CancellationToken::new();
        let server_observed_shutdown =
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let child_observed_shutdown =
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let server_observed = server_observed_shutdown.clone();
        let child_observed = child_observed_shutdown.clone();
        let mut server = tokio::spawn({
            let server_shutdown = server_shutdown.clone();
            async move {
                server_shutdown.cancelled().await;
                server_observed.store(true, std::sync::atomic::Ordering::SeqCst);
                Ok::<(), tonic::transport::Error>(())
            }
        });
        let mut child = tokio::spawn({
            let child_shutdown = child_shutdown.clone();
            async move {
                child_shutdown.cancelled().await;
                child_observed.store(true, std::sync::atomic::Ordering::SeqCst);
                Ok(())
            }
        });
        let result = supervise_lifecycle(
            &mut server,
            &mut child,
            server_shutdown,
            child_shutdown,
            external,
        )
        .await;
        assert_eq!(
            result.map_err(Diagnostic::code),
            Err(DiagnosticCode::NativeIpcUnavailable)
        );
        assert!(server_observed_shutdown.load(std::sync::atomic::Ordering::SeqCst));
        assert!(child_observed_shutdown.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[tokio::test]
    async fn second_instance_is_excluded_and_teardown_removes_endpoint_before_unlock()
    -> Result<(), Box<dyn std::error::Error>> {
        let temporary = tempfile::tempdir()?;
        std::fs::set_permissions(
            temporary.path(),
            std::fs::Permissions::from_mode(DIRECTORY_MODE),
        )?;
        let runtime = RuntimeDirectory::from_path(temporary.path().to_path_buf())
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let mut endpoint = EndpointGuard::prepare_in(&runtime, 8080)
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        let socket_path = endpoint.path().to_path_buf();
        let lock_path = temporary
            .path()
            .join(RUNTIME_DIRECTORY_NAME)
            .join("v1-8080.lock");
        let listener = endpoint
            .bind_listener()
            .map_err(|diagnostic| diagnostic.code().as_str())?;
        assert!(socket_path.exists());
        assert!(lock_path.exists());
        let blocked = EndpointGuard::prepare_in(&runtime, 8080).map_err(Diagnostic::code);
        assert!(matches!(blocked, Err(DiagnosticCode::NativeIpcUnavailable)));
        assert!(socket_path.exists());

        let lock_observer = OpenOptions::new().read(true).write(true).open(&lock_path)?;
        let observed_socket = socket_path.clone();
        let waiter = std::thread::spawn(move || -> io::Result<bool> {
            FileExt::lock_exclusive(&lock_observer)?;
            let endpoint_was_present = observed_socket.exists();
            FileExt::unlock(&lock_observer)?;
            Ok(endpoint_was_present)
        });
        drop(listener);
        drop(endpoint);
        let endpoint_was_present_after_lock = waiter
            .join()
            .map_err(|_| io::Error::other("lock observer thread failed"))??;
        assert!(!endpoint_was_present_after_lock);
        assert!(!socket_path.exists());
        assert!(lock_path.exists());
        Ok(())
    }

    #[test]
    fn child_arguments_expose_only_the_native_endpoint_and_expected_instance() {
        let endpoint = Path::new("/private/runtime/phrasic/v1-8080.sock");
        let command = child_command(endpoint, &InstanceId::from_bytes([1_u8; 16]));
        let debug = format!("{command:?}");
        assert!(debug.contains("--native-endpoint"));
        assert!(debug.contains("--expected-instance-id"));
        assert!(!debug.contains("api-major"));
    }
}
