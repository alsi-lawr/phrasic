import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import {
  currentPlaybackItem,
  type LastPlaybackItem,
  type NowPlayingItem,
  type PlaybackState,
} from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";
import {
  overlayArtworkRoundedClipPathData,
  overlayArtworkClipPathId,
  overlayArtworkRectangle,
} from "./overlay-layout.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type OverlayArtworkProps = {
  readonly motion: OverlayMotionDecision;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayArtwork({
  motion,
  snapshot,
}: OverlayArtworkProps): ReactElement {
  return (
    <g>
      <ArtworkClipPath />
      <g clipPath={`url(#${overlayArtworkClipPathId})`}>
        <ArtworkWithFadeIn motion={motion} snapshot={snapshot} />
      </g>
    </g>
  );
}

function ArtworkWithFadeIn({
  motion,
  snapshot,
}: OverlayArtworkProps): ReactElement {
  return (
    <g
      key={artworkIdentity(snapshot)}
      className={
        motion.kind === "enabled" ? "animate-artwork-fade-in" : undefined
      }
    >
      <ArtworkForSnapshot motion={motion} snapshot={snapshot} />
    </g>
  );
}

function artworkIdentity(snapshot: BrowserPlaybackApplicationSnapshot): string {
  switch (snapshot.kind) {
    case "fatal":
      return "artwork:fallback";
    case "playback":
      return lastItemArtworkIdentity(currentPlaybackItem(snapshot.state));
  }

  return unreachable(snapshot);
}

function lastItemArtworkIdentity(item: LastPlaybackItem): string {
  switch (item.kind) {
    case "available":
      switch (item.item.artwork.kind) {
        case "available": {
          const url = item.item.artwork.url;
          return `artwork:available:${url.length}:${url}`;
        }
        case "unavailable":
          return "artwork:fallback";
      }
      return unreachable(item.item.artwork);
    case "unavailable":
      return "artwork:fallback";
  }

  return unreachable(item);
}

function ArtworkClipPath(): ReactElement {
  return (
    <defs>
      <clipPath id={overlayArtworkClipPathId} clipPathUnits="userSpaceOnUse">
        <path d={overlayArtworkRoundedClipPathData} />
      </clipPath>
    </defs>
  );
}

type ArtworkForSnapshotProps = {
  readonly motion: OverlayMotionDecision;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function ArtworkForSnapshot({
  motion,
  snapshot,
}: ArtworkForSnapshotProps): ReactElement {
  switch (snapshot.kind) {
    case "fatal":
      return <FallbackVinyl motion={motion} />;
    case "playback":
      return <ArtworkForPlaybackState motion={motion} state={snapshot.state} />;
  }

  return unreachable(snapshot);
}

type ArtworkForPlaybackStateProps = {
  readonly motion: OverlayMotionDecision;
  readonly state: PlaybackState;
};

function ArtworkForPlaybackState({
  motion,
  state,
}: ArtworkForPlaybackStateProps): ReactElement {
  switch (state.kind) {
    case "playing":
    case "paused":
      return <CurrentArtwork item={state.snapshot.item} motion={motion} />;
    case "reconnecting":
      return <ReconnectingArtwork motion={motion} state={state} />;
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "unsupported":
    case "failure":
      return <FallbackVinyl motion={motion} />;
  }

  return unreachable(state);
}

type ReconnectingArtworkProps = {
  readonly motion: OverlayMotionDecision;
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingArtwork({
  motion,
  state,
}: ReconnectingArtworkProps): ReactElement {
  switch (state.lastItem.kind) {
    case "available":
      return <CurrentArtwork item={state.lastItem.item} motion={motion} />;
    case "unavailable":
      return <FallbackVinyl motion={motion} />;
  }

  return unreachable(state.lastItem);
}

type CurrentArtworkProps = {
  readonly item: NowPlayingItem;
  readonly motion: OverlayMotionDecision;
};

function CurrentArtwork({ item, motion }: CurrentArtworkProps): ReactElement {
  switch (item.artwork.kind) {
    case "available":
      return (
        <image
          href={item.artwork.url}
          x={overlayArtworkRectangle.x}
          y={overlayArtworkRectangle.y}
          width={overlayArtworkRectangle.width}
          height={overlayArtworkRectangle.height}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    case "unavailable":
      return <FallbackVinyl motion={motion} />;
  }

  return unreachable(item.artwork);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay artwork value: ${String(value)}`);
}
