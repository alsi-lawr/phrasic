import type { ReactElement } from "react";
import type { OverlayAttributionProps } from "./overlay-presentation.ts";

export function OverlayFakeMusicAttribution({
  shellWidth,
}: OverlayAttributionProps): ReactElement {
  return (
    <text
      x={shellWidth - 56}
      y="160"
      textAnchor="end"
      className="font-overlay-display fill-overlay-context text-overlay-context-size font-semibold tracking-overlay-context"
    >
      Fake Music
    </text>
  );
}
