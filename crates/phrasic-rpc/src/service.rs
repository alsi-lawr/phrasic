//! Immutable snapshot state and the generated unary Local Media service.
//!
//! This module owns only the in-process read model. Platform adapters choose
//! when to replace its value; generated protobuf messages remain the transport
//! representation at the boundary.

use std::sync::Arc;
use std::time::Instant;

use tokio::sync::{RwLock, Semaphore};
use tonic::{Request, Response, Status};

use crate::local::get_snapshot_response::Outcome;
use crate::local::local_media_server::LocalMedia;
use crate::local::{
    CapabilityState, CapabilityStatus, GetInstanceInfoRequest, GetInstanceInfoResponse,
    GetSnapshotRequest, GetSnapshotResponse, UnavailableReason, UnavailableSnapshot,
};

pub const INSTANCE_ID_LENGTH: usize = 16;
pub const DEFAULT_POLL_HINT_MILLISECONDS: u32 = 1_000;
const MAX_IN_FLIGHT_REQUESTS: usize = 16;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstanceId([u8; INSTANCE_ID_LENGTH]);

impl InstanceId {
    pub fn random() -> Result<Self, getrandom::Error> {
        let mut value = [0_u8; INSTANCE_ID_LENGTH];
        getrandom::fill(&mut value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub const fn from_bytes(value: [u8; INSTANCE_ID_LENGTH]) -> Self {
        Self(value)
    }

    #[must_use]
    pub fn to_vec(&self) -> Vec<u8> {
        self.0.to_vec()
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; INSTANCE_ID_LENGTH] {
        &self.0
    }
}

#[derive(Clone)]
pub struct SnapshotState {
    instance_id: InstanceId,
    started_at: Instant,
    snapshot: Arc<RwLock<GetSnapshotResponse>>,
}

impl SnapshotState {
    #[must_use]
    pub fn with_fake_collector(instance_id: InstanceId) -> Self {
        let snapshot = unavailable_snapshot(&instance_id, 0);
        Self {
            instance_id,
            started_at: Instant::now(),
            snapshot: Arc::new(RwLock::new(snapshot)),
        }
    }

    #[must_use]
    pub fn instance_id(&self) -> &InstanceId {
        &self.instance_id
    }

    pub async fn replace(&self, mut snapshot: GetSnapshotResponse) {
        let mut current = self.snapshot.write().await;
        snapshot.instance_id = self.instance_id.to_vec();
        snapshot.revision = current.revision.saturating_add(1);
        snapshot.observed_at_monotonic_milliseconds = self.elapsed_milliseconds();
        *current = snapshot;
    }

    pub async fn read(&self) -> GetSnapshotResponse {
        self.snapshot.read().await.clone()
    }

    fn elapsed_milliseconds(&self) -> u64 {
        u64::try_from(self.started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
}

#[derive(Clone)]
pub struct LocalMediaService {
    state: SnapshotState,
    request_slots: Arc<Semaphore>,
}

impl LocalMediaService {
    #[must_use]
    pub fn new(state: SnapshotState) -> Self {
        Self {
            state,
            request_slots: Arc::new(Semaphore::new(MAX_IN_FLIGHT_REQUESTS)),
        }
    }

    fn try_acquire_request(&self) -> Result<tokio::sync::OwnedSemaphorePermit, Status> {
        self.request_slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("request capacity exhausted"))
    }

    #[must_use]
    pub fn state(&self) -> &SnapshotState {
        &self.state
    }
}

#[tonic::async_trait]
impl LocalMedia for LocalMediaService {
    async fn get_instance_info(
        &self,
        _request: Request<GetInstanceInfoRequest>,
    ) -> Result<Response<GetInstanceInfoResponse>, Status> {
        let _request_slot = self.try_acquire_request()?;
        let snapshot = self.state.read().await;
        Ok(Response::new(GetInstanceInfoResponse {
            instance_id: self.state.instance_id.to_vec(),
            capability: snapshot.capability,
        }))
    }

    async fn get_snapshot(
        &self,
        request: Request<GetSnapshotRequest>,
    ) -> Result<Response<GetSnapshotResponse>, Status> {
        let _request_slot = self.try_acquire_request()?;
        if request.into_inner().expected_instance_id != self.state.instance_id.to_vec() {
            return Err(Status::failed_precondition("instance unavailable"));
        }

        Ok(Response::new(self.state.read().await))
    }
}

fn unavailable_snapshot(instance_id: &InstanceId, revision: u64) -> GetSnapshotResponse {
    GetSnapshotResponse {
        instance_id: instance_id.to_vec(),
        revision,
        observed_at_monotonic_milliseconds: 0,
        poll_hint_milliseconds: DEFAULT_POLL_HINT_MILLISECONDS,
        capability: Some(CapabilityState {
            status: CapabilityStatus::NativeSessionUnavailable.into(),
        }),
        outcome: Some(Outcome::Unavailable(UnavailableSnapshot {
            reason: UnavailableReason::NativeSessionUnavailable.into(),
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local::local_media_server::LocalMedia;

    fn state() -> SnapshotState {
        SnapshotState::with_fake_collector(InstanceId::from_bytes([7_u8; INSTANCE_ID_LENGTH]))
    }

    #[tokio::test]
    async fn service_returns_the_generated_read_only_snapshot_for_its_instance()
    -> Result<(), Box<dyn std::error::Error>> {
        let service = LocalMediaService::new(state());
        let info = service
            .get_instance_info(Request::new(GetInstanceInfoRequest {}))
            .await?
            .into_inner();
        let snapshot = service
            .get_snapshot(Request::new(GetSnapshotRequest {
                expected_instance_id: info.instance_id.clone(),
            }))
            .await?
            .into_inner();

        assert_eq!(info.instance_id, vec![7_u8; INSTANCE_ID_LENGTH]);
        assert_eq!(snapshot.instance_id, info.instance_id);
        assert_eq!(
            info.capability.map(|capability| capability.status),
            Some(CapabilityStatus::NativeSessionUnavailable.into())
        );
        assert_eq!(snapshot.revision, 0);
        assert_eq!(
            snapshot.poll_hint_milliseconds,
            DEFAULT_POLL_HINT_MILLISECONDS
        );
        assert!(matches!(snapshot.outcome, Some(Outcome::Unavailable(_))));
        Ok(())
    }

    #[tokio::test]
    async fn service_rejects_a_snapshot_request_for_a_replaced_instance()
    -> Result<(), Box<dyn std::error::Error>> {
        let service = LocalMediaService::new(state());
        let result = service
            .get_snapshot(Request::new(GetSnapshotRequest {
                expected_instance_id: vec![0_u8; INSTANCE_ID_LENGTH],
            }))
            .await;

        let status = match result {
            Ok(_) => return Err("snapshot unexpectedly succeeded".into()),
            Err(status) => status,
        };
        assert_eq!(status.code(), tonic::Code::FailedPrecondition);
        assert_eq!(status.message(), "instance unavailable");
        Ok(())
    }

    #[tokio::test]
    async fn replacement_is_an_atomic_immutable_snapshot_read() {
        let state = state();
        let mut replacement = state.read().await;
        replacement.revision = 9;
        state.replace(replacement).await;

        let read = state.read().await;
        assert_eq!(read.revision, 1);
        assert_eq!(read.instance_id, vec![7_u8; INSTANCE_ID_LENGTH]);
    }

    #[tokio::test]
    async fn service_returns_resource_exhausted_when_its_production_capacity_is_held() {
        let service = LocalMediaService::new(state());
        let mut permits = Vec::new();
        for _ in 0..MAX_IN_FLIGHT_REQUESTS {
            permits.push(service.try_acquire_request());
        }
        assert!(permits.iter().all(Result::is_ok));
        let result = service
            .get_instance_info(Request::new(GetInstanceInfoRequest {}))
            .await;
        assert_eq!(
            result.err().map(|status| status.code()),
            Some(tonic::Code::ResourceExhausted)
        );
    }

    #[tokio::test]
    async fn concurrent_replacements_assign_strictly_monotonic_revisions() {
        let state = state();
        let mut replacements = Vec::new();
        for _ in 0..8 {
            let state = state.clone();
            replacements.push(tokio::spawn(async move {
                state.replace(GetSnapshotResponse::default()).await;
            }));
        }
        for replacement in replacements {
            assert!(replacement.await.is_ok());
        }
        assert_eq!(state.read().await.revision, 8);
    }
}
