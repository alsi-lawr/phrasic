import assert from "node:assert/strict";
import test from "node:test";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";

test("overlay motion decisions enable SVG motion only when reduced motion is not preferred", () => {
  assert.deepEqual(overlayMotionDecisionForPreference(false), {
    kind: "enabled",
  });
  assert.deepEqual(overlayMotionDecisionForPreference(true), {
    kind: "reduced",
  });
});
