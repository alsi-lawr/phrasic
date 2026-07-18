#![forbid(unsafe_code)]

//! Reserved target-neutral boundary for the later generated native RPC contract.
//!
//! T-005 deliberately defines no wire messages, transport, listener, or protocol
//! implementation here.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RpcBoundary {
    Deferred,
}

#[must_use]
pub const fn boundary() -> RpcBoundary {
    RpcBoundary::Deferred
}
