export type OverlayMotionDecision =
  | {
      readonly kind: "enabled";
    }
  | {
      readonly kind: "reduced";
    };

const enabledMotionDecision = {
  kind: "enabled",
} satisfies OverlayMotionDecision;
const reducedMotionDecision = {
  kind: "reduced",
} satisfies OverlayMotionDecision;

export function overlayMotionDecisionForPreference(
  prefersReducedMotion: boolean,
): OverlayMotionDecision {
  return prefersReducedMotion ? reducedMotionDecision : enabledMotionDecision;
}
