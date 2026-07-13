import assert from "node:assert/strict";
import test from "node:test";
import {
  overlayArtworkClipPathId,
  overlayArtworkLeftCornerClipPathData,
  overlayArtworkRectangle,
  overlayShell,
} from "../../components/overlay/overlay-layout.ts";

test("the artwork is full-height, flush left, and clipped only at the shell's left corners", () => {
  assert.equal(overlayShell.height, 1_080);
  assert.equal(overlayShell.radius, 200);
  assert.deepEqual(overlayArtworkRectangle, {
    height: 1_080,
    width: 1_080,
    x: 0,
    y: 0,
  });
  assert.equal(
    overlayArtworkLeftCornerClipPathData,
    "M 200 0 H 1080 V 1080 H 200 A 200 200 0 0 1 0 880 V 200 A 200 200 0 0 1 200 0 Z",
  );
  assert.equal(overlayArtworkClipPathId, "overlay-artwork-left-corners-clip");
  assert.equal(Object.isFrozen(overlayArtworkRectangle), true);
});
