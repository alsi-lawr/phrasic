import {
  overlayViewBoxWidth,
  type OverlayDisplayWidth,
} from "./overlay-geometry.ts";

export const spotifyFullLogoAsset = Object.freeze({
  archiveMember: "Full_Logo_White_RGB.svg",
  archiveUrl:
    "https://developer.spotify.com/images/guidelines/design/2024-spotify-full-logo.zip",
  path: "/spotify-full-logo-white.svg",
  sha256: "31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c",
});

export const spotifyFullLogoSourceViewBox = Object.freeze({
  height: 225.25,
  width: 823.46,
});

export const spotifyFullLogoMinimumCssWidth = 70;

export const spotifyFullLogoLayout = Object.freeze({
  height: 66,
  width: 240,
  x: 1_360,
  y: 86,
});

export const spotifyFullLogoExclusionZone =
  ((spotifyFullLogoSourceViewBox.height / 2) * spotifyFullLogoLayout.width) /
  spotifyFullLogoSourceViewBox.width;

export function spotifyFullLogoCssWidth(
  displayWidth: OverlayDisplayWidth,
): number {
  return (
    (spotifyFullLogoLayout.width * displayWidth.value) / overlayViewBoxWidth
  );
}
