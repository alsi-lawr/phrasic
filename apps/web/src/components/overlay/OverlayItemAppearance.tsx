import type { ReactElement, ReactNode } from "react";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

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
    <g key={identity} className={itemAppearanceClass(motion)}>
      {children}
    </g>
  );
}

function itemAppearanceClass(
  motion: OverlayMotionDecision,
): string | undefined {
  switch (motion.kind) {
    case "enabled":
      return "animate-overlay-item-appearance";
    case "reduced":
      return undefined;
  }

  return unreachable(motion);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay appearance motion: ${String(value)}`);
}
