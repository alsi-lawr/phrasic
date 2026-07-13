import assert from "node:assert/strict";
import test from "node:test";
import {
  marqueeAnimationDurationSeconds,
  marqueeDecisionForTextBounds,
} from "../../components/overlay/overlay-marquee.ts";

test("SVG marquee activates only when measured text exceeds its available width", () => {
  const equalWidth = marqueeDecisionForTextBounds({
    availableWidth: 3_096,
    measuredWidth: 3_096,
  });
  const greaterWidth = marqueeDecisionForTextBounds({
    availableWidth: 3_096,
    measuredWidth: 3_097,
  });

  assert.deepEqual(equalWidth, { kind: "contained" });
  assert.equal(greaterWidth.kind, "overflowing");
  if (greaterWidth.kind !== "overflowing") {
    throw new Error("Expected a marquee overflow decision.");
  }
  assert.equal(greaterWidth.measuredWidth, 3_097);
  assert.equal(greaterWidth.startX, 3_096);
  assert.equal(greaterWidth.endX, -3_097);
  assert.equal(greaterWidth.travelDistance, 6_193);
  assert.equal(marqueeAnimationDurationSeconds, 20);
});
