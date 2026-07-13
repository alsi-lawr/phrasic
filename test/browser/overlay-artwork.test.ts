import assert from "node:assert/strict";
import test from "node:test";
import {
  legacyArtworkCornerRadius,
  legacyArtworkDimension,
  overlayArtworkClipPathId,
  overlayArtworkCornerRadius,
  overlayArtworkRectangle,
  proportionalArtworkCornerRadius,
} from "../../components/overlay/overlay-artwork.ts";

test("the artwork clip preserves the legacy corner-radius proportion", () => {
  const derivedRadius = proportionalArtworkCornerRadius({
    sourceArtworkDimension: legacyArtworkDimension,
    sourceCornerRadius: legacyArtworkCornerRadius,
    targetArtworkDimension: overlayArtworkRectangle.width,
  });

  assert.equal(legacyArtworkDimension, 1_080);
  assert.equal(legacyArtworkCornerRadius, 200);
  assert.equal(overlayArtworkRectangle.width, 824);
  assert.equal(overlayArtworkRectangle.height, 824);
  assert.equal(overlayArtworkCornerRadius, derivedRadius);
  assert.equal(overlayArtworkRectangle.cornerRadius, derivedRadius);
  assert.equal(derivedRadius, (200 * 824) / 1_080);
  assert.equal(overlayArtworkClipPathId, "overlay-artwork-clip");
  assert.equal(Object.isFrozen(overlayArtworkRectangle), true);
});
