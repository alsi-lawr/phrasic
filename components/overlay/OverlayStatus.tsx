import type { ReactElement } from "react";
import type { OverlayVisualTreatment } from "./overlay-state.ts";

type OverlayStatusProps = {
  readonly treatment: OverlayVisualTreatment;
};

export function OverlayStatus({ treatment }: OverlayStatusProps): ReactElement {
  return (
    <g>
      <StatusShape treatment={treatment} />
      <text
        x={3_524}
        y={240}
        fill="#c9d2dc"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={88}
        fontWeight={700}
        letterSpacing={10}
      >
        {treatment.label}
      </text>
    </g>
  );
}

type StatusShapeProps = {
  readonly treatment: OverlayVisualTreatment;
};

function StatusShape({ treatment }: StatusShapeProps): ReactElement {
  const color = statusColor(treatment.tone);

  switch (treatment.kind) {
    case "initializing":
      return (
        <g fill={color}>
          <circle cx={3_444} cy={222} r={12} />
          <circle cx={3_480} cy={222} r={20} />
          <circle cx={3_516} cy={222} r={12} />
        </g>
      );
    case "authorization-required":
      return (
        <g fill="none" stroke={color} strokeWidth={12}>
          <circle cx={3_462} cy={222} r={24} />
          <line x1={3_486} y1={222} x2={3_524} y2={222} />
          <line x1={3_508} y1={222} x2={3_508} y2={242} />
          <line x1={3_522} y1={222} x2={3_522} y2={236} />
        </g>
      );
    case "authorizing":
      return (
        <g fill="none" stroke={color} strokeWidth={12}>
          <path d="M 3448 204 L 3472 222 L 3448 240" />
          <path d="M 3488 204 L 3512 222 L 3488 240" />
        </g>
      );
    case "empty":
      return (
        <rect x={3_452} y={194} width={56} height={56} rx={8} fill={color} />
      );
    case "playing":
      return <path d="M 3454 188 L 3454 256 L 3516 222 Z" fill={color} />;
    case "paused":
      return (
        <g fill={color}>
          <rect x={3_452} y={190} width={18} height={64} rx={4} />
          <rect x={3_490} y={190} width={18} height={64} rx={4} />
        </g>
      );
    case "unsupported":
      return (
        <g fill="none" stroke={color} strokeWidth={10}>
          <path d="M 3460 192 L 3500 192 L 3520 212 L 3520 232 L 3500 252 L 3460 252 L 3440 232 L 3440 212 Z" />
          <line x1={3_480} y1={204} x2={3_480} y2={230} />
          <circle cx={3_480} cy={242} r={2} fill={color} stroke="none" />
        </g>
      );
    case "reconnecting":
      return (
        <g fill="none" stroke={color} strokeWidth={10}>
          <path d="M 3510 204 A 34 34 0 1 0 3510 240" />
          <path d="M 3508 186 L 3514 210 L 3490 208" />
        </g>
      );
    case "failure":
      return (
        <g fill="none" stroke={color} strokeWidth={10}>
          <circle cx={3_480} cy={222} r={32} />
          <line x1={3_462} y1={204} x2={3_498} y2={240} />
          <line x1={3_498} y1={204} x2={3_462} y2={240} />
        </g>
      );
    case "fatal-initialization-failure":
      return (
        <g fill="none" stroke={color} strokeWidth={10}>
          <rect x={3_444} y={186} width={72} height={72} rx={12} />
          <line x1={3_462} y1={204} x2={3_498} y2={240} />
          <line x1={3_498} y1={204} x2={3_462} y2={240} />
        </g>
      );
  }

  return unreachable(treatment);
}

function statusColor(tone: OverlayVisualTreatment["tone"]): string {
  switch (tone) {
    case "active":
      return "#06ab4f";
    case "failure":
      return "#f2777a";
    case "neutral":
      return "#c9d2dc";
    case "warning":
      return "#f2b75d";
  }

  return unreachable(tone);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay status variant: ${String(value)}`);
}
