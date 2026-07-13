import type { ReactElement } from "react";
import type { NowPlayingItem } from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";
import {
  overlayArtworkClipPathId,
  overlayArtworkRectangle,
} from "./overlay-artwork.ts";
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
      <rect
        x={overlayArtworkRectangle.x}
        y={overlayArtworkRectangle.y}
        width={overlayArtworkRectangle.width}
        height={overlayArtworkRectangle.height}
        rx={overlayArtworkRectangle.cornerRadius}
        ry={overlayArtworkRectangle.cornerRadius}
        className="fill-overlay-artwork-surface stroke-overlay-rule stroke-4"
      />
      <ArtworkTreatment motion={motion} treatment={treatment} />
    </g>
  );
}

function ArtworkClipPath(): ReactElement {
  return (
    <defs>
      <clipPath id={overlayArtworkClipPathId} clipPathUnits="userSpaceOnUse">
        <rect
          x={overlayArtworkRectangle.x}
          y={overlayArtworkRectangle.y}
          width={overlayArtworkRectangle.width}
          height={overlayArtworkRectangle.height}
          rx={overlayArtworkRectangle.cornerRadius}
          ry={overlayArtworkRectangle.cornerRadius}
        />
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
        <g clipPath={`url(#${overlayArtworkClipPathId})`}>
          <image
            href={item.artwork.url.value}
            x={overlayArtworkRectangle.x}
            y={overlayArtworkRectangle.y}
            width={overlayArtworkRectangle.width}
            height={overlayArtworkRectangle.height}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      );
    case "unavailable":
      return <FallbackVinyl motion={motion} />;
  }

  return unreachable(item.artwork);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay artwork treatment: ${String(value)}`);
}
