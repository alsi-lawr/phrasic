import {
  overlayMotionDecisionForPreference,
  type OverlayMotionDecision,
} from "../../components/overlay/overlay-motion.ts";

declare const motion: OverlayMotionDecision;

const enabledMotion: OverlayMotionDecision = Object.freeze({
  kind: "enabled",
});
const reducedMotion: OverlayMotionDecision = Object.freeze({
  kind: "reduced",
});

// @ts-expect-error Overlay motion does not allow an undeclared rendering mode.
const invalidMotion: OverlayMotionDecision = { kind: "automatic" };

function motionKind(
  decision: OverlayMotionDecision,
): OverlayMotionDecision["kind"] {
  switch (decision.kind) {
    case "enabled":
    case "reduced":
      return decision.kind;
  }

  const unhandledDecision: never = decision;
  return unhandledDecision;
}

void enabledMotion;
void reducedMotion;
void invalidMotion;
void motionKind(motion);
void overlayMotionDecisionForPreference(false);
