#![forbid(unsafe_code)]

use std::path::PathBuf;

use phrasic_rpc::local::GetSnapshotResponse;
use prost::Message;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/local-media/v1/snapshot.bin")
}

#[test]
fn golden_snapshot_round_trips_with_the_generated_rust_contract()
-> Result<(), Box<dyn std::error::Error>> {
    let fixture = std::fs::read(fixture_path())?;
    let snapshot = GetSnapshotResponse::decode(fixture.as_slice())?;

    assert_eq!(snapshot.instance_id.len(), 16);
    assert_eq!(snapshot.revision, 42);
    assert_eq!(snapshot.poll_hint_milliseconds, 1_000);
    assert_eq!(snapshot.encode_to_vec(), fixture);
    Ok(())
}
