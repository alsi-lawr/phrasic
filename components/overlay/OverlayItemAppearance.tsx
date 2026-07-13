import type { ReactElement, ReactNode } from "react";
import {
  overlayItemAppearanceDurationSeconds,
  overlayItemAppearanceKeySpline,
  type OverlayMotionDecision,
} from "./overlay-motion.ts";

type OverlayItemAppearanceProps = {
  readonly children: ReactNode;
  readonly identity: string;
  readonly motion: OverlayMotionDecision;
};

export function OverlayItemAppearance({
  children,
  identity,
  motion,
}: OverlayItemAppearanceProps): ReactElement {
  return (
    <g key={identity}>
      <ItemAppearanceAnimation motion={motion} />
      {children}
    </g>
  );
}

type ItemAppearanceAnimationProps = {
  readonly motion: OverlayMotionDecision;
};

function ItemAppearanceAnimation({
  motion,
}: ItemAppearanceAnimationProps): ReactElement | null {
  switch (motion.kind) {
    case "enabled":
      return (
        <animate
          attributeName="opacity"
          from="0"
          to="1"
          dur={`${overlayItemAppearanceDurationSeconds}s`}
          calcMode="spline"
          keySplines={overlayItemAppearanceKeySpline}
        />
      );
    case "reduced":
      return null;
  }

  return unreachable(motion);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay appearance motion: ${String(value)}`);
}
