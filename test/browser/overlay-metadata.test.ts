import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { spotifyOverlayPresentation } from "../../browser/providers/spotify-presentation.ts";
import { OverlayMetadata } from "../../components/overlay/OverlayMetadata.tsx";
import {
  overlayAnimationIdentityKey,
  overlayItemIdentityKey,
} from "../../components/overlay/overlay-identities.ts";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";
import { parseDisplayText } from "../../domain/playback-values.ts";
import {
  createPlaybackSnapshot,
  createTrackItem,
  type TrackItem,
} from "../../domain/playback-item.ts";
import { type PlaybackState } from "../../domain/playback.ts";
import { type Result } from "../../domain/result.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("overlay metadata renders normalized track text and current track hierarchy", () => {
  const state = expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
  const markup = renderMetadata(playbackSnapshot(state));

  assert.match(markup, />Track artist<\/text>/);
  assert.match(markup, />Track title<\/text>/);
  assert.match(markup, />ALBUM · Album title<\/text>/);
  assert.match(markup, />NOW PLAYING · TRACK<\/text>/);
});

test("overlay metadata renders normalized paused episode text and hierarchy", () => {
  const state = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const markup = renderMetadata(playbackSnapshot(state));

  assert.match(markup, />Show publisher<\/text>/);
  assert.match(markup, />Episode title<\/text>/);
  assert.match(markup, />SHOW · Show title<\/text>/);
  assert.match(markup, />PAUSED · EPISODE<\/text>/);
});

test("overlay metadata distinguishes fatal browser capability and configuration failures", () => {
  const browserCapabilityMarkup = renderMetadata(
    fatalSnapshot("browser-capability-unavailable"),
  );
  assert.match(
    browserCapabilityMarkup,
    />This browser cannot start Spotify playback\.<\/text>/,
  );
  assert.match(
    browserCapabilityMarkup,
    />A required browser playback capability is unavailable\.<\/text>/,
  );

  const configurationMarkup = renderMetadata(
    fatalSnapshot("configuration-unavailable"),
  );
  assert.match(
    configurationMarkup,
    />The browser configuration is unavailable\.<\/text>/,
  );
  assert.match(
    configurationMarkup,
    />The public Spotify configuration could not be loaded\.<\/text>/,
  );
});

test("marquee identity stays stable for a normalized item whose title changes", () => {
  const originalState = expectSuccess(
    parseSpotifyPlaybackPayload(playingTrackPayload),
  );
  if (originalState.kind !== "playing") {
    throw new Error("Expected a playing track state.");
  }

  const originalTrack = playingTrack(originalState);
  const changedTrack = expectSuccess(
    createTrackItem({
      artwork: originalTrack.artwork,
      artists: originalTrack.artists,
      collection: originalTrack.collection,
      itemId: originalTrack.itemId,
      links: originalTrack.links,
      providerId: originalTrack.providerId,
      title: expectSuccess(parseDisplayText("Updated track title")),
    }),
  );
  const changedState: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      createPlaybackSnapshot({
        duration: originalState.snapshot.duration,
        item: changedTrack,
        position: originalState.snapshot.position,
      }),
    ),
  });

  const originalSnapshot = playbackSnapshot(originalState);
  const changedSnapshot = playbackSnapshot(changedState);

  assert.equal(
    overlayItemIdentityKey(originalTrack),
    overlayItemIdentityKey(changedTrack),
  );
  assert.equal(
    overlayAnimationIdentityKey(originalSnapshot),
    overlayAnimationIdentityKey(changedSnapshot),
  );
  assert.match(renderMetadata(changedSnapshot), />Updated track title<\/text>/);
});

function renderMetadata(snapshot: BrowserPlaybackApplicationSnapshot): string {
  return renderToStaticMarkup(
    createElement(OverlayMetadata, {
      availableWidth: 2_400,
      motion: overlayMotionDecisionForPreference(true),
      onTextMeasurement: (): void => {},
      presentation: spotifyOverlayPresentation,
      snapshot,
    }),
  );
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function fatalSnapshot(
  reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"],
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "fatal", reason });
}

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
