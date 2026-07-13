import type { ReactElement } from "react";
import {
  fallbackVinylRotationDurationSeconds,
  type OverlayMotionDecision,
} from "./overlay-motion.ts";

type FallbackVinylProps = {
  readonly motion: OverlayMotionDecision;
};

export function FallbackVinyl({ motion }: FallbackVinylProps): ReactElement {
  return (
    <g>
      <FallbackVinylRotation motion={motion} />
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
      <circle
        cx={540}
        cy={540}
        r={128}
        className="fill-overlay-vinyl-label"
      />
      <circle cx={540} cy={540} r={42} className="fill-overlay-vinyl-hub" />
      <circle cx={540} cy={540} r={12} className="fill-overlay-vinyl-disc" />
    </g>
  );
}

type FallbackVinylRotationProps = {
  readonly motion: OverlayMotionDecision;
};

function FallbackVinylRotation({
  motion,
}: FallbackVinylRotationProps): ReactElement | null {
  switch (motion.kind) {
    case "enabled":
      return (
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 540 540"
          to="360 540 540"
          dur={`${fallbackVinylRotationDurationSeconds}s`}
          calcMode="linear"
          repeatCount="indefinite"
        />
      );
    case "reduced":
      return null;
  }

  return unreachable(motion);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected fallback vinyl motion: ${String(value)}`);
}
