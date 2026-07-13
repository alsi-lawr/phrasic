export type OverlayMotionDecision =
  | {
      readonly kind: "enabled";
    }
  | {
      readonly kind: "reduced";
    };

const enabledMotionDecision = Object.freeze({
  kind: "enabled",
} satisfies OverlayMotionDecision);
const reducedMotionDecision = Object.freeze({
  kind: "reduced",
} satisfies OverlayMotionDecision);

export function overlayMotionDecisionForPreference(
  prefersReducedMotion: boolean,
): OverlayMotionDecision {
  return prefersReducedMotion ? reducedMotionDecision : enabledMotionDecision;
}
