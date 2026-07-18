use std::io;
use std::path::Path;

use tokio::net::UnixListener;
use tokio_stream::wrappers::UnixListenerStream;
use tonic::transport::Server;

use crate::fixture::interop_server::InteropServer;
use crate::{InteropService, SpikeResult, announce_ready, wait_for_shutdown_file};

pub(crate) const NATIVE_TRANSPORT: &str = "linux-uds";

pub(crate) async fn serve(
    endpoint: &Path,
    shutdown_file: &Path,
    service: InteropServer<InteropService>,
) -> SpikeResult<()> {
    remove_socket_if_present(endpoint).await?;
    let listener = UnixListener::bind(endpoint)?;
    let incoming = UnixListenerStream::new(listener);
    announce_ready()?;

    let server_result = Server::builder()
        .add_service(service)
        .serve_with_incoming_shutdown(incoming, wait_for_shutdown_file(shutdown_file))
        .await;
    let cleanup_result = remove_socket_if_present(endpoint).await;

    server_result?;
    cleanup_result?;
    Ok(())
}

async fn remove_socket_if_present(endpoint: &Path) -> io::Result<()> {
    match tokio::fs::remove_file(endpoint).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
