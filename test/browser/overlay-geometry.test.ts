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
  type OverlayDisplayDiagnostic,
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
  assert.equal(geometry.diagnostic.kind, "none");
  assert.equal(Object.isFrozen(geometry), true);
  assert.equal(Object.isFrozen(geometry.diagnostic), true);
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
  assert.equal(minimum.diagnostic.kind, "none");
  assert.equal(maximum.diagnostic.kind, "none");
  assert.equal(setupOnly.diagnostic.kind, "none");
});

test("overlay geometry falls back with typed diagnostics for invalid display query forms", () => {
  const invalidQueries: ReadonlyArray<InvalidDisplayQueryCase> = [
    {
      diagnostic: "repeated-display-query-parameter",
      query: "width=1280&width=1281",
    },
    {
      diagnostic: "repeated-display-query-parameter",
      query: "width=1280&setup=1&setup=1",
    },
    {
      diagnostic: "fractional-display-width",
      query: "width=1280.5",
    },
    {
      diagnostic: "malformed-display-width",
      query: "width=not-a-number",
    },
    {
      diagnostic: "out-of-range-display-width",
      query: "width=319",
    },
    {
      diagnostic: "out-of-range-display-width",
      query: "width=7681",
    },
    {
      diagnostic: "unsafe-display-width",
      query: "width=9007199254740993",
    },
    {
      diagnostic: "unsupported-display-query",
      query: "width=1280&setup=true",
    },
    {
      diagnostic: "unsupported-display-query",
      query: "width=1280&debug=true",
    },
  ];

  for (const invalidQuery of invalidQueries) {
    const geometry = resolveOverlayGeometry(
      new URLSearchParams(invalidQuery.query),
    );

    assert.equal(
      geometry.width.value,
      defaultOverlayDisplayWidth,
      invalidQuery.query,
    );
    assert.equal(geometry.setupMode.kind, "overlay", invalidQuery.query);
    assert.equal(
      geometry.diagnostic.kind,
      "invalid-display-query",
      invalidQuery.query,
    );
    if (geometry.diagnostic.kind !== "invalid-display-query") {
      throw new Error("Expected an invalid display query diagnostic.");
    }

    assert.equal(
      geometry.diagnostic.reason,
      invalidQuery.diagnostic,
      invalidQuery.query,
    );
    assert.equal(
      Object.isFrozen(geometry.diagnostic),
      true,
      invalidQuery.query,
    );
  }
});

type InvalidDisplayQueryCase = {
  readonly diagnostic: Extract<
    OverlayDisplayDiagnostic,
    { readonly kind: "invalid-display-query" }
  >["reason"];
  readonly query: string;
};
