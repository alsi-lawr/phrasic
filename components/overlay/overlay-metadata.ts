import type {
  AuthorizationRequiredReason,
  Collection,
  Creator,
  DisplayText,
  NowPlayingItem,
  PlaybackFailure,
  ProviderId,
  ProviderItemId,
  ProviderLink,
  Show,
  UnsupportedPlaybackReason,
} from "../../domain/playback.ts";
import type {
  FatalInitializationFailureReason,
  OverlayStatusView,
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
  readonly itemIdentity: OverlayItemIdentity;
  readonly itemLinks: ReadonlyArray<ProviderLink>;
  readonly kind: "track";
  readonly presentation: OverlayItemMetadataPresentation;
  readonly trackTitle: DisplayText;
};

export type OverlayEpisodeMetadataView = {
  readonly episodeTitle: DisplayText;
  readonly itemIdentity: OverlayItemIdentity;
  readonly itemLinks: ReadonlyArray<ProviderLink>;
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

export type OverlayItemMetadataView =
  OverlayEpisodeMetadataView | OverlayTrackMetadataView;

export type OverlayMetadataView =
  OverlayItemMetadataView | OverlayStatusMetadataView;

export function metadataViewForItem(
  item: NowPlayingItem,
  presentation: OverlayItemMetadataPresentation,
): OverlayItemMetadataView {
  switch (item.kind) {
    case "track":
      return trackMetadataView(item, presentation);
    case "episode":
      return episodeMetadataView(item, presentation);
  }

  return unreachable(item);
}

export function statusMetadataView(
  status: OverlayStatusView,
  subtitle: string,
  context: string,
): OverlayStatusMetadataView {
  return Object.freeze({
    category: status.label,
    context,
    kind: "status",
    subtitle,
    title: status.message,
  });
}

export function authorizationRequiredContext(
  reason: AuthorizationRequiredReason,
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

export function unsupportedSubtitle(reason: UnsupportedPlaybackReason): string {
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

export function playbackFailureSubtitle(failure: PlaybackFailure): string {
  switch (failure.kind) {
    case "authorization-failed":
      return authorizationFailureSubtitle(failure.reason);
    case "provider-failed":
      return providerFailureSubtitle(failure.reason);
  }

  return unreachable(failure);
}

export function fatalInitializationFailureContext(
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

function trackMetadataView(
  item: Extract<NowPlayingItem, { readonly kind: "track" }>,
  presentation: OverlayItemMetadataPresentation,
): OverlayTrackMetadataView {
  return Object.freeze({
    album: item.collection,
    artists: item.artists,
    itemIdentity: overlayItemIdentityFor(item),
    itemLinks: item.links,
    kind: "track",
    presentation,
    trackTitle: item.title,
  });
}

function episodeMetadataView(
  item: Extract<NowPlayingItem, { readonly kind: "episode" }>,
  presentation: OverlayItemMetadataPresentation,
): OverlayEpisodeMetadataView {
  return Object.freeze({
    episodeTitle: item.title,
    itemIdentity: overlayItemIdentityFor(item),
    itemLinks: item.links,
    kind: "episode",
    presentation,
    show: item.show,
  });
}

function overlayItemIdentityFor(item: NowPlayingItem): OverlayItemIdentity {
  return Object.freeze({
    itemId: item.itemId,
    providerId: item.providerId,
  });
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

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata value: ${String(value)}`);
}
