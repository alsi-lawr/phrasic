import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  spotifyFullLogoAsset,
  spotifyFullLogoCssWidth,
  spotifyFullLogoExclusionZone,
  spotifyFullLogoLayout,
  spotifyFullLogoMinimumCssWidth,
} from "../../components/overlay/overlay-branding.ts";
import { overlayArtworkRectangle } from "../../components/overlay/overlay-artwork.ts";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";

test("the bundled Spotify full logo remains the approved asset and clears the artwork", () => {
  const logoBytes = readFileSync(
    new URL("../../public/spotify-full-logo-white.svg", import.meta.url),
  );
  const assetHash = createHash("sha256").update(logoBytes).digest("hex");
  const geometry = resolveOverlayGeometry(new URLSearchParams());
  const artworkRight =
    overlayArtworkRectangle.x + overlayArtworkRectangle.width;

  assert.equal(spotifyFullLogoAsset.archiveMember, "Full_Logo_White_RGB.svg");
  assert.equal(spotifyFullLogoAsset.path, "/spotify-full-logo-white.svg");
  assert.equal(assetHash, spotifyFullLogoAsset.sha256);
  assert.ok(
    spotifyFullLogoCssWidth(geometry.width) >= spotifyFullLogoMinimumCssWidth,
  );
  assert.ok(
    spotifyFullLogoLayout.x - artworkRight >= spotifyFullLogoExclusionZone,
  );
});
