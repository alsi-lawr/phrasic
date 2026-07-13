import type { ReactElement } from "react";
import type { LastPlaybackItem } from "../../domain/playback.ts";
import { FallbackVinyl } from "./FallbackVinyl.tsx";

type OverlayArtworkProps = {
  readonly item: LastPlaybackItem;
};

export function OverlayArtwork({ item }: OverlayArtworkProps): ReactElement {
  const artworkUrl = originalArtworkUrl(item);

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
      {artworkUrl === undefined ? (
        <FallbackVinyl />
      ) : (
        <image
          href={artworkUrl}
          x={128}
          y={128}
          width={824}
          height={824}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
    </g>
  );
}

function originalArtworkUrl(item: LastPlaybackItem): string | undefined {
  if (item.kind === "unavailable") {
    return undefined;
  }

  if (item.item.artwork.kind === "unavailable") {
    return undefined;
  }

  return item.item.artwork.url.value;
}
