import type { ReactElement } from "react";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type FallbackVinylProps = {
  readonly motion: OverlayMotionDecision;
};

export function FallbackVinyl({ motion }: FallbackVinylProps): ReactElement {
  return (
    <g
      className={
        motion.kind === "enabled"
          ? "origin-center animate-vinyl-spin"
          : undefined
      }
    >
      <circle cx={540} cy={540} r={430} className="fill-overlay-vinyl-disc" />
      <circle
        cx={540}
        cy={540}
        r={404}
        className="fill-none stroke-overlay-vinyl-rim stroke-8"
      />
      <circle
        cx={540}
        cy={540}
        r={338}
        className="fill-none stroke-overlay-vinyl-groove stroke-8"
      />
      <path
        d="M 540 202 A 338 338 0 0 1 779 301"
        className="fill-none stroke-overlay-vinyl-groove stroke-8"
      />
      <circle
        cx={540}
        cy={540}
        r={258}
        className="fill-none stroke-overlay-vinyl-groove stroke-8"
      />
      <circle
        cx={540}
        cy={540}
        r={178}
        className="fill-none stroke-overlay-vinyl-groove stroke-8"
      />
      <circle cx={540} cy={540} r={128} className="fill-overlay-vinyl-label" />
      <circle cx={540} cy={540} r={42} className="fill-overlay-vinyl-hub" />
      <circle cx={540} cy={540} r={12} className="fill-overlay-vinyl-disc" />
    </g>
  );
}
