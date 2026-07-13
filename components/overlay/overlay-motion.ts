export type OverlayMotionDecision =
  | {
      readonly kind: "enabled";
    }
  | {
      readonly kind: "reduced";
    };

export const fallbackVinylRotationDurationSeconds = 2;
export const overlayItemAppearanceDurationSeconds = 2;
export const overlayItemAppearanceKeySpline = "0.42 0 0.58 1";

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
