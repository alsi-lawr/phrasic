import { type ReactElement, useState } from "react";
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
import {
  overlayItemAppearanceDurationSeconds,
  type OverlayMotionDecision,
} from "./overlay-motion.ts";

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
        <ArtworkCrossfade motion={motion} snapshot={snapshot} />
      </g>
    </g>
  );
}

type ArtworkLayer = {
  readonly identity: string;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

type ArtworkCrossfadeState =
  | {
      readonly current: ArtworkLayer;
      readonly kind: "single";
    }
  | {
      readonly current: ArtworkLayer;
      readonly kind: "crossfade";
      readonly previous: ArtworkLayer;
    };

function ArtworkCrossfade({
  motion,
  snapshot,
}: OverlayArtworkProps): ReactElement {
  const layer = artworkLayer(snapshot);
  const [state, setState] = useState<ArtworkCrossfadeState>(() =>
    Object.freeze({ current: layer, kind: "single" }),
  );

  if (motion.kind === "reduced") {
    if (state.kind !== "single" || state.current.identity !== layer.identity) {
      setState(Object.freeze({ current: layer, kind: "single" }));
    }
    return <ArtworkForSnapshot motion={motion} snapshot={snapshot} />;
  }

  if (state.current.identity !== layer.identity) {
    setState(
      Object.freeze({
        current: layer,
        kind: "crossfade",
        previous: state.current,
      }),
    );
  }

  return (
    <g>
      {state.kind === "single" ? null : (
        <g key={`outgoing:${state.previous.identity}`}>
          <ArtworkOpacityAnimation from={1} to={0} />
          <ArtworkForSnapshot
            motion={motion}
            snapshot={state.previous.snapshot}
          />
        </g>
      )}
      <g key={`incoming:${state.current.identity}`}>
        {state.kind === "single" ? null : (
          <ArtworkOpacityAnimation from={0} to={1} />
        )}
        <ArtworkForSnapshot motion={motion} snapshot={snapshot} />
      </g>
    </g>
  );
}

type ArtworkOpacityAnimationProps = {
  readonly from: 0 | 1;
  readonly to: 0 | 1;
};

function ArtworkOpacityAnimation({
  from,
  to,
}: ArtworkOpacityAnimationProps): ReactElement {
  const values = from === 1 && to === 0 ? "1;0;0" : "0;0;1";

  return (
    <animate
      attributeName="opacity"
      values={values}
      keyTimes="0;0.5;1"
      dur={`${overlayItemAppearanceDurationSeconds}s`}
      calcMode="linear"
      fill="freeze"
    />
  );
}

function artworkLayer(
  snapshot: BrowserPlaybackApplicationSnapshot,
): ArtworkLayer {
  return Object.freeze({ identity: artworkIdentity(snapshot), snapshot });
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
          const url = item.item.artwork.url.value;
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
          href={item.artwork.url.value}
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
