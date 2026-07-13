import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { OverlayArtwork } from "../../components/overlay/OverlayArtwork.tsx";
import {
  overlayArtworkClipPathId,
  overlayArtworkRoundedClipPathData,
  overlayArtworkRectangle,
  overlayShell,
} from "../../components/overlay/overlay-layout.ts";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";
import {
  PlaybackSnapshot,
  TrackItem,
  transitionPlaybackState,
  unavailableOriginalArtwork,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import { playingTrackPayload } from "./providers/spotify-payload.fixture.ts";

test("the artwork is full-height, flush left, and clipped at all four corners", () => {
  assert.equal(overlayShell.height, 1_080);
  assert.equal(overlayShell.radius, 200);
  assert.deepEqual(overlayArtworkRectangle, {
    height: 1_080,
    width: 1_080,
    x: 0,
    y: 0,
  });
  assert.equal(
    overlayArtworkRoundedClipPathData,
    "M 200 0 H 880 A 200 200 0 0 1 1080 200 V 880 A 200 200 0 0 1 880 1080 H 200 A 200 200 0 0 1 0 880 V 200 A 200 200 0 0 1 200 0 Z",
  );
  assert.notEqual(
    overlayArtworkRoundedClipPathData,
    "M 200 0 H 1080 V 1080 H 200 A 200 200 0 0 1 0 880 V 200 A 200 200 0 0 1 200 0 Z",
  );
  assert.equal(overlayArtworkClipPathId, "overlay-artwork-rounded-clip");
  assert.equal(Object.isFrozen(overlayArtworkRectangle), true);
});

test("artwork renders current and stale domain artwork while preserving the vinyl fallback", () => {
  const playing = expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
  if (playing.kind !== "playing" || playing.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track state.");
  }

  const currentMarkup = renderArtwork(playbackSnapshot(playing));
  assert.match(
    currentMarkup,
    /<image[^>]*href="https:\/\/i\.scdn\.co\/image\/track-artwork-large"/,
  );
  assert.doesNotMatch(currentMarkup, /fill-overlay-vinyl-disc/);

  const reconnecting = expectSuccess(
    transitionPlaybackState(playing, { kind: "connection-lost" }),
  );
  const staleMarkup = renderArtwork(playbackSnapshot(reconnecting));
  assert.match(
    staleMarkup,
    /<image[^>]*href="https:\/\/i\.scdn\.co\/image\/track-artwork-large"/,
  );

  const itemWithoutArtwork = expectSuccess(
    TrackItem.create({
      artwork: unavailableOriginalArtwork("provider-did-not-supply-artwork"),
      artists: playing.snapshot.item.artists,
      collection: playing.snapshot.item.collection,
      itemId: playing.snapshot.item.itemId,
      links: playing.snapshot.item.links,
      providerId: playing.snapshot.item.providerId,
      title: playing.snapshot.item.title,
    }),
  );
  const fallbackState: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: playing.snapshot.duration,
        item: itemWithoutArtwork,
        position: playing.snapshot.position,
      }),
    ),
  });
  const fallbackMarkup = renderArtwork(playbackSnapshot(fallbackState));
  assert.match(fallbackMarkup, /fill-overlay-vinyl-disc/);
});

function renderArtwork(snapshot: BrowserPlaybackApplicationSnapshot): string {
  return renderToStaticMarkup(
    createElement(OverlayArtwork, {
      motion: overlayMotionDecisionForPreference(true),
      snapshot,
    }),
  );
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error(
    `Expected a successful result: ${JSON.stringify(result.error)}`,
  );
}
