import type { ReactElement } from "react";

export function FallbackVinyl(): ReactElement {
  return (
    <g>
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
