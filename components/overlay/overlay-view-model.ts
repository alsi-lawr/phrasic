import type { NowPlayingItem } from "../../domain/playback.ts";
import {
  authorizationRequiredContext,
  fatalInitializationFailureContext,
  metadataViewForItem,
  playbackFailureSubtitle,
  statusMetadataView,
  unsupportedSubtitle,
  type OverlayItemMetadataPresentation,
  type OverlayMetadataView,
} from "./overlay-metadata.ts";
import {
  semanticViewForOverlayPresentation,
  type OverlaySemanticView,
} from "./overlay-semantics.ts";
import {
  spotifyLinksForMetadata,
  type OverlaySpotifyLinks,
} from "./overlay-spotify-links.ts";
import type {
  FatalInitializationFailureReason,
  OverlayStatusView,
  OverlayUiState,
} from "./overlay-state.ts";

export type OverlayArtworkTreatment =
  | {
      readonly item: NowPlayingItem;
      readonly kind: "current-item";
    }
  | {
      readonly kind: "fallback";
    }
  | {
      readonly item: NowPlayingItem;
      readonly kind: "stale-item";
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

export type OverlayControlPlans = {
  readonly overlay: OverlayControlPlan;
  readonly setup: OverlayControlPlan;
};

type OverlayViewModelForKind<Kind extends OverlayUiState["kind"]> = {
  readonly artwork: OverlayArtworkTreatment;
  readonly controls: OverlayControlPlans;
  readonly kind: Kind;
  readonly metadata: OverlayMetadataView;
  readonly semantic: OverlaySemanticView;
  readonly spotifyLinks: OverlaySpotifyLinks;
  readonly status: OverlayStatusView;
};

type OverlayViewModelForState<State extends OverlayUiState> = State extends {
  readonly kind: infer Kind extends OverlayUiState["kind"];
}
  ? OverlayViewModelForKind<Kind>
  : never;

export type OverlayViewModel = OverlayViewModelForState<OverlayUiState>;

const noControls = Object.freeze({ kind: "none" } satisfies OverlayControlPlan);
const connectControls = Object.freeze({
  kind: "connect",
} satisfies OverlayControlPlan);
const disconnectControls = Object.freeze({
  kind: "disconnect",
} satisfies OverlayControlPlan);
const reconnectAndDisconnectControls = Object.freeze({
  kind: "reconnect-and-disconnect",
} satisfies OverlayControlPlan);
const retryAndDisconnectControls = Object.freeze({
  kind: "retry-and-disconnect",
} satisfies OverlayControlPlan);
const noControlPlans = Object.freeze({
  overlay: noControls,
  setup: noControls,
} satisfies OverlayControlPlans);
const connectControlPlans = Object.freeze({
  overlay: connectControls,
  setup: connectControls,
} satisfies OverlayControlPlans);
const disconnectControlPlans = Object.freeze({
  overlay: noControls,
  setup: disconnectControls,
} satisfies OverlayControlPlans);
const reconnectAndDisconnectControlPlans = Object.freeze({
  overlay: noControls,
  setup: reconnectAndDisconnectControls,
} satisfies OverlayControlPlans);
const retryAndDisconnectControlPlans = Object.freeze({
  overlay: noControls,
  setup: retryAndDisconnectControls,
} satisfies OverlayControlPlans);
const fallbackArtwork = Object.freeze({
  kind: "fallback",
} satisfies OverlayArtworkTreatment);
const initializingStatus = statusView(
  "INITIALIZING",
  "Starting Spotify playback.",
);
const authorizationRequiredStatus = statusView(
  "CONNECT SPOTIFY",
  "Spotify authorization is required.",
);
const authorizingStatus = statusView(
  "AUTHORIZING",
  "Waiting for Spotify authorization.",
);
const emptyStatus = statusView(
  "NOTHING PLAYING",
  "No track or episode is currently playing.",
);
const playingStatus = statusView("PLAYING", "Spotify is playing.");
const pausedStatus = statusView("PAUSED", "Spotify is paused.");
const unsupportedStatus = statusView(
  "UNSUPPORTED",
  "The current Spotify item cannot be displayed.",
);
const reconnectingStatus = statusView(
  "RECONNECTING",
  "Reconnecting to Spotify.",
);
const failureStatus = statusView(
  "PLAYBACK UNAVAILABLE",
  "Playback updates failed.",
);
const browserCapabilityFailureStatus = statusView(
  "OVERLAY UNAVAILABLE",
  "This browser cannot start Spotify playback.",
);
const configurationFailureStatus = statusView(
  "OVERLAY UNAVAILABLE",
  "The browser configuration is unavailable.",
);
const nowPlayingPresentation = Object.freeze({
  kind: "now-playing",
} satisfies OverlayItemMetadataPresentation);
const pausedPresentation = Object.freeze({
  kind: "paused",
} satisfies OverlayItemMetadataPresentation);
const stalePresentation = Object.freeze({
  kind: "stale",
} satisfies OverlayItemMetadataPresentation);

export function overlayViewModelForState(
  state: OverlayUiState,
): OverlayViewModel {
  switch (state.kind) {
    case "initializing":
      return statusViewModel(
        state.kind,
        initializingStatus,
        noControlPlans,
        "Spotify Now Playing",
        "Preparing the display connection.",
      );
    case "authorization-required":
      return statusViewModel(
        state.kind,
        authorizationRequiredStatus,
        connectControlPlans,
        "Connect Spotify to continue.",
        authorizationRequiredContext(state.reason),
      );
    case "authorizing":
      return statusViewModel(
        state.kind,
        authorizingStatus,
        disconnectControlPlans,
        "Finish authorization in Spotify.",
        "This display will reconnect after authorization completes.",
      );
    case "empty":
      return statusViewModel(
        state.kind,
        emptyStatus,
        disconnectControlPlans,
        "Spotify is connected.",
        "Start a track or episode to populate the overlay.",
      );
    case "playing":
      return itemViewModel(
        state.kind,
        playingStatus,
        currentArtwork(state.snapshot.item),
        disconnectControlPlans,
        state.snapshot.item,
        nowPlayingPresentation,
      );
    case "paused":
      return itemViewModel(
        state.kind,
        pausedStatus,
        currentArtwork(state.snapshot.item),
        disconnectControlPlans,
        state.snapshot.item,
        pausedPresentation,
      );
    case "unsupported":
      return statusViewModel(
        state.kind,
        unsupportedStatus,
        disconnectControlPlans,
        unsupportedSubtitle(state.reason),
        "Play a supported Spotify track or episode.",
      );
    case "reconnecting":
      return reconnectingViewModel(state);
    case "failure":
      return statusViewModel(
        state.kind,
        failureStatus,
        retryAndDisconnectControlPlans,
        playbackFailureSubtitle(state.error),
        "Use setup mode to retry playback or disconnect Spotify.",
      );
    case "fatal-initialization-failure":
      return statusViewModel(
        state.kind,
        fatalStatusFor(state.reason),
        noControlPlans,
        "The browser display could not be initialized.",
        fatalInitializationFailureContext(state.reason),
      );
  }

  return unreachable(state);
}

function reconnectingViewModel(
  state: Extract<OverlayUiState, { readonly kind: "reconnecting" }>,
): OverlayViewModel {
  switch (state.lastItem.kind) {
    case "available":
      return itemViewModel(
        state.kind,
        reconnectingStatus,
        staleArtwork(state.lastItem.item),
        reconnectAndDisconnectControlPlans,
        state.lastItem.item,
        stalePresentation,
      );
    case "unavailable":
      return statusViewModel(
        state.kind,
        reconnectingStatus,
        reconnectAndDisconnectControlPlans,
        "No previous item is available.",
        "Waiting for Spotify playback updates to return.",
      );
  }

  return unreachable(state.lastItem);
}

function statusViewModel<
  Kind extends Exclude<OverlayUiState["kind"], "playing" | "paused">,
>(
  kind: Kind,
  status: OverlayStatusView,
  controls: OverlayControlPlans,
  subtitle: string,
  context: string,
): OverlayViewModelForKind<Kind> {
  return frozenOverlayViewModel(
    kind,
    status,
    fallbackArtwork,
    controls,
    statusMetadataView(status, subtitle, context),
  );
}

function itemViewModel<Kind extends "playing" | "paused" | "reconnecting">(
  kind: Kind,
  status: OverlayStatusView,
  artwork: OverlayArtworkTreatment,
  controls: OverlayControlPlans,
  item: NowPlayingItem,
  presentation: OverlayItemMetadataPresentation,
): OverlayViewModelForKind<Kind> {
  return frozenOverlayViewModel(
    kind,
    status,
    artwork,
    controls,
    metadataViewForItem(item, presentation),
  );
}

function frozenOverlayViewModel<Kind extends OverlayUiState["kind"]>(
  kind: Kind,
  status: OverlayStatusView,
  artwork: OverlayArtworkTreatment,
  controls: OverlayControlPlans,
  metadata: OverlayMetadataView,
): OverlayViewModelForKind<Kind> {
  return Object.freeze({
    artwork,
    controls,
    kind,
    metadata,
    semantic: semanticViewForOverlayPresentation(kind, status, metadata),
    spotifyLinks: spotifyLinksForMetadata(metadata),
    status,
  });
}

function currentArtwork(item: NowPlayingItem): OverlayArtworkTreatment {
  return Object.freeze({ item, kind: "current-item" });
}

function staleArtwork(item: NowPlayingItem): OverlayArtworkTreatment {
  return Object.freeze({ item, kind: "stale-item" });
}

function statusView(label: string, message: string): OverlayStatusView {
  return Object.freeze({ label, message });
}

function fatalStatusFor(
  reason: FatalInitializationFailureReason,
): OverlayStatusView {
  switch (reason) {
    case "browser-capability-unavailable":
      return browserCapabilityFailureStatus;
    case "configuration-unavailable":
      return configurationFailureStatus;
  }

  return unreachable(reason);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay view-model value: ${String(value)}`);
}
