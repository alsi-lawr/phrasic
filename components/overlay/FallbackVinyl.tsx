import type { ReactElement } from "react";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type FallbackVinylProps = {
  readonly motion: OverlayMotionDecision;
};

export function FallbackVinyl({ motion }: FallbackVinylProps): ReactElement {
  return (
    <g>
      <FallbackVinylRotation motion={motion} />
      <circle cx={540} cy={540} r={412} className="fill-overlay-vinyl-base" />
      <circle
        cx={540}
        cy={540}
        r={364}
        className="fill-none stroke-overlay-vinyl-groove stroke-22"
      />
      <circle
        cx={540}
        cy={540}
        r={292}
        className="fill-none stroke-overlay-vinyl-groove-inner stroke-18"
      />
      <circle
        cx={540}
        cy={540}
        r={220}
        className="fill-none stroke-overlay-vinyl-groove stroke-14"
      />
      <circle
        cx={540}
        cy={540}
        r={130}
        className="fill-overlay-status-active"
      />
      <circle cx={540} cy={540} r={42} className="fill-overlay-vinyl-label" />
      <circle cx={540} cy={540} r={12} className="fill-overlay-vinyl-base" />
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
          dur="18s"
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
