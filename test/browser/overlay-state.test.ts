import assert from "node:assert/strict";
import test from "node:test";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import {
  artworkTreatmentForOverlayState,
  controlPlanForOverlayState,
  metadataForOverlayState,
  overlayUiStateForSnapshot,
  visualTreatmentForOverlayState,
  type OverlayControlPlan,
  type OverlayUiState,
  type OverlayVisualTreatment,
} from "../../components/overlay/overlay-state.ts";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("the overlay maps every browser playback snapshot to a distinct visual treatment", () => {
  const cases: ReadonlyArray<OverlayVisualCase> = [
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: initialPlaybackState(),
      }),
      label: "INITIALIZING",
      kind: "initializing",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: authorizationRequiredState(),
      }),
      label: "CONNECT SPOTIFY",
      kind: "authorization-required",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: authorizingState(),
      }),
      label: "AUTHORIZING",
      kind: "authorizing",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
      }),
      label: "NOTHING PLAYING",
      kind: "empty",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: playingState(),
      }),
      label: "PLAYING",
      kind: "playing",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
      }),
      label: "PAUSED",
      kind: "paused",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
      }),
      label: "UNSUPPORTED",
      kind: "unsupported",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: reconnectingStateWithoutStaleItem(),
      }),
      label: "RECONNECTING",
      kind: "reconnecting",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: failureState(),
      }),
      label: "PLAYBACK UNAVAILABLE",
      kind: "failure",
    },
    {
      state: overlayUiStateForSnapshot({
        kind: "fatal",
        reason: "browser-capability-unavailable",
      }),
      label: "OVERLAY UNAVAILABLE",
      kind: "fatal-initialization-failure",
    },
  ];
  const seenLabels = new Set<string>();
  const seenTreatments = new Set<OverlayVisualTreatment["kind"]>();

  for (const overlayCase of cases) {
    const treatment = visualTreatmentForOverlayState(overlayCase.state);

    assert.equal(treatment.label, overlayCase.label);
    assert.equal(treatment.kind, overlayCase.kind);
    assert.equal(seenLabels.has(treatment.label), false, treatment.label);
    assert.equal(seenTreatments.has(treatment.kind), false, treatment.kind);
    seenLabels.add(treatment.label);
    seenTreatments.add(treatment.kind);
  }

  const configurationFailure = overlayUiStateForSnapshot({
    kind: "fatal",
    reason: "configuration-unavailable",
  });
  const configurationTreatment =
    visualTreatmentForOverlayState(configurationFailure);

  assert.equal(
    configurationTreatment.message,
    "The browser configuration is unavailable.",
  );
  assert.equal(
    metadataForOverlayState(configurationFailure).context,
    "The public Spotify configuration could not be loaded.",
  );
});

test("the overlay preserves a stale reconnecting item without using an absence sentinel", () => {
  const reconnectingWithoutItem = overlayUiStateForSnapshot({
    kind: "playback",
    state: reconnectingStateWithoutStaleItem(),
  });
  const reconnectingWithItem = overlayUiStateForSnapshot({
    kind: "playback",
    state: reconnectingStateWithStaleItem(),
  });

  assert.equal(
    artworkTreatmentForOverlayState(reconnectingWithoutItem).kind,
    "fallback",
  );
  assert.equal(
    metadataForOverlayState(reconnectingWithoutItem).subtitle,
    "No previous item is available.",
  );

  const staleArtwork = artworkTreatmentForOverlayState(reconnectingWithItem);
  assert.equal(staleArtwork.kind, "stale-item");
  if (staleArtwork.kind !== "stale-item") {
    throw new Error("Expected a stale artwork treatment.");
  }
  assert.equal(staleArtwork.item.title.value, "Track title");
  assert.deepEqual(metadataForOverlayState(reconnectingWithItem), {
    category: "STALE TRACK",
    context: "Reconnecting to Spotify — this item may no longer be current.",
    subtitle: "Last known artist: Track artist",
    title: "Track title",
  });
});

test("the overlay exposes only supported setup controls for each state", () => {
  const overlayMode = resolveOverlayGeometry(new URLSearchParams()).setupMode;
  const setupMode = resolveOverlayGeometry(
    new URLSearchParams("setup=1"),
  ).setupMode;
  const cases: ReadonlyArray<OverlayControlCase> = [
    {
      expectedOverlay: "none",
      expectedSetup: "none",
      state: initialPlaybackState(),
    },
    {
      expectedOverlay: "connect",
      expectedSetup: "connect",
      state: authorizationRequiredState(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "disconnect",
      state: authorizingState(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "disconnect",
      state: expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "disconnect",
      state: playingState(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "disconnect",
      state: expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "disconnect",
      state: expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "reconnect-and-disconnect",
      state: reconnectingStateWithoutStaleItem(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "reconnect-and-disconnect",
      state: reconnectingStateWithStaleItem(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "retry-and-disconnect",
      state: failureState(),
    },
    {
      expectedOverlay: "none",
      expectedSetup: "none",
      state: overlayUiStateForSnapshot({
        kind: "fatal",
        reason: "configuration-unavailable",
      }),
    },
  ];

  for (const overlayCase of cases) {
    assert.equal(
      controlPlanForOverlayState(overlayCase.state, overlayMode).kind,
      overlayCase.expectedOverlay,
      overlayCase.state.kind,
    );
    assert.equal(
      controlPlanForOverlayState(overlayCase.state, setupMode).kind,
      overlayCase.expectedSetup,
      overlayCase.state.kind,
    );
  }
});

type OverlayVisualCase = {
  readonly kind: OverlayVisualTreatment["kind"];
  readonly label: string;
  readonly state: OverlayUiState;
};

type OverlayControlCase = {
  readonly expectedOverlay: OverlayControlPlan["kind"];
  readonly expectedSetup: OverlayControlPlan["kind"];
  readonly state: OverlayUiState;
};

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
