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
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";
import {
  overlayUiStateForSnapshot,
  type OverlayUiState,
} from "../../components/overlay/overlay-state.ts";
import {
  overlayViewModelForState,
  type OverlayControlPlan,
  type OverlayViewModel,
} from "../../components/overlay/overlay-view-model.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("the overlay projects every browser playback state through one immutable view model", () => {
  const cases: ReadonlyArray<OverlayViewModelCase> = [
    {
      label: "INITIALIZING",
      kind: "initializing",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: initialPlaybackState(),
      }),
    },
    {
      label: "CONNECT SPOTIFY",
      kind: "authorization-required",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: authorizationRequiredState(),
      }),
    },
    {
      label: "AUTHORIZING",
      kind: "authorizing",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: authorizingState(),
      }),
    },
    {
      label: "NOTHING PLAYING",
      kind: "empty",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
      }),
    },
    {
      label: "PLAYING",
      kind: "playing",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: playingState(),
      }),
    },
    {
      label: "PAUSED",
      kind: "paused",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
      }),
    },
    {
      label: "UNSUPPORTED",
      kind: "unsupported",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
      }),
    },
    {
      label: "RECONNECTING",
      kind: "reconnecting",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: reconnectingStateWithoutStaleItem(),
      }),
    },
    {
      label: "PLAYBACK UNAVAILABLE",
      kind: "failure",
      state: overlayUiStateForSnapshot({
        kind: "playback",
        state: failureState(),
      }),
    },
    {
      label: "OVERLAY UNAVAILABLE",
      kind: "fatal-initialization-failure",
      state: overlayUiStateForSnapshot({
        kind: "fatal",
        reason: "browser-capability-unavailable",
      }),
    },
  ];
  const seenLabels = new Set<string>();
  const seenKinds = new Set<OverlayViewModel["kind"]>();

  for (const overlayCase of cases) {
    const viewModel = overlayViewModelForState(overlayCase.state);

    assert.equal(Object.isFrozen(viewModel), true);
    assert.equal(Object.isFrozen(viewModel.artwork), true);
    assert.equal(Object.isFrozen(viewModel.controls), true);
    assert.equal(Object.isFrozen(viewModel.metadata), true);
    assert.equal(Object.isFrozen(viewModel.semantic), true);
    assert.equal(Object.isFrozen(viewModel.spotifyLinks), true);
    assert.equal(Object.isFrozen(viewModel.status), true);
    assert.equal(viewModel.kind, overlayCase.kind);
    assert.equal(viewModel.status.label, overlayCase.label);
    assert.equal(
      viewModel.semantic.announcement.identity.stateKind,
      viewModel.kind,
    );
    assert.equal(
      seenLabels.has(viewModel.status.label),
      false,
      viewModel.status.label,
    );
    assert.equal(seenKinds.has(viewModel.kind), false, viewModel.kind);
    seenLabels.add(viewModel.status.label);
    seenKinds.add(viewModel.kind);
  }

  const configurationFailure = overlayUiStateForSnapshot({
    kind: "fatal",
    reason: "configuration-unavailable",
  });
  const configurationViewModel = overlayViewModelForState(configurationFailure);

  assert.equal(
    configurationViewModel.status.message,
    "The browser configuration is unavailable.",
  );
  assert.equal(configurationViewModel.metadata.kind, "status");
  if (configurationViewModel.metadata.kind !== "status") {
    throw new Error("Expected status metadata for configuration failure.");
  }
  assert.equal(
    configurationViewModel.metadata.context,
    "The public Spotify configuration could not be loaded.",
  );
  assert.equal(configurationViewModel.spotifyLinks.kind, "not-applicable");
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
  const unavailableViewModel = overlayViewModelForState(
    reconnectingWithoutItem,
  );
  const staleViewModel = overlayViewModelForState(reconnectingWithItem);

  assert.equal(unavailableViewModel.artwork.kind, "fallback");
  assert.equal(unavailableViewModel.metadata.kind, "status");
  if (unavailableViewModel.metadata.kind !== "status") {
    throw new Error("Expected status metadata without a stale item.");
  }
  assert.equal(
    unavailableViewModel.metadata.subtitle,
    "No previous item is available.",
  );
  assert.equal(unavailableViewModel.spotifyLinks.kind, "not-applicable");

  assert.equal(staleViewModel.artwork.kind, "stale-item");
  if (staleViewModel.artwork.kind !== "stale-item") {
    throw new Error("Expected a stale artwork treatment.");
  }
  assert.equal(staleViewModel.artwork.item.title.value, "Track title");
  assert.equal(staleViewModel.metadata.kind, "track");
  if (staleViewModel.metadata.kind !== "track") {
    throw new Error("Expected track metadata for the stale item.");
  }
  assert.equal(staleViewModel.metadata.presentation.kind, "stale");
  assert.equal(staleViewModel.metadata.trackTitle.value, "Track title");
  assert.deepEqual(
    staleViewModel.metadata.artists.map((artist): string => artist.name.value),
    ["Track artist"],
  );
  assert.equal(staleViewModel.metadata.album.title.value, "Album title");
  assert.equal(staleViewModel.spotifyLinks.kind, "available");
});

test("the overlay carries only supported setup controls for each state", () => {
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
    const viewModel = overlayViewModelForState(overlayCase.state);

    assert.equal(
      viewModel.controls[overlayMode.kind].kind,
      overlayCase.expectedOverlay,
      overlayCase.state.kind,
    );
    assert.equal(
      viewModel.controls[setupMode.kind].kind,
      overlayCase.expectedSetup,
      overlayCase.state.kind,
    );
  }
});

type OverlayViewModelCase = {
  readonly kind: OverlayViewModel["kind"];
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
