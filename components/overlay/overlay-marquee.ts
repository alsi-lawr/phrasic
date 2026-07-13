export type SvgTextBounds = {
  readonly availableWidth: number;
  readonly measuredWidth: number;
};

export type MarqueeOverflowDecision =
  | {
      readonly kind: "contained";
    }
  | {
      readonly kind: "overflowing";
      readonly measuredWidth: number;
      readonly travelDistance: number;
    };

const marqueeGap = 160;
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
    kind: "overflowing",
    measuredWidth: bounds.measuredWidth,
    travelDistance: bounds.measuredWidth + marqueeGap,
  };

  return Object.freeze(decision);
}
