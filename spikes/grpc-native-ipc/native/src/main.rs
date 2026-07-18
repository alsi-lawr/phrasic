#![forbid(unsafe_code)]

#[cfg(not(any(
    all(
        target_arch = "x86_64",
        target_env = "gnu",
        target_os = "linux",
        target_vendor = "unknown"
    ),
    all(
        target_arch = "x86_64",
        target_env = "msvc",
        target_os = "windows",
        target_vendor = "pc"
    ),
)))]
compile_error!("The T-006 native IPC spike supports only Linux GNU x64 and Windows MSVC x64.");

use std::ffi::OsString;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Duration;

use fixture::interop_server::{Interop, InteropServer};
use fixture::{Behavior, ProbeRequest, ProbeResponse};
use tonic::metadata::{MetadataMap, MetadataValue};
use tonic::{Code, Request, Response, Status};

#[cfg(all(
    target_arch = "x86_64",
    target_env = "gnu",
    target_os = "linux",
    target_vendor = "unknown"
))]
#[path = "platform/linux.rs"]
mod platform;
#[cfg(all(
    target_arch = "x86_64",
    target_env = "msvc",
    target_os = "windows",
    target_vendor = "pc"
))]
#[path = "platform/windows.rs"]
mod platform;

pub mod fixture {
    tonic::include_proto!("phrasic.spike.v1");
}

type SpikeResult<T> = Result<T, Box<dyn std::error::Error>>;

#[derive(Debug)]
struct SpikeError(&'static str);

impl fmt::Display for SpikeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}

impl std::error::Error for SpikeError {}

struct Settings {
    endpoint: PathBuf,
    shutdown_file: PathBuf,
}

impl Settings {
    fn parse(arguments: impl IntoIterator<Item = OsString>) -> Result<Self, SpikeError> {
        let values = arguments.into_iter().collect::<Vec<_>>();
        match values.as_slice() {
            [_, command, endpoint, shutdown_file] if command == "serve-native" => Ok(Self {
                endpoint: PathBuf::from(endpoint),
                shutdown_file: PathBuf::from(shutdown_file),
            }),
            _ => Err(SpikeError(
                "usage: phrasic-grpc-native-ipc-spike serve-native <endpoint> <shutdown-file>",
            )),
        }
    }
}

#[derive(Clone)]
pub(crate) struct InteropService;

#[tonic::async_trait]
impl Interop for InteropService {
    async fn probe(
        &self,
        request: Request<ProbeRequest>,
    ) -> Result<Response<ProbeResponse>, Status> {
        let request = request.into_inner();
        validate_request(&request)?;
        let behavior = Behavior::try_from(request.behavior)
            .map_err(|_| Status::invalid_argument("unknown behavior"))?;
        let mut completion = RequestCompletion::new(request.request_id.clone());

        match behavior {
            Behavior::Success => {
                completion.mark_completed();
                Ok(success_response(request))
            }
            Behavior::Status => {
                completion.mark_completed();
                let mut trailers = MetadataMap::new();
                trailers.insert("x-spike-trailer", MetadataValue::from_static("rust-status"));
                Err(Status::with_metadata(
                    Code::FailedPrecondition,
                    "intentional status",
                    trailers,
                ))
            }
            Behavior::Delay => {
                tokio::time::sleep(Duration::from_millis(u64::from(request.delay_milliseconds)))
                    .await;
                completion.mark_completed();
                Ok(success_response(request))
            }
        }
    }
}

fn validate_request(request: &ProbeRequest) -> Result<(), Status> {
    let valid_identifier = !request.request_id.is_empty()
        && request
            .request_id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-');
    if !valid_identifier {
        return Err(Status::invalid_argument("invalid request identifier"));
    }
    if request.delay_milliseconds > 10_000 {
        return Err(Status::invalid_argument("delay exceeds spike bound"));
    }
    Ok(())
}

fn success_response(request: ProbeRequest) -> Response<ProbeResponse> {
    let mut response = Response::new(ProbeResponse {
        request_id: request.request_id,
        payload: format!("native:{}", request.payload),
        native_transport: platform::NATIVE_TRANSPORT.to_owned(),
    });
    response.metadata_mut().insert(
        "x-spike-native-transport",
        MetadataValue::from_static(platform::NATIVE_TRANSPORT),
    );
    response
}

struct RequestCompletion {
    request_id: String,
    completed: bool,
}

impl RequestCompletion {
    fn new(request_id: String) -> Self {
        Self {
            request_id,
            completed: false,
        }
    }

    fn mark_completed(&mut self) {
        self.completed = true;
    }
}

impl Drop for RequestCompletion {
    fn drop(&mut self) {
        if !self.completed {
            eprintln!("EVENT cancellation request_id={}", self.request_id);
        }
    }
}

pub(crate) async fn wait_for_shutdown_file(path: &Path) {
    loop {
        match tokio::fs::metadata(path).await {
            Ok(_) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
            Err(_) => {
                eprintln!("EVENT shutdown-watch-failed");
                return;
            }
        }
    }
}

pub(crate) fn announce_ready() -> std::io::Result<()> {
    println!("READY transport={}", platform::NATIVE_TRANSPORT);
    std::io::stdout().flush()
}

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("native-spike-failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> SpikeResult<()> {
    let settings = Settings::parse(std::env::args_os())?;
    let service = InteropServer::new(InteropService);
    platform::serve(&settings.endpoint, &settings.shutdown_file, service).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(behavior: Behavior) -> Request<ProbeRequest> {
        Request::new(ProbeRequest {
            request_id: "rust-test".to_owned(),
            payload: "fixture".to_owned(),
            behavior: behavior.into(),
            delay_milliseconds: 0,
        })
    }

    #[tokio::test]
    async fn success_returns_the_compiled_native_transport()
    -> Result<(), Box<dyn std::error::Error>> {
        let response = InteropService.probe(request(Behavior::Success)).await?;
        assert_eq!(response.get_ref().payload, "native:fixture");
        assert_eq!(
            response.get_ref().native_transport,
            platform::NATIVE_TRANSPORT
        );
        Ok(())
    }

    #[tokio::test]
    async fn status_returns_failed_precondition_with_trailer_metadata()
    -> Result<(), Box<dyn std::error::Error>> {
        let result = InteropService.probe(request(Behavior::Status)).await;
        let status = result
            .err()
            .ok_or(SpikeError("status behavior unexpectedly succeeded"))?;
        assert_eq!(status.code(), Code::FailedPrecondition);
        assert_eq!(
            status.metadata().get("x-spike-trailer"),
            Some(&MetadataValue::from_static("rust-status"))
        );
        Ok(())
    }
}
