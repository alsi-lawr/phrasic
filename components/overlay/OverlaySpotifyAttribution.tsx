import type { ReactElement } from "react";
import {
  spotifyFullLogoAsset,
  spotifyFullLogoLayout,
} from "./overlay-branding.ts";

export function OverlaySpotifyAttribution(): ReactElement {
  return (
    <image
      href={spotifyFullLogoAsset.path}
      x={spotifyFullLogoLayout.x}
      y={spotifyFullLogoLayout.y}
      width={spotifyFullLogoLayout.width}
      height={spotifyFullLogoLayout.height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
