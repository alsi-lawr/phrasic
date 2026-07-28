import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  overlayItemAppearanceDurationSeconds,
  overlayItemAppearanceKeySpline,
  overlayMotionDecisionForPreference,
} from "../../components/overlay/overlay-motion.ts";

test("overlay motion decisions enable SVG motion only when reduced motion is not preferred", () => {
  assert.deepEqual(overlayMotionDecisionForPreference(false), {
    kind: "enabled",
  });
  assert.deepEqual(overlayMotionDecisionForPreference(true), {
    kind: "reduced",
  });
  assert.equal(overlayItemAppearanceDurationSeconds, 2);
  assert.equal(overlayItemAppearanceKeySpline, "0.42 0 0.58 1");
});
