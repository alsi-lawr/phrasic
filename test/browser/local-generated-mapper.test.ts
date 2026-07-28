import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  AmbiguityReason,
  AmbiguousSnapshot,
  Artwork,
  ArtworkFormat,
  AvailableSnapshot,
  CapabilityState,
  CapabilityStatus,
  GetSnapshotResponse,
  PlaybackActivity,
  PlaybackItem,
  SelectionReason,
  Timeline,
} from "../../browser/generated/phrasic/local/v1/local_media_pb.js";
import { mapGeneratedSnapshot } from "../../browser/local/generated-mapper.ts";
import { unavailableLocalLastSuccessfulSnapshot } from "../../domain/local-playback.ts";

const pngArtwork = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
]);

test("generated Local snapshots map partial playback without fabricated fields", () => {
  const item = new PlaybackItem();
  item.setTitle("Generated title");
  item.setCreator("Generated creator");
  const timeline = new Timeline();
  timeline.setPositionMilliseconds(3_000);
  const available = new AvailableSnapshot();
  available.setActivity(PlaybackActivity.PLAYBACK_ACTIVITY_PLAYING);
  available.setItem(item);
  available.setTimeline(timeline);
  available.setSelectionReason(SelectionReason.SELECTION_REASON_SOLE_PLAYING);
  const response = baseResponse();
  response.setAvailable(available);

  const mapped = mapGeneratedSnapshot(
    response,
    unavailableLocalLastSuccessfulSnapshot(),
  );

  assert.equal(mapped.presentation.kind, "content");
  if (mapped.presentation.kind !== "content") {
    throw new Error("Generated Local playback did not map to content.");
  }
  assert.equal(
    mapped.presentation.snapshot.metadata.title.toString(),
    "Generated title",
  );
  assert.equal(
    mapped.presentation.snapshot.metadata.creator?.toString(),
    "Generated creator",
  );
  assert.equal(mapped.presentation.snapshot.metadata.collection, undefined);
  assert.equal(mapped.presentation.snapshot.metadata.destination, undefined);
});

test("generated Local artwork maps to a CSP-compatible embedded image", () => {
  const item = new PlaybackItem();
  item.setTitle("Artwork title");
  const artwork = generatedArtwork(
    ArtworkFormat.ARTWORK_FORMAT_PNG,
    pngArtwork,
  );
  item.setArtwork(artwork);

  const mapped = mapGeneratedSnapshot(
    availableResponse(item),
    unavailableLocalLastSuccessfulSnapshot(),
  );

  assert.equal(mapped.presentation.kind, "content");
  if (mapped.presentation.kind !== "content") {
    throw new Error("Generated artwork did not map to content.");
  }
  assert.equal(
    mapped.presentation.snapshot.metadata.artwork?.toString(),
    `data:image/png;base64,${artwork.getData_asB64()}`,
  );
});

test("generated Local artwork is not rejected for its byte size", () => {
  const data = new Uint8Array(3 * 1_024 * 1_024);
  data.set(pngArtwork);
  const item = new PlaybackItem();
  item.setTitle("Large artwork title");
  item.setArtwork(generatedArtwork(ArtworkFormat.ARTWORK_FORMAT_PNG, data));

  const mapped = mapGeneratedSnapshot(
    availableResponse(item),
    unavailableLocalLastSuccessfulSnapshot(),
  );

  assert.equal(mapped.presentation.kind, "content");
  if (mapped.presentation.kind !== "content") {
    throw new Error("Large generated artwork did not map to content.");
  }
  const artwork = mapped.presentation.snapshot.metadata.artwork?.toString();
  assert.equal(artwork?.startsWith("data:image/png;base64,"), true);
  assert.ok((artwork?.length ?? 0) > data.byteLength);
});

test("invalid generated artwork falls back without discarding playback metadata", () => {
  const cases: ReadonlyArray<Artwork> = [
    generatedArtwork(
      ArtworkFormat.ARTWORK_FORMAT_PNG,
      new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xd9]),
    ),
    generatedArtwork(ArtworkFormat.ARTWORK_FORMAT_UNSPECIFIED, pngArtwork),
  ];

  for (const artwork of cases) {
    const item = new PlaybackItem();
    item.setTitle("Retained title");
    item.setArtwork(artwork);
    const mapped = mapGeneratedSnapshot(
      availableResponse(item),
      unavailableLocalLastSuccessfulSnapshot(),
    );

    assert.equal(mapped.presentation.kind, "content");
    if (mapped.presentation.kind !== "content") {
      throw new Error("Invalid artwork discarded valid playback metadata.");
    }
    assert.equal(
      mapped.presentation.snapshot.metadata.title.toString(),
      "Retained title",
    );
    assert.equal(mapped.presentation.snapshot.metadata.artwork, undefined);
  }
});

test("generated ambiguity and unsupported capability remain distinct", () => {
  const ambiguous = new AmbiguousSnapshot();
  ambiguous.setReason(AmbiguityReason.AMBIGUITY_REASON_MULTIPLE_PLAYING);
  const ambiguousResponse = baseResponse();
  ambiguousResponse.setAmbiguous(ambiguous);
  const ambiguity = mapGeneratedSnapshot(
    ambiguousResponse,
    unavailableLocalLastSuccessfulSnapshot(),
  );
  assert.equal(ambiguity.presentation.kind, "unavailable");
  if (ambiguity.presentation.kind !== "unavailable") {
    throw new Error("Generated ambiguity did not map to unavailable.");
  }
  assert.equal(ambiguity.presentation.status, "ambiguous-sources");

  const unsupported = baseResponse();
  const capability = new CapabilityState();
  capability.setStatus(CapabilityStatus.CAPABILITY_STATUS_UNSUPPORTED_PLATFORM);
  unsupported.setCapability(capability);
  const unsupportedMapped = mapGeneratedSnapshot(
    unsupported,
    unavailableLocalLastSuccessfulSnapshot(),
  );
  assert.equal(unsupportedMapped.presentation.kind, "unavailable");
  if (unsupportedMapped.presentation.kind !== "unavailable") {
    throw new Error("Unsupported Local capability did not map to unavailable.");
  }
  assert.equal(unsupportedMapped.presentation.status, "unsupported-platform");
});

function baseResponse(): GetSnapshotResponse {
  const response = new GetSnapshotResponse();
  response.setInstanceId(new Uint8Array(16).fill(1));
  response.setObservedAtMonotonicMilliseconds(1_000);
  response.setPollHintMilliseconds(1_000);
  const capability = new CapabilityState();
  capability.setStatus(CapabilityStatus.CAPABILITY_STATUS_AVAILABLE);
  response.setCapability(capability);
  return response;
}

function availableResponse(item: PlaybackItem): GetSnapshotResponse {
  const available = new AvailableSnapshot();
  available.setActivity(PlaybackActivity.PLAYBACK_ACTIVITY_PLAYING);
  available.setItem(item);
  available.setSelectionReason(SelectionReason.SELECTION_REASON_SOLE_PLAYING);
  const response = baseResponse();
  response.setAvailable(available);
  return response;
}

function generatedArtwork(format: ArtworkFormat, data: Uint8Array): Artwork {
  const artwork = new Artwork();
  artwork.setFormat(format);
  artwork.setData(data);
  return artwork;
}
