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

export type OverlayMetadataContent = {
  readonly category: string;
  readonly context: string;
  readonly subtitle: string;
  readonly title: string;
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

export function metadataForOverlayState(
  state: OverlayUiState,
): OverlayMetadataContent {
  switch (state.kind) {
    case "initializing":
      return statusMetadata(
        state,
        "Spotify Now Playing",
        "Preparing the display connection.",
      );
    case "authorization-required":
      return statusMetadata(
        state,
        "Connect Spotify to continue.",
        authorizationRequiredContext(state.reason),
      );
    case "authorizing":
      return statusMetadata(
        state,
        "Finish authorization in Spotify.",
        "This display will reconnect after authorization completes.",
      );
    case "empty":
      return statusMetadata(
        state,
        "Spotify is connected.",
        "Start a track or episode to populate the overlay.",
      );
    case "playing":
      return metadataForCurrentItem(state.snapshot.item, "NOW PLAYING");
    case "paused":
      return metadataForCurrentItem(state.snapshot.item, "PAUSED");
    case "unsupported":
      return statusMetadata(
        state,
        unsupportedSubtitle(state.reason),
        "Play a supported Spotify track or episode.",
      );
    case "reconnecting":
      return reconnectingMetadata(state);
    case "failure":
      return statusMetadata(
        state,
        playbackFailureSubtitle(state.error),
        "Use setup mode to retry playback or disconnect Spotify.",
      );
    case "fatal-initialization-failure":
      return statusMetadata(
        state,
        "The browser display could not be initialized.",
        fatalInitializationFailureContext(state.reason),
      );
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

function statusMetadata(
  state: OverlayUiState,
  subtitle: string,
  context: string,
): OverlayMetadataContent {
  const treatment = visualTreatmentForOverlayState(state);
  return frozenMetadata(treatment.label, treatment.message, subtitle, context);
}

function metadataForCurrentItem(
  item: NowPlayingItem,
  status: "NOW PLAYING" | "PAUSED",
): OverlayMetadataContent {
  switch (item.kind) {
    case "track":
      return frozenMetadata(
        `${status} · TRACK`,
        item.title.value,
        item.artists.map((artist): string => artist.name.value).join(", "),
        item.collection.title.value,
      );
    case "episode":
      return frozenMetadata(
        `${status} · EPISODE`,
        item.title.value,
        item.show.title.value,
        item.show.publisher.value,
      );
  }

  return unreachable(item);
}

function reconnectingMetadata(
  state: Extract<OverlayUiState, { readonly kind: "reconnecting" }>,
): OverlayMetadataContent {
  switch (state.lastItem.kind) {
    case "unavailable":
      return statusMetadata(
        state,
        "No previous item is available.",
        "Waiting for Spotify playback updates to return.",
      );
    case "available":
      return staleItemMetadata(state.lastItem.item);
  }

  return unreachable(state.lastItem);
}

function staleItemMetadata(item: NowPlayingItem): OverlayMetadataContent {
  switch (item.kind) {
    case "track":
      return frozenMetadata(
        "STALE TRACK",
        item.title.value,
        `Last known artist: ${item.artists
          .map((artist): string => artist.name.value)
          .join(", ")}`,
        "Reconnecting to Spotify — this item may no longer be current.",
      );
    case "episode":
      return frozenMetadata(
        "STALE EPISODE",
        item.title.value,
        `Last known show: ${item.show.title.value}`,
        "Reconnecting to Spotify — this item may no longer be current.",
      );
  }

  return unreachable(item);
}

function authorizationRequiredContext(
  reason: Extract<
    PlaybackState,
    { readonly kind: "authorization-required" }
  >["reason"],
): string {
  switch (reason) {
    case "authorization-expired":
      return "Spotify authorization expired.";
    case "authorization-revoked":
      return "Spotify authorization was revoked.";
    case "not-authorized":
      return "Spotify is not connected in this browser profile.";
    case "permission-required":
      return "Spotify playback permission is required.";
  }

  return unreachable(reason);
}

function unsupportedSubtitle(
  reason: Extract<PlaybackState, { readonly kind: "unsupported" }>["reason"],
): string {
  switch (reason) {
    case "advertisement":
      return "Spotify is playing an advertisement.";
    case "local-item":
      return "Spotify is playing a local item.";
    case "unknown-item-type":
      return "Spotify returned an unsupported item type.";
  }

  return unreachable(reason);
}

function playbackFailureSubtitle(
  failure: Extract<PlaybackState, { readonly kind: "failure" }>["error"],
): string {
  switch (failure.kind) {
    case "authorization-failed":
      return authorizationFailureSubtitle(failure.reason);
    case "provider-failed":
      return providerFailureSubtitle(failure.reason);
  }

  return unreachable(failure);
}

function authorizationFailureSubtitle(
  reason: "authorization-denied" | "code-exchange-rejected",
): string {
  switch (reason) {
    case "authorization-denied":
      return "Spotify authorization was denied.";
    case "code-exchange-rejected":
      return "Spotify rejected the authorization code.";
  }

  return unreachable(reason);
}

function providerFailureSubtitle(
  reason: "malformed-response" | "network" | "rate-limited" | "server-error",
): string {
  switch (reason) {
    case "malformed-response":
      return "Spotify returned an unreadable playback response.";
    case "network":
      return "The Spotify connection is unavailable.";
    case "rate-limited":
      return "Spotify temporarily limited playback requests.";
    case "server-error":
      return "Spotify returned a server error.";
  }

  return unreachable(reason);
}

function fatalInitializationFailureContext(
  reason: FatalInitializationFailureReason,
): string {
  switch (reason) {
    case "browser-capability-unavailable":
      return "A required browser playback capability is unavailable.";
    case "configuration-unavailable":
      return "The public Spotify configuration could not be loaded.";
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

function frozenMetadata(
  category: string,
  title: string,
  subtitle: string,
  context: string,
): OverlayMetadataContent {
  const content: OverlayMetadataContent = {
    category,
    context,
    subtitle,
    title,
  };

  return Object.freeze(content);
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
