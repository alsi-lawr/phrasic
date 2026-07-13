import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { OverlayControls } from "../../components/overlay/OverlayControls.tsx";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("overlay controls render state-specific actions directly from the application snapshot", () => {
  const cases: ReadonlyArray<OverlayControlsCase> = [
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: [],
      snapshot: playbackSnapshot(initialPlaybackState()),
    },
    {
      expectedOverlayLabels: ["Connect Spotify"],
      expectedSetupLabels: ["Connect Spotify"],
      snapshot: playbackSnapshot(authorizationRequiredState()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Disconnect Spotify"],
      snapshot: playbackSnapshot(authorizingState()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Disconnect Spotify"],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
      ),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Disconnect Spotify"],
      snapshot: playbackSnapshot(playingState()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Disconnect Spotify"],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
      ),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Disconnect Spotify"],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
      ),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Reconnect Spotify", "Disconnect Spotify"],
      snapshot: playbackSnapshot(reconnectingStateWithoutStaleItem()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Reconnect Spotify", "Disconnect Spotify"],
      snapshot: playbackSnapshot(reconnectingStateWithStaleItem()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: ["Retry playback", "Disconnect Spotify"],
      snapshot: playbackSnapshot(failureState()),
    },
    {
      expectedOverlayLabels: [],
      expectedSetupLabels: [],
      snapshot: Object.freeze({
        kind: "fatal",
        reason: "browser-capability-unavailable",
      }),
    },
  ];

  for (const overlayCase of cases) {
    assertControlLabels(
      renderControls(overlayCase.snapshot, new URLSearchParams()),
      overlayCase.expectedOverlayLabels,
    );
    assertControlLabels(
      renderControls(overlayCase.snapshot, new URLSearchParams("setup=1")),
      overlayCase.expectedSetupLabels,
    );
  }
});

test("setup controls retain named Spotify navigation and button semantics", () => {
  const markup = renderControls(
    playbackSnapshot(reconnectingStateWithStaleItem()),
    new URLSearchParams("setup=1"),
  );

  assert.match(markup, /<nav[^>]*aria-label="Spotify playback controls"/);
  assert.match(markup, /<button[^>]*type="button"[^>]*>Reconnect Spotify<\/button>/);
  assert.match(markup, /<button[^>]*type="button"[^>]*>Disconnect Spotify<\/button>/);
});

type OverlayControlsCase = {
  readonly expectedOverlayLabels: ReadonlyArray<string>;
  readonly expectedSetupLabels: ReadonlyArray<string>;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function renderControls(
  snapshot: BrowserPlaybackApplicationSnapshot,
  parameters: URLSearchParams,
): string {
  return renderToStaticMarkup(
    createElement(OverlayControls, {
      actions: Object.freeze({
        beginAuthorization: (): void => {},
        logout: (): void => {},
        retry: (): void => {},
      }),
      setupMode: resolveOverlayGeometry(parameters).setupMode,
      snapshot,
    }),
  );
}

function assertControlLabels(
  markup: string,
  labels: ReadonlyArray<string>,
): void {
  if (labels.length === 0) {
    assert.equal(markup, "");
    return;
  }

  for (const label of labels) {
    assert.match(markup, new RegExp(`>${label}<\\/button>`));
  }
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function authorizationRequiredState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(initialPlaybackState(), {
      kind: "authorization-required",
      reason: "not-authorized",
    }),
  );
}

function authorizingState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(authorizationRequiredState(), {
      kind: "begin-authorization",
    }),
  );
}

function reconnectingStateWithoutStaleItem(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(authorizingState(), {
      kind: "authorization-complete",
    }),
  );
}

function reconnectingStateWithStaleItem(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(playingState(), { kind: "connection-lost" }),
  );
}

function playingState(): PlaybackState {
  return expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
}

function failureState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(initialPlaybackState(), {
      kind: "failure",
      failure: providerFailure("network"),
    }),
  );
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error(
    `Expected a successful result: ${JSON.stringify(result.error)}`,
  );
}
