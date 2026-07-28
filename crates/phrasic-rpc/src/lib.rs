#![forbid(unsafe_code)]

//! Generated Local Media RPC contract and immutable unary service.

pub mod local {
    tonic::include_proto!("phrasic.local.v1");
}

mod service;

pub const MAXIMUM_ARTWORK_BYTES: usize = 512 * 1024;

pub use service::{InstanceId, LocalMediaService, SnapshotState};
