import type { ReactElement } from "react";
import type { NowPlayingItem } from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";
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
      <rect
        x={128}
        y={128}
        width={824}
        height={824}
        rx={48}
        fill="#05070a"
        stroke="#35404d"
        strokeWidth={4}
      />
      <ArtworkTreatment motion={motion} treatment={treatment} />
    </g>
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
      return (
        <g opacity={0.45}>
          <CurrentArtwork item={treatment.item} motion={motion} />
        </g>
      );
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
          x={128}
          y={128}
          width={824}
          height={824}
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
