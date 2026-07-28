import assert from "node:assert/strict";
import { test } from "bun:test";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";

test("overlay motion follows the reduced-motion preference", () => {
  assert.deepEqual(overlayMotionDecisionForPreference(false), {
    kind: "enabled",
  });
  assert.deepEqual(overlayMotionDecisionForPreference(true), {
    kind: "reduced",
  });
});
