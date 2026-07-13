export type SvgTextBounds = {
  readonly availableWidth: number;
  readonly measuredWidth: number;
};

export type MarqueeOverflowDecision =
  | {
      readonly kind: "contained";
    }
  | {
      readonly endX: number;
      readonly kind: "overflowing";
      readonly measuredWidth: number;
      readonly startX: number;
      readonly travelDistance: number;
    };

export const marqueeAnimationDurationSeconds = 20;
const containedDecision: MarqueeOverflowDecision = Object.freeze({
  kind: "contained",
});

export function marqueeDecisionForTextBounds(
  bounds: SvgTextBounds,
): MarqueeOverflowDecision {
  if (!(bounds.measuredWidth > bounds.availableWidth)) {
    return containedDecision;
  }

  const decision: MarqueeOverflowDecision = {
    endX: -bounds.measuredWidth,
    kind: "overflowing",
    measuredWidth: bounds.measuredWidth,
    startX: bounds.availableWidth,
    travelDistance: bounds.availableWidth + bounds.measuredWidth,
  };

  return Object.freeze(decision);
}
