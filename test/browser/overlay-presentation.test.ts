import assert from "node:assert/strict";
import test from "node:test";
import {
  overlayMetadataTextClasses,
  statusColorClassesForTone,
} from "../../components/overlay/overlay-presentation.ts";

test("overlay presentation variants preserve the approved complete Tailwind classes", () => {
  assert.deepEqual(overlayMetadataTextClasses, {
    context:
      "font-overlay-display fill-overlay-content-muted text-overlay-detail font-semibold tracking-overlay-context",
    subtitle:
      "font-overlay-display fill-overlay-content-secondary text-overlay-subtitle font-semibold tracking-overlay-normal",
    title:
      "font-overlay-display fill-overlay-content-title text-overlay-title font-bold tracking-overlay-normal",
  });
  assert.equal(Object.isFrozen(overlayMetadataTextClasses), true);

  assert.deepEqual(statusColorClassesForTone("active"), {
    fill: "fill-overlay-status-active",
    stroke: "stroke-overlay-status-active",
  });
  assert.deepEqual(statusColorClassesForTone("failure"), {
    fill: "fill-overlay-status-failure",
    stroke: "stroke-overlay-status-failure",
  });
  assert.deepEqual(statusColorClassesForTone("neutral"), {
    fill: "fill-overlay-status-neutral",
    stroke: "stroke-overlay-status-neutral",
  });
  assert.deepEqual(statusColorClassesForTone("warning"), {
    fill: "fill-overlay-status-warning",
    stroke: "stroke-overlay-status-warning",
  });
});
