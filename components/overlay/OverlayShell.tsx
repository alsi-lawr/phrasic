import type { ReactElement } from "react";

export function OverlayShell(): ReactElement {
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={4_725}
        height={1_080}
        rx={96}
        className="fill-overlay-shell"
      />
      <rect
        x={48}
        y={48}
        width={4_629}
        height={984}
        rx={64}
        className="fill-overlay-surface stroke-overlay-border stroke-4"
      />
      <line
        x1={1_136}
        y1={152}
        x2={1_136}
        y2={928}
        className="stroke-overlay-rule stroke-4"
      />
      <line
        x1={1_344}
        y1={348}
        x2={4_440}
        y2={348}
        className="stroke-overlay-rule stroke-4"
      />
      <line
        x1={1_344}
        y1={858}
        x2={4_440}
        y2={858}
        className="stroke-overlay-rule stroke-4"
      />
    </g>
  );
}
