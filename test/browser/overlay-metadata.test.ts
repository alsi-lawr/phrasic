import assert from "node:assert/strict";
import test from "node:test";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import {
  DisplayText,
  PlaybackSnapshot,
  TrackItem,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import {
  metadataViewForOverlayState,
  overlayItemIdentityKey,
} from "../../components/overlay/overlay-metadata.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("overlay metadata maps a track to its normalized title, artists, and album", () => {
  const state = expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
  const metadata = metadataViewForOverlayState(state);

  assert.equal(metadata.kind, "track");
  if (metadata.kind !== "track") {
    throw new Error("Expected track metadata.");
  }
  assert.equal(state.kind, "playing");
  if (state.kind !== "playing" || state.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track state.");
  }
  assert.equal(metadata.presentation.kind, "now-playing");
  assert.equal(metadata.trackTitle, state.snapshot.item.title);
  assert.equal(metadata.artists, state.snapshot.item.artists);
  assert.equal(metadata.album, state.snapshot.item.collection);
  assert.equal(metadata.trackTitle.value, "Track title");
  assert.deepEqual(
    metadata.artists.map((artist): string => artist.name.value),
    ["Track artist"],
  );
  assert.equal(metadata.album.title.value, "Album title");
});

test("overlay metadata maps an episode to its normalized title, show, and publisher", () => {
  const state = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const metadata = metadataViewForOverlayState(state);

  assert.equal(metadata.kind, "episode");
  if (metadata.kind !== "episode") {
    throw new Error("Expected episode metadata.");
  }
  assert.equal(state.kind, "paused");
  if (state.kind !== "paused" || state.snapshot.item.kind !== "episode") {
    throw new Error("Expected a paused episode state.");
  }
  assert.equal(metadata.presentation.kind, "paused");
  assert.equal(metadata.episodeTitle, state.snapshot.item.title);
  assert.equal(metadata.show, state.snapshot.item.show);
  assert.equal(metadata.episodeTitle.value, "Episode title");
  assert.equal(metadata.show.title.value, "Show title");
  assert.equal(metadata.show.publisher.value, "Show publisher");
});

test("overlay marquee identity is stable for an item whose normalized title changes", () => {
  const originalState = expectSuccess(
    parseSpotifyPlaybackPayload(playingTrackPayload),
  );
  if (originalState.kind !== "playing") {
    throw new Error("Expected a playing track state.");
  }
  const originalTrack = playingTrack(originalState);
  const changedTitle = expectSuccess(DisplayText.create("Updated track title"));
  const changedTrack = expectSuccess(
    TrackItem.create({
      providerId: originalTrack.providerId,
      itemId: originalTrack.itemId,
      title: changedTitle,
      artists: originalTrack.artists,
      collection: originalTrack.collection,
      artwork: originalTrack.artwork,
      links: originalTrack.links,
    }),
  );
  const changedSnapshot = expectSuccess(
    PlaybackSnapshot.create({
      item: changedTrack,
      position: originalState.snapshot.position,
      duration: originalState.snapshot.duration,
    }),
  );
  const changedState: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: changedSnapshot,
  });
  const originalMetadata = metadataViewForOverlayState(originalState);
  const changedMetadata = metadataViewForOverlayState(changedState);

  assert.equal(originalMetadata.kind, "track");
  assert.equal(changedMetadata.kind, "track");
  if (originalMetadata.kind !== "track" || changedMetadata.kind !== "track") {
    throw new Error("Expected track metadata for both normalized items.");
  }
  assert.notEqual(
    originalMetadata.trackTitle.value,
    changedMetadata.trackTitle.value,
  );
  assert.equal(
    overlayItemIdentityKey(originalMetadata.itemIdentity),
    overlayItemIdentityKey(changedMetadata.itemIdentity),
  );
});

function playingTrack(state: PlaybackState): TrackItem {
  if (state.kind === "playing" && state.snapshot.item.kind === "track") {
    return state.snapshot.item;
  }

  throw new Error("Expected a playing track state.");
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error(
    `Expected a successful result: ${JSON.stringify(result.error)}`,
  );
}
