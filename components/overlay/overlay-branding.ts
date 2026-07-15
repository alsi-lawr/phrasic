import {
  overlayViewBoxWidth,
  type OverlayDisplayWidth,
} from "./overlay-geometry.ts";
import { overlayMetadataLayout } from "./overlay-layout.ts";

export const spotifyFullLogoAsset: Readonly<{
  archiveMember: string;
  archiveUrl: string;
  path: string;
  sha256: string;
}> = {
  archiveMember: "Full_Logo_White_RGB.svg",
  archiveUrl:
    "https://developer.spotify.com/images/guidelines/design/2024-spotify-full-logo.zip",
  path: "/spotify-full-logo-white.svg",
  sha256: "31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c",
};

export const spotifyFullLogoSourceViewBox: Readonly<{
  height: number;
  width: number;
}> = {
  height: 225.25,
  width: 823.46,
};

export const spotifyFullLogoMinimumCssWidth = 70;

export const spotifyFullLogoLayout: Readonly<{
  height: number;
  width: number;
  y: number;
}> = {
  height: 66,
  width: 240,
  y: 86,
};

export type SpotifyFullLogoPlacement =
  | {
      readonly kind: "hidden";
    }
  | {
      readonly height: number;
      readonly kind: "visible";
      readonly width: number;
      readonly x: number;
      readonly y: number;
    };

const hiddenSpotifyFullLogoPlacement: SpotifyFullLogoPlacement = {
  kind: "hidden",
};

export const spotifyFullLogoExclusionZone =
  ((spotifyFullLogoSourceViewBox.height / 2) * spotifyFullLogoLayout.width) /
  spotifyFullLogoSourceViewBox.width;

export function spotifyFullLogoPlacementForShellWidth(
  shellWidth: number,
): SpotifyFullLogoPlacement {
  const minimumShellWidth =
    overlayMetadataLayout.x +
    spotifyFullLogoLayout.width +
    overlayMetadataLayout.rightPadding;

  if (shellWidth < minimumShellWidth) {
    return hiddenSpotifyFullLogoPlacement;
  }

  return {
    height: spotifyFullLogoLayout.height,
    kind: "visible",
    width: spotifyFullLogoLayout.width,
    x:
      shellWidth -
      overlayMetadataLayout.rightPadding -
      spotifyFullLogoLayout.width,
    y: spotifyFullLogoLayout.y,
  };
}

export function spotifyFullLogoCssWidth(
  displayWidth: OverlayDisplayWidth,
): number {
  return (
    (spotifyFullLogoLayout.width * displayWidth.value) / overlayViewBoxWidth
  );
}
