import type { MarqueeOverflowDecision } from "../../components/overlay/overlay-marquee.ts";

declare const marqueeDecision: MarqueeOverflowDecision;

// @ts-expect-error Overflowing decisions always provide their measured distance.
const invalidMarqueeDecision: MarqueeOverflowDecision = {
  kind: "overflowing",
};

function marqueeKind(
  decision: MarqueeOverflowDecision,
): MarqueeOverflowDecision["kind"] {
  switch (decision.kind) {
    case "contained":
    case "overflowing":
      return decision.kind;
  }

  const unhandledDecision: never = decision;
  return unhandledDecision;
}

void invalidMarqueeDecision;
void marqueeKind(marqueeDecision);
