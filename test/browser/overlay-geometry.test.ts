import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultOverlayDisplayWidth,
  maximumOverlayDisplayWidth,
  minimumOverlayDisplayWidth,
  overlayViewBox,
  overlayViewBoxHeight,
  overlayViewBoxWidth,
  resolveOverlayGeometry,
} from "../../components/overlay/overlay-geometry.ts";

test("overlay geometry defaults to the validated display width and exact fixed ratio", () => {
  const geometry = resolveOverlayGeometry(new URLSearchParams());

  assert.equal(geometry.width.value, defaultOverlayDisplayWidth);
  assert.equal(
    geometry.height.value,
    (defaultOverlayDisplayWidth * overlayViewBoxHeight) / overlayViewBoxWidth,
  );
  assert.equal(geometry.viewBox, overlayViewBox);
  assert.equal(geometry.setupMode.kind, "overlay");
  assert.equal(Object.isFrozen(geometry), true);
  assert.equal(Object.isFrozen(geometry.width), true);
  assert.equal(Object.isFrozen(geometry.height), true);
});

test("overlay geometry accepts the inclusive width bounds and setup flag", () => {
  const minimum = resolveOverlayGeometry(
    new URLSearchParams(`width=${minimumOverlayDisplayWidth}`),
  );
  const maximum = resolveOverlayGeometry(
    new URLSearchParams(`width=${maximumOverlayDisplayWidth}&setup=1`),
  );
  const setupOnly = resolveOverlayGeometry(new URLSearchParams("setup=1"));

  assert.equal(minimum.width.value, minimumOverlayDisplayWidth);
  assert.equal(
    minimum.height.value,
    (minimumOverlayDisplayWidth * overlayViewBoxHeight) / overlayViewBoxWidth,
  );
  assert.equal(maximum.width.value, maximumOverlayDisplayWidth);
  assert.equal(
    maximum.height.value,
    (maximumOverlayDisplayWidth * overlayViewBoxHeight) / overlayViewBoxWidth,
  );
  assert.equal(minimum.setupMode.kind, "overlay");
  assert.equal(maximum.setupMode.kind, "setup");
  assert.equal(setupOnly.width.value, defaultOverlayDisplayWidth);
  assert.equal(setupOnly.setupMode.kind, "setup");
});

test("overlay geometry falls back for display query forms rejected by the application contract", () => {
  const invalidQueries: ReadonlyArray<string> = [
    "width=319",
    "width=7681",
    "width=1280&width=1281",
    "width=1280.5",
    "width=not-a-number",
    "width=1280&setup=1&setup=1",
    "width=1280&setup=true",
    "width=1280&debug=true",
  ];

  for (const query of invalidQueries) {
    const geometry = resolveOverlayGeometry(new URLSearchParams(query));

    assert.equal(geometry.width.value, defaultOverlayDisplayWidth, query);
    assert.equal(geometry.setupMode.kind, "overlay", query);
  }
});
