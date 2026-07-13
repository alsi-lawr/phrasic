import type { ReactElement } from "react";
import {
  spotifyFullLogoAsset,
  spotifyFullLogoPlacementForShellWidth,
} from "./overlay-branding.ts";

type OverlaySpotifyAttributionProps = {
  readonly shellWidth: number;
};

export function OverlaySpotifyAttribution({
  shellWidth,
}: OverlaySpotifyAttributionProps): ReactElement | null {
  const placement = spotifyFullLogoPlacementForShellWidth(shellWidth);

  if (placement.kind === "hidden") {
    return null;
  }

  return (
    <image
      href={spotifyFullLogoAsset.path}
      x={placement.x}
      y={placement.y}
      width={placement.width}
      height={placement.height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
