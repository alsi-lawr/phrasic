import type { ReactElement } from "react";
import type { OverlayVisualStatus } from "./overlay-status.ts";

type OverlayStatusProps = {
  readonly status: OverlayVisualStatus;
};

export function OverlayStatus({ status }: OverlayStatusProps): ReactElement {
  return (
    <g>
      <circle cx={3_480} cy={222} r={20} fill={statusColor(status.tone)} />
      <text
        x={3_524}
        y={240}
        fill="#c9d2dc"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={88}
        fontWeight={700}
        letterSpacing={10}
      >
        {status.label}
      </text>
    </g>
  );
}

function statusColor(tone: OverlayVisualStatus["tone"]): string {
  switch (tone) {
    case "active":
      return "#06ab4f";
    case "neutral":
      return "#c9d2dc";
    case "warning":
      return "#f2b75d";
  }

  const unreachableTone: never = tone;
  throw new Error(`Unexpected overlay status tone: ${unreachableTone}`);
}
