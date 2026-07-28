#![forbid(unsafe_code)]

//! Generated Local Media RPC contract and immutable unary service.

pub mod local {
    tonic::include_proto!("phrasic.local.v1");
}

mod service;

pub use service::{InstanceId, LocalMediaService, SnapshotState};
