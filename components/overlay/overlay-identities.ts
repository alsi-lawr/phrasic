import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { NowPlayingItem, PlaybackState } from "../../domain/playback.ts";

export function overlayItemIdentityKey(item: NowPlayingItem): string {
  const providerId = item.providerId.value;
  const itemId = item.itemId.value;

  return `${providerId.length}:${providerId}${itemId.length}:${itemId}`;
}

export function overlayAnimationIdentityKey(
  snapshot: BrowserPlaybackApplicationSnapshot,
): string {
  switch (snapshot.kind) {
    case "fatal":
      return `animation:fatal:${snapshot.reason}`;
    case "playback":
      return playbackAnimationIdentityKey(snapshot.state);
  }

  return unreachable(snapshot);
}

export function overlayLiveAnnouncementKey(
  snapshot: BrowserPlaybackApplicationSnapshot,
): string {
  switch (snapshot.kind) {
    case "fatal":
      return "announcement:state:fatal-initialization-failure";
    case "playback":
      return playbackLiveAnnouncementKey(snapshot.state);
  }

  return unreachable(snapshot);
}

function playbackAnimationIdentityKey(state: PlaybackState): string {
  switch (state.kind) {
    case "initializing":
    case "authorizing":
    case "empty":
      return `animation:state:${state.kind}`;
    case "authorization-required":
      return `animation:state:${state.kind}:${state.reason}`;
    case "playing":
    case "paused":
      return animationItemIdentityKey(state.snapshot.item);
    case "unsupported":
      return `animation:state:${state.kind}:${state.reason}`;
    case "reconnecting":
      return reconnectingAnimationIdentityKey(state);
    case "failure":
      return `animation:state:${state.kind}:${state.error.kind}:${state.error.reason}`;
  }

  return unreachable(state);
}

function reconnectingAnimationIdentityKey(
  state: Extract<PlaybackState, { readonly kind: "reconnecting" }>,
): string {
  switch (state.lastItem.kind) {
    case "available":
      return animationItemIdentityKey(state.lastItem.item);
    case "unavailable":
      return "animation:state:reconnecting";
  }

  return unreachable(state.lastItem);
}

function playbackLiveAnnouncementKey(state: PlaybackState): string {
  switch (state.kind) {
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "unsupported":
    case "failure":
      return `announcement:state:${state.kind}`;
    case "playing":
    case "paused":
      return liveAnnouncementItemIdentityKey(state.kind, state.snapshot.item);
    case "reconnecting":
      return reconnectingLiveAnnouncementKey(state);
  }

  return unreachable(state);
}

function reconnectingLiveAnnouncementKey(
  state: Extract<PlaybackState, { readonly kind: "reconnecting" }>,
): string {
  switch (state.lastItem.kind) {
    case "available":
      return liveAnnouncementItemIdentityKey(
        "reconnecting",
        state.lastItem.item,
      );
    case "unavailable":
      return "announcement:state:reconnecting";
  }

  return unreachable(state.lastItem);
}

function animationItemIdentityKey(item: NowPlayingItem): string {
  return `animation:item:${overlayItemIdentityKey(item)}`;
}

function liveAnnouncementItemIdentityKey(
  stateKind: "paused" | "playing" | "reconnecting",
  item: NowPlayingItem,
): string {
  return `announcement:item:${stateKind}:${overlayItemIdentityKey(item)}`;
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay identity value: ${String(value)}`);
}
