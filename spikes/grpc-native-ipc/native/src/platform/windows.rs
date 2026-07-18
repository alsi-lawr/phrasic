use std::io;
use std::path::Path;
use std::pin::Pin;
use std::task::{Context, Poll};

use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::windows::named_pipe::{NamedPipeServer, PipeMode, ServerOptions};
use tokio::sync::{mpsc, watch};
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Server;
use tonic::transport::server::Connected;

use crate::fixture::interop_server::InteropServer;
use crate::{InteropService, SpikeError, SpikeResult, announce_ready, wait_for_shutdown_file};

pub(crate) const NATIVE_TRANSPORT: &str = "windows-named-pipe";

pub(crate) async fn serve(
    endpoint: &Path,
    shutdown_file: &Path,
    service: InteropServer<InteropService>,
) -> SpikeResult<()> {
    let endpoint = endpoint
        .to_str()
        .ok_or(SpikeError("named-pipe endpoint must be UTF-8"))?
        .to_owned();
    let first_pipe = create_pipe(&endpoint, true)?;
    let (incoming_sender, incoming_receiver) = mpsc::channel(16);
    let (shutdown_sender, shutdown_receiver) = watch::channel(false);
    let accept_task = tokio::spawn(accept_connections(
        endpoint,
        first_pipe,
        incoming_sender,
        shutdown_receiver,
    ));
    announce_ready()?;

    let shutdown_signal = async {
        wait_for_shutdown_file(shutdown_file).await;
        if shutdown_sender.send(true).is_err() {
            eprintln!("EVENT named-pipe-acceptor-already-stopped");
        }
    };
    let server_result = Server::builder()
        .add_service(service)
        .serve_with_incoming_shutdown(ReceiverStream::new(incoming_receiver), shutdown_signal)
        .await;
    let accept_result = accept_task.await;

    server_result?;
    accept_result?;
    Ok(())
}

fn create_pipe(endpoint: &str, first_instance: bool) -> io::Result<NamedPipeServer> {
    let mut options = ServerOptions::new();
    options.pipe_mode(PipeMode::Byte);
    options.first_pipe_instance(first_instance);
    options.create(endpoint)
}

async fn accept_connections(
    endpoint: String,
    first_pipe: NamedPipeServer,
    incoming: mpsc::Sender<Result<IpcStream, io::Error>>,
    mut shutdown: watch::Receiver<bool>,
) {
    let mut pending = Some(first_pipe);
    loop {
        let pipe = match pending.take() {
            Some(pipe) => pipe,
            None => return,
        };
        tokio::select! {
            connection = pipe.connect() => {
                if let Err(error) = connection {
                    send_accept_error(&incoming, error).await;
                    return;
                }
            }
            changed = shutdown.changed() => {
                if changed.is_err() {
                    eprintln!("EVENT named-pipe-shutdown-sender-dropped");
                }
                return;
            }
        }

        let next_pipe = match create_pipe(&endpoint, false) {
            Ok(next_pipe) => next_pipe,
            Err(error) => {
                send_accept_error(&incoming, error).await;
                return;
            }
        };
        if incoming.send(Ok(IpcStream::new(pipe))).await.is_err() {
            return;
        }
        pending = Some(next_pipe);
    }
}

async fn send_accept_error(
    incoming: &mpsc::Sender<Result<IpcStream, io::Error>>,
    error: io::Error,
) {
    if incoming.send(Err(error)).await.is_err() {
        eprintln!("EVENT named-pipe-accept-error-unobserved");
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
    ) -> Poll<Result<usize, io::Error>> {
        Pin::new(&mut self.inner).poll_write(context, buffer)
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Result<(), io::Error>> {
        Pin::new(&mut self.inner).poll_flush(context)
    }

    fn poll_shutdown(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
    ) -> Poll<Result<(), io::Error>> {
        Pin::new(&mut self.inner).poll_shutdown(context)
    }
}
