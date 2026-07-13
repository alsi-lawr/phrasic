import type { ReactElement } from "react";
import type { NowPlayingItem } from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";
import {
  overlayArtworkLeftCornerClipPathData,
  overlayArtworkClipPathId,
  overlayArtworkRectangle,
} from "./overlay-layout.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";
import {
  artworkTreatmentForOverlayState,
  type OverlayArtworkTreatment,
  type OverlayUiState,
} from "./overlay-state.ts";

type OverlayArtworkProps = {
  readonly motion: OverlayMotionDecision;
  readonly state: OverlayUiState;
};

export function OverlayArtwork({
  motion,
  state,
}: OverlayArtworkProps): ReactElement {
  const treatment = artworkTreatmentForOverlayState(state);

  return (
    <g>
      <ArtworkClipPath />
      <g clipPath={`url(#${overlayArtworkClipPathId})`}>
        <ArtworkTreatment motion={motion} treatment={treatment} />
      </g>
    </g>
  );
}

function ArtworkClipPath(): ReactElement {
  return (
    <defs>
      <clipPath id={overlayArtworkClipPathId} clipPathUnits="userSpaceOnUse">
        <path d={overlayArtworkLeftCornerClipPathData} />
      </clipPath>
    </defs>
  );
}

type ArtworkTreatmentProps = {
  readonly motion: OverlayMotionDecision;
  readonly treatment: OverlayArtworkTreatment;
};

function ArtworkTreatment({
  motion,
  treatment,
}: ArtworkTreatmentProps): ReactElement {
  switch (treatment.kind) {
    case "fallback":
      return <FallbackVinyl motion={motion} />;
    case "current-item":
      return <CurrentArtwork item={treatment.item} motion={motion} />;
    case "stale-item":
      return <CurrentArtwork item={treatment.item} motion={motion} />;
  }

  return unreachable(treatment);
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
  throw new Error(`Unexpected overlay artwork treatment: ${String(value)}`);
}
