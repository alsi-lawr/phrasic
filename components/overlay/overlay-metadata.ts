import type {
  Collection,
  Creator,
  DisplayText,
  NowPlayingItem,
  ProviderId,
  ProviderItemId,
  ProviderLink,
  Show,
} from "../../domain/playback.ts";
import {
  visualTreatmentForOverlayState,
  type OverlayUiState,
} from "./overlay-state.ts";

export type OverlayItemIdentity = {
  readonly itemId: ProviderItemId;
  readonly providerId: ProviderId;
};

export type OverlayItemMetadataPresentation =
  | {
      readonly kind: "now-playing";
    }
  | {
      readonly kind: "paused";
    }
  | {
      readonly kind: "stale";
    };

export type OverlayTrackMetadataView = {
  readonly album: Collection;
  readonly artists: ReadonlyArray<Creator>;
  readonly itemLinks: ReadonlyArray<ProviderLink>;
  readonly itemIdentity: OverlayItemIdentity;
  readonly kind: "track";
  readonly presentation: OverlayItemMetadataPresentation;
  readonly trackTitle: DisplayText;
};

export type OverlayEpisodeMetadataView = {
  readonly episodeTitle: DisplayText;
  readonly itemLinks: ReadonlyArray<ProviderLink>;
  readonly itemIdentity: OverlayItemIdentity;
  readonly kind: "episode";
  readonly presentation: OverlayItemMetadataPresentation;
  readonly show: Show;
};

export type OverlayStatusMetadataView = {
  readonly category: string;
  readonly context: string;
  readonly kind: "status";
  readonly subtitle: string;
  readonly title: string;
};

export type OverlayMetadataView =
  | OverlayEpisodeMetadataView
  | OverlayStatusMetadataView
  | OverlayTrackMetadataView;

const nowPlayingPresentation: OverlayItemMetadataPresentation = Object.freeze({
  kind: "now-playing",
});
const pausedPresentation: OverlayItemMetadataPresentation = Object.freeze({
  kind: "paused",
});
const stalePresentation: OverlayItemMetadataPresentation = Object.freeze({
  kind: "stale",
});

export function metadataViewForOverlayState(
  state: OverlayUiState,
): OverlayMetadataView {
  switch (state.kind) {
    case "initializing":
      return statusMetadataView(
        state,
        "Spotify Now Playing",
        "Preparing the display connection.",
      );
    case "authorization-required":
      return statusMetadataView(
        state,
        "Connect Spotify to continue.",
        authorizationRequiredContext(state.reason),
      );
    case "authorizing":
      return statusMetadataView(
        state,
        "Finish authorization in Spotify.",
        "This display will reconnect after authorization completes.",
      );
    case "empty":
      return statusMetadataView(
        state,
        "Spotify is connected.",
        "Start a track or episode to populate the overlay.",
      );
    case "playing":
      return itemMetadataView(state.snapshot.item, nowPlayingPresentation);
    case "paused":
      return itemMetadataView(state.snapshot.item, pausedPresentation);
    case "unsupported":
      return statusMetadataView(
        state,
        unsupportedSubtitle(state.reason),
        "Play a supported Spotify track or episode.",
      );
    case "reconnecting":
      return reconnectingMetadataView(state);
    case "failure":
      return statusMetadataView(
        state,
        playbackFailureSubtitle(state.error),
        "Use setup mode to retry playback or disconnect Spotify.",
      );
    case "fatal-initialization-failure":
      return statusMetadataView(
        state,
        "The browser display could not be initialized.",
        fatalInitializationFailureContext(state.reason),
      );
  }

  return unreachable(state);
}

export function overlayItemIdentityKey(identity: OverlayItemIdentity): string {
  const providerId = identity.providerId.value;
  const itemId = identity.itemId.value;

  return `${providerId.length}:${providerId}${itemId.length}:${itemId}`;
}

export function overlayMetadataAnimationIdentityKey(
  metadata: OverlayMetadataView,
): string {
  switch (metadata.kind) {
    case "track":
    case "episode":
      return overlayItemIdentityKey(metadata.itemIdentity);
    case "status":
      return statusMetadataAnimationIdentityKey(metadata);
  }

  return unreachable(metadata);
}

function itemMetadataView(
  item: NowPlayingItem,
  presentation: OverlayItemMetadataPresentation,
): OverlayEpisodeMetadataView | OverlayTrackMetadataView {
  switch (item.kind) {
    case "track":
      return frozenTrackMetadataView(item, presentation);
    case "episode":
      return frozenEpisodeMetadataView(item, presentation);
  }

  return unreachable(item);
}

function frozenTrackMetadataView(
  item: Extract<NowPlayingItem, { readonly kind: "track" }>,
  presentation: OverlayItemMetadataPresentation,
): OverlayTrackMetadataView {
  const metadata: OverlayTrackMetadataView = {
    album: item.collection,
    artists: item.artists,
    itemLinks: item.links,
    itemIdentity: overlayItemIdentityFor(item),
    kind: "track",
    presentation,
    trackTitle: item.title,
  };

  return Object.freeze(metadata);
}

function frozenEpisodeMetadataView(
  item: Extract<NowPlayingItem, { readonly kind: "episode" }>,
  presentation: OverlayItemMetadataPresentation,
): OverlayEpisodeMetadataView {
  const metadata: OverlayEpisodeMetadataView = {
    episodeTitle: item.title,
    itemLinks: item.links,
    itemIdentity: overlayItemIdentityFor(item),
    kind: "episode",
    presentation,
    show: item.show,
  };

  return Object.freeze(metadata);
}

function overlayItemIdentityFor(item: NowPlayingItem): OverlayItemIdentity {
  const identity: OverlayItemIdentity = {
    itemId: item.itemId,
    providerId: item.providerId,
  };

  return Object.freeze(identity);
}

function statusMetadataView(
  state: OverlayUiState,
  subtitle: string,
  context: string,
): OverlayStatusMetadataView {
  const treatment = visualTreatmentForOverlayState(state);
  const metadata: OverlayStatusMetadataView = {
    category: treatment.label,
    context,
    kind: "status",
    subtitle,
    title: treatment.message,
  };

  return Object.freeze(metadata);
}

function statusMetadataAnimationIdentityKey(
  metadata: OverlayStatusMetadataView,
): string {
  const category = metadata.category;
  const title = metadata.title;
  const subtitle = metadata.subtitle;
  const context = metadata.context;

  return `${category.length}:${category}${title.length}:${title}${subtitle.length}:${subtitle}${context.length}:${context}`;
}

function reconnectingMetadataView(
  state: Extract<OverlayUiState, { readonly kind: "reconnecting" }>,
): OverlayMetadataView {
  switch (state.lastItem.kind) {
    case "unavailable":
      return statusMetadataView(
        state,
        "No previous item is available.",
        "Waiting for Spotify playback updates to return.",
      );
    case "available":
      return itemMetadataView(state.lastItem.item, stalePresentation);
  }

  return unreachable(state.lastItem);
}

function authorizationRequiredContext(
  reason: Extract<
    OverlayUiState,
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
  reason: Extract<OverlayUiState, { readonly kind: "unsupported" }>["reason"],
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
  failure: Extract<OverlayUiState, { readonly kind: "failure" }>["error"],
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
  reason: Extract<
    OverlayUiState,
    { readonly kind: "fatal-initialization-failure" }
  >["reason"],
): string {
  switch (reason) {
    case "browser-capability-unavailable":
      return "A required browser playback capability is unavailable.";
    case "configuration-unavailable":
      return "The public Spotify configuration could not be loaded.";
  }

  return unreachable(reason);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata value: ${String(value)}`);
}
