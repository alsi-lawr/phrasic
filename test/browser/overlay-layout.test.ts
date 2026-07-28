import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  emptyOverlayTextWidths,
  overlayMetadataAvailableWidth,
  overlayMetadataLayout,
  overlayShell,
  overlayShellWidthForTextWidths,
  overlayTextWidthsWithMeasurement,
} from "../../components/overlay/overlay-layout.ts";

test("the shell is content-sized between its baseline minimum and maximum", () => {
  const shortContentWidth = overlayShellWidthForTextWidths({
    context: 420,
    creator: 1_000,
    detail: 680,
    title: 920,
  });
  const expectedShortContentWidth =
    overlayMetadataLayout.x + 1_000 + overlayMetadataLayout.rightPadding;

  assert.equal(overlayShell.minimumWidth, 1_080);
  assert.equal(overlayShell.maximumWidth, 4_725);
  assert.equal(overlayShellWidthForTextWidths(emptyOverlayTextWidths), 1_080);
  assert.equal(shortContentWidth, expectedShortContentWidth);
  assert.equal(overlayMetadataAvailableWidth(shortContentWidth), 1_000);
  assert.equal(
    overlayShellWidthForTextWidths({
      context: 9_000,
      creator: 0,
      detail: 0,
      title: 0,
    }),
    4_725,
  );
});

test("text measurements update one visual line without widening stale values", () => {
  const titleMeasured = overlayTextWidthsWithMeasurement(
    emptyOverlayTextWidths,
    { identity: "spotify:track-1", line: "title", width: 1_200 },
  );
  const ignoredInvalidMeasurement = overlayTextWidthsWithMeasurement(
    titleMeasured,
    { identity: "spotify:track-1", line: "detail", width: Number.NaN },
  );

  assert.deepEqual(titleMeasured, {
    context: 0,
    creator: 0,
    detail: 0,
    title: 1_200,
  });
  assert.equal(ignoredInvalidMeasurement, titleMeasured);
});
