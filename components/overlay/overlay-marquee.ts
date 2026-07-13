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

export type StaticMarqueeTextPresentation =
  | {
      readonly kind: "natural";
    }
  | {
      readonly kind: "shrink-to-fit";
      readonly textLength: number;
    };

export const marqueeAnimationDurationSeconds = 20;
const containedDecision: MarqueeOverflowDecision = Object.freeze({
  kind: "contained",
});
const naturalStaticMarqueeTextPresentation: StaticMarqueeTextPresentation =
  Object.freeze({ kind: "natural" });

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

export function staticMarqueeTextPresentationFor(
  decision: MarqueeOverflowDecision,
): StaticMarqueeTextPresentation {
  switch (decision.kind) {
    case "contained":
      return naturalStaticMarqueeTextPresentation;
    case "overflowing":
      return shrinkToFitStaticMarqueeTextPresentation(decision.startX);
  }

  return unreachable(decision);
}

function shrinkToFitStaticMarqueeTextPresentation(
  availableWidth: number,
): StaticMarqueeTextPresentation {
  if (!(availableWidth > 0)) {
    return naturalStaticMarqueeTextPresentation;
  }

  const presentation: StaticMarqueeTextPresentation = {
    kind: "shrink-to-fit",
    textLength: availableWidth,
  };

  return Object.freeze(presentation);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected marquee overflow decision: ${String(value)}`);
}
