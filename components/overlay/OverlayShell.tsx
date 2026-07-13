import type { ReactElement } from "react";
import { overlayShell, overlayShellClipPathId } from "./overlay-layout.ts";
import { overlayShellClass } from "./overlay-presentation.ts";

type OverlayShellProps = {
  readonly width: number;
};

export function OverlayShell({ width }: OverlayShellProps): ReactElement {
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
        className={overlayShellClass}
      />
    </>
  );
}
