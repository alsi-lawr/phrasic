import type { ReactElement } from "react";
import type { LocalPlaybackView } from "../../browser/local/presentation-view.ts";
import type { OverlayGeometry } from "../overlay/overlay-geometry.ts";
import type { OverlayMotionDecision } from "../overlay/overlay-motion.ts";
import {
  OverlayFallbackArtwork,
  OverlayReferencedArtwork,
} from "../overlay/OverlayArtwork.tsx";
import { OverlayVisualFrame } from "../overlay/OverlayVisualFrame.tsx";
import { LocalPlaybackAttribution } from "./LocalPlaybackAttribution.tsx";
import { LocalPlaybackMetadata } from "./LocalPlaybackMetadata.tsx";
import { localAnimationIdentityKey } from "./local-playback-identity.ts";

type LocalPlaybackVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly presentation: LocalPlaybackView;
};

export function LocalPlaybackVisual({
  geometry,
  motion,
  presentation,
}: LocalPlaybackVisualProps): ReactElement {
  return (
    <OverlayVisualFrame
      animationIdentity={localAnimationIdentityKey}
      geometry={geometry}
      motion={motion}
      renderArtwork={({ motion: displayedMotion, snapshot }) => (
        <LocalPlaybackArtwork
          motion={displayedMotion}
          presentation={snapshot}
        />
      )}
      renderAttribution={(shellWidth): ReactElement => (
        <LocalPlaybackAttribution shellWidth={shellWidth} />
      )}
      renderMetadata={({
        animationIdentityKey,
        availableWidth,
        motion: displayedMotion,
        onTextMeasurement,
        snapshot,
      }): ReactElement => (
        <LocalPlaybackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={displayedMotion}
          onTextMeasurement={onTextMeasurement}
          presentation={snapshot}
        />
      )}
      snapshot={presentation}
    />
  );
}

type LocalPlaybackArtworkProps = {
  readonly motion: OverlayMotionDecision;
  readonly presentation: LocalPlaybackView;
};

function LocalPlaybackArtwork({
  motion,
  presentation,
}: LocalPlaybackArtworkProps): ReactElement {
  const identity = localAnimationIdentityKey(presentation);
  switch (presentation.kind) {
    case "content":
    case "stale-content": {
      const artwork = presentation.snapshot.metadata.artwork;
      return artwork === undefined ? (
        <OverlayFallbackArtwork identity={identity} motion={motion} />
      ) : (
        <OverlayReferencedArtwork
          href={artwork}
          identity={identity}
          motion={motion}
        />
      );
    }
    case "metadata-unavailable":
    case "unavailable":
      return <OverlayFallbackArtwork identity={identity} motion={motion} />;
  }

  return unreachable(presentation);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local artwork value: ${String(value)}`);
}
