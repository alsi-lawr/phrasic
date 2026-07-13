import type { ReactElement } from "react";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type FallbackVinylProps = {
  readonly motion: OverlayMotionDecision;
};

export function FallbackVinyl({ motion }: FallbackVinylProps): ReactElement {
  return (
    <g>
      <FallbackVinylRotation motion={motion} />
      <circle cx={540} cy={540} r={412} fill="#030405" />
      <circle
        cx={540}
        cy={540}
        r={364}
        fill="none"
        stroke="#202832"
        strokeWidth={22}
      />
      <circle
        cx={540}
        cy={540}
        r={292}
        fill="none"
        stroke="#182029"
        strokeWidth={18}
      />
      <circle
        cx={540}
        cy={540}
        r={220}
        fill="none"
        stroke="#202832"
        strokeWidth={14}
      />
      <circle cx={540} cy={540} r={130} fill="#06ab4f" />
      <circle cx={540} cy={540} r={42} fill="#d5e2d9" />
      <circle cx={540} cy={540} r={12} fill="#030405" />
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
