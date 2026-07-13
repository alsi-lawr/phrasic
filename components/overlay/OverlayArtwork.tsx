import type { ReactElement } from "react";
import type { NowPlayingItem } from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";
import {
  artworkTreatmentForOverlayState,
  type OverlayArtworkTreatment,
  type OverlayUiState,
} from "./overlay-state.ts";

type OverlayArtworkProps = {
  readonly state: OverlayUiState;
};

export function OverlayArtwork({ state }: OverlayArtworkProps): ReactElement {
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
      <ArtworkTreatment treatment={treatment} />
    </g>
  );
}

type ArtworkTreatmentProps = {
  readonly treatment: OverlayArtworkTreatment;
};

function ArtworkTreatment({ treatment }: ArtworkTreatmentProps): ReactElement {
  switch (treatment.kind) {
    case "fallback":
      return <FallbackVinyl />;
    case "current-item":
      return <CurrentArtwork item={treatment.item} />;
    case "stale-item":
      return (
        <g opacity={0.45}>
          <CurrentArtwork item={treatment.item} />
        </g>
      );
  }

  return unreachable(treatment);
}

type CurrentArtworkProps = {
  readonly item: NowPlayingItem;
};

function CurrentArtwork({ item }: CurrentArtworkProps): ReactElement {
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
      return <FallbackVinyl />;
  }

  return unreachable(item.artwork);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay artwork treatment: ${String(value)}`);
}
