import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { NowPlayingItem, PlaybackState } from "../../domain/playback.ts";
import type { OverlaySetupMode } from "./overlay-geometry.ts";

type FatalInitializationFailureReason = Extract<
  BrowserPlaybackApplicationSnapshot,
  { readonly kind: "fatal" }
>["reason"];

type FatalInitializationFailureOverlayState = {
  readonly kind: "fatal-initialization-failure";
  readonly reason: FatalInitializationFailureReason;
};

export type OverlayUiState =
  FatalInitializationFailureOverlayState | PlaybackState;

export type OverlayVisualTone = "active" | "failure" | "neutral" | "warning";

export type OverlayVisualTreatment =
  | {
      readonly kind: "authorizing";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "authorization-required";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "empty";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "failure";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "fatal-initialization-failure";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "initializing";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "paused";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "playing";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "reconnecting";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    }
  | {
      readonly kind: "unsupported";
      readonly label: string;
      readonly message: string;
      readonly tone: OverlayVisualTone;
    };

export type OverlayArtworkTreatment =
  | {
      readonly kind: "current-item";
      readonly item: NowPlayingItem;
    }
  | {
      readonly kind: "fallback";
    }
  | {
      readonly kind: "stale-item";
      readonly item: NowPlayingItem;
    };

export type OverlayControlPlan =
  | {
      readonly kind: "connect";
    }
  | {
      readonly kind: "disconnect";
    }
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "reconnect-and-disconnect";
    }
  | {
      readonly kind: "retry-and-disconnect";
    };

type SetupOverlayControlPlan = Exclude<
  OverlayControlPlan,
  { readonly kind: "none" }
>;

const noControls: OverlayControlPlan = Object.freeze({ kind: "none" });
const connectControls: OverlayControlPlan = Object.freeze({ kind: "connect" });
const disconnectControls: SetupOverlayControlPlan = Object.freeze({
  kind: "disconnect",
});
const reconnectAndDisconnectControls: SetupOverlayControlPlan = Object.freeze({
  kind: "reconnect-and-disconnect",
});
const retryAndDisconnectControls: SetupOverlayControlPlan = Object.freeze({
  kind: "retry-and-disconnect",
});
const initializingTreatment = Object.freeze({
  kind: "initializing",
  label: "INITIALIZING",
  message: "Starting Spotify playback.",
  tone: "neutral",
} satisfies OverlayVisualTreatment);
const authorizationRequiredTreatment = Object.freeze({
  kind: "authorization-required",
  label: "CONNECT SPOTIFY",
  message: "Spotify authorization is required.",
  tone: "warning",
} satisfies OverlayVisualTreatment);
const authorizingTreatment = Object.freeze({
  kind: "authorizing",
  label: "AUTHORIZING",
  message: "Waiting for Spotify authorization.",
  tone: "neutral",
} satisfies OverlayVisualTreatment);
const emptyTreatment = Object.freeze({
  kind: "empty",
  label: "NOTHING PLAYING",
  message: "No track or episode is currently playing.",
  tone: "neutral",
} satisfies OverlayVisualTreatment);
const playingTreatment = Object.freeze({
  kind: "playing",
  label: "PLAYING",
  message: "Spotify is playing.",
  tone: "active",
} satisfies OverlayVisualTreatment);
const pausedTreatment = Object.freeze({
  kind: "paused",
  label: "PAUSED",
  message: "Spotify is paused.",
  tone: "neutral",
} satisfies OverlayVisualTreatment);
const unsupportedTreatment = Object.freeze({
  kind: "unsupported",
  label: "UNSUPPORTED",
  message: "The current Spotify item cannot be displayed.",
  tone: "warning",
} satisfies OverlayVisualTreatment);
const reconnectingTreatment = Object.freeze({
  kind: "reconnecting",
  label: "RECONNECTING",
  message: "Reconnecting to Spotify.",
  tone: "warning",
} satisfies OverlayVisualTreatment);
const failureTreatment = Object.freeze({
  kind: "failure",
  label: "PLAYBACK UNAVAILABLE",
  message: "Playback updates failed.",
  tone: "failure",
} satisfies OverlayVisualTreatment);
const browserCapabilityFailureTreatment = Object.freeze({
  kind: "fatal-initialization-failure",
  label: "OVERLAY UNAVAILABLE",
  message: "This browser cannot start Spotify playback.",
  tone: "failure",
} satisfies OverlayVisualTreatment);
const configurationFailureTreatment = Object.freeze({
  kind: "fatal-initialization-failure",
  label: "OVERLAY UNAVAILABLE",
  message: "The browser configuration is unavailable.",
  tone: "failure",
} satisfies OverlayVisualTreatment);

export function overlayUiStateForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
): OverlayUiState {
  switch (snapshot.kind) {
    case "fatal":
      return fatalInitializationFailureOverlayState(snapshot.reason);
    case "playback":
      return snapshot.state;
  }

  return unreachable(snapshot);
}

export function visualTreatmentForOverlayState(
  state: OverlayUiState,
): OverlayVisualTreatment {
  switch (state.kind) {
    case "initializing":
      return initializingTreatment;
    case "authorization-required":
      return authorizationRequiredTreatment;
    case "authorizing":
      return authorizingTreatment;
    case "empty":
      return emptyTreatment;
    case "playing":
      return playingTreatment;
    case "paused":
      return pausedTreatment;
    case "unsupported":
      return unsupportedTreatment;
    case "reconnecting":
      return reconnectingTreatment;
    case "failure":
      return failureTreatment;
    case "fatal-initialization-failure":
      return fatalVisualTreatment(state.reason);
  }

  return unreachable(state);
}

export function artworkTreatmentForOverlayState(
  state: OverlayUiState,
): OverlayArtworkTreatment {
  switch (state.kind) {
    case "playing":
    case "paused":
      return frozenCurrentArtwork(state.snapshot.item);
    case "reconnecting":
      return reconnectingArtworkTreatment(state);
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "unsupported":
    case "failure":
    case "fatal-initialization-failure":
      return frozenFallbackArtwork();
  }

  return unreachable(state);
}

export function controlPlanForOverlayState(
  state: OverlayUiState,
  setupMode: OverlaySetupMode,
): OverlayControlPlan {
  switch (state.kind) {
    case "authorization-required":
      return connectControls;
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
      return setupOnly(setupMode, disconnectControls);
    case "reconnecting":
      return setupOnly(setupMode, reconnectAndDisconnectControls);
    case "failure":
      return setupOnly(setupMode, retryAndDisconnectControls);
    case "initializing":
    case "fatal-initialization-failure":
      return noControls;
  }

  return unreachable(state);
}

function fatalInitializationFailureOverlayState(
  reason: FatalInitializationFailureReason,
): FatalInitializationFailureOverlayState {
  const state: FatalInitializationFailureOverlayState = {
    kind: "fatal-initialization-failure",
    reason,
  };

  return Object.freeze(state);
}

function fatalVisualTreatment(
  reason: FatalInitializationFailureReason,
): OverlayVisualTreatment {
  switch (reason) {
    case "browser-capability-unavailable":
      return browserCapabilityFailureTreatment;
    case "configuration-unavailable":
      return configurationFailureTreatment;
  }

  return unreachable(reason);
}

function reconnectingArtworkTreatment(
  state: Extract<OverlayUiState, { readonly kind: "reconnecting" }>,
): OverlayArtworkTreatment {
  switch (state.lastItem.kind) {
    case "available":
      return frozenStaleArtwork(state.lastItem.item);
    case "unavailable":
      return frozenFallbackArtwork();
  }

  return unreachable(state.lastItem);
}

function setupOnly(
  setupMode: OverlaySetupMode,
  plan: SetupOverlayControlPlan,
): OverlayControlPlan {
  switch (setupMode.kind) {
    case "overlay":
      return noControls;
    case "setup":
      return plan;
  }

  return unreachable(setupMode);
}

function frozenCurrentArtwork(item: NowPlayingItem): OverlayArtworkTreatment {
  return Object.freeze({ kind: "current-item", item });
}

function frozenFallbackArtwork(): OverlayArtworkTreatment {
  return Object.freeze({ kind: "fallback" });
}

function frozenStaleArtwork(item: NowPlayingItem): OverlayArtworkTreatment {
  return Object.freeze({ kind: "stale-item", item });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay state: ${String(value)}`);
}
