import type { ReactElement } from "react";
import {
  fallbackVinylRotationDurationSeconds,
  type OverlayMotionDecision,
} from "./overlay-motion.ts";
import { fallbackVinylClasses } from "./overlay-presentation.ts";

type FallbackVinylProps = {
  readonly motion: OverlayMotionDecision;
};

export function FallbackVinyl({ motion }: FallbackVinylProps): ReactElement {
  return (
    <g>
      <FallbackVinylRotation motion={motion} />
      <circle cx={540} cy={540} r={430} className={fallbackVinylClasses.disc} />
      <circle cx={540} cy={540} r={404} className={fallbackVinylClasses.rim} />
      <circle
        cx={540}
        cy={540}
        r={338}
        className={fallbackVinylClasses.groove}
      />
      <circle
        cx={540}
        cy={540}
        r={258}
        className={fallbackVinylClasses.groove}
      />
      <circle
        cx={540}
        cy={540}
        r={178}
        className={fallbackVinylClasses.groove}
      />
      <circle
        cx={540}
        cy={540}
        r={128}
        className={fallbackVinylClasses.label}
      />
      <circle cx={540} cy={540} r={42} className={fallbackVinylClasses.hub} />
      <circle cx={540} cy={540} r={12} className={fallbackVinylClasses.disc} />
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
