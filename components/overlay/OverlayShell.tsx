import type { ReactElement, TransitionEvent } from "react";
import { overlayShell, overlayShellClipPathId } from "./overlay-layout.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type OverlayShellProps = {
  readonly motion: OverlayMotionDecision;
  readonly onWidthTransitionEnd: () => void;
  readonly width: number;
};

const widthTransitionClasses =
  "transition-[width] duration-1000 ease-[cubic-bezier(0.4,0,0.2,1)]";

export function OverlayShell({
  motion,
  onWidthTransitionEnd,
  width,
}: OverlayShellProps): ReactElement {
  const transitionClasses =
    motion.kind === "enabled" ? widthTransitionClasses : "";
  const handleTransitionEnd = (
    event: TransitionEvent<SVGRectElement>,
  ): void => {
    if (
      event.currentTarget === event.target &&
      event.propertyName === "width"
    ) {
      onWidthTransitionEnd();
    }
  };

  return (
    <>
      <defs>
        <clipPath id={overlayShellClipPathId} clipPathUnits="userSpaceOnUse">
          <rect
            x={0}
            y={0}
            width={width}
            height={overlayShell.height}
            rx={overlayShell.radius}
            ry={overlayShell.radius}
            className={transitionClasses}
          />
        </clipPath>
      </defs>
      <rect
        x={0}
        y={0}
        width={width}
        height={overlayShell.height}
        rx={overlayShell.radius}
        ry={overlayShell.radius}
        className={`${transitionClasses} fill-overlay-shell opacity-90`}
        onTransitionEnd={handleTransitionEnd}
      />
    </>
  );
}
