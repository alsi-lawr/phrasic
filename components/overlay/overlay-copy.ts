import type {
  AuthorizationRequiredReason,
  PlaybackFailure,
  UnsupportedPlaybackReason,
} from "../../domain/playback.ts";
import type { NowPlayingItem } from "../../domain/playback-item.ts";
import type { OverlayPresentation } from "./overlay-presentation.ts";

export function authorizationRequiredContext(
  reason: AuthorizationRequiredReason,
  displayName: string,
): string {
  switch (reason) {
    case "authorization-expired":
      return `${displayName} authorization expired.`;
    case "authorization-revoked":
      return `${displayName} authorization was revoked.`;
    case "not-authorized":
      return `${displayName} is not connected in this browser profile.`;
    case "permission-required":
      return `${displayName} playback permission is required.`;
  }

  return unreachable(reason);
}

export function unsupportedSubtitle(
  reason: UnsupportedPlaybackReason,
  displayName: string,
): string {
  switch (reason) {
    case "advertisement":
      return `${displayName} is playing an advertisement.`;
    case "local-item":
      return `${displayName} is playing a local item.`;
    case "unknown-item-type":
      return `${displayName} returned an unsupported item type.`;
  }

  return unreachable(reason);
}

export function playbackFailureSubtitle(
  failure: PlaybackFailure,
  displayName: string,
): string {
  switch (failure.kind) {
    case "authorization-failed":
      return authorizationFailureSubtitle(failure.reason, displayName);
    case "provider-failed":
      return providerFailureSubtitle(failure.reason, displayName);
  }

  return unreachable(failure);
}

function authorizationFailureSubtitle(
  reason: Extract<
    PlaybackFailure,
    { readonly kind: "authorization-failed" }
  >["reason"],
  displayName: string,
): string {
  switch (reason) {
    case "authorization-denied":
      return `${displayName} authorization was denied.`;
    case "code-exchange-rejected":
      return `${displayName} rejected the authorization code.`;
  }

  return unreachable(reason);
}

function providerFailureSubtitle(
  reason: Extract<
    PlaybackFailure,
    { readonly kind: "provider-failed" }
  >["reason"],
  displayName: string,
): string {
  switch (reason) {
    case "malformed-response":
      return `${displayName} returned an unreadable playback response.`;
    case "network":
      return `The ${displayName} connection is unavailable.`;
    case "rate-limited":
      return `${displayName} temporarily limited playback requests.`;
    case "server-error":
      return `${displayName} returned a server error.`;
  }

  return unreachable(reason);
}

export function artistNames(
  item: Extract<NowPlayingItem, { readonly kind: "track" }>,
): string {
  return item.artists.map((artist): string => artist.name).join(", ");
}

export function providerLabel(presentation: OverlayPresentation): string {
  return presentation.displayName.toLocaleUpperCase("en-US");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay copy value: ${String(value)}`);
}
