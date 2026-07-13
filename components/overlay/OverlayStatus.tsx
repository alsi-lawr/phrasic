import type { ReactElement } from "react";
import {
  overlayStatusLabelTextClass,
  statusColorClassesForTone,
} from "./overlay-presentation.ts";
import type { OverlayVisualTreatment } from "./overlay-state.ts";

type OverlayStatusProps = {
  readonly treatment: OverlayVisualTreatment;
};

export function OverlayStatus({ treatment }: OverlayStatusProps): ReactElement {
  return (
    <g>
      <StatusShape treatment={treatment} />
      <text x={3_524} y={240} className={overlayStatusLabelTextClass}>
        {treatment.label}
      </text>
    </g>
  );
}

type StatusShapeProps = {
  readonly treatment: OverlayVisualTreatment;
};

function StatusShape({ treatment }: StatusShapeProps): ReactElement {
  const colorClasses = statusColorClassesForTone(treatment.tone);

  switch (treatment.kind) {
    case "initializing":
      return (
        <g className={colorClasses.fill}>
          <circle cx={3_444} cy={222} r={12} />
          <circle cx={3_480} cy={222} r={20} />
          <circle cx={3_516} cy={222} r={12} />
        </g>
      );
    case "authorization-required":
      return (
        <g className="fill-none stroke-12">
          <g className={colorClasses.stroke}>
            <circle cx={3_462} cy={222} r={24} />
            <line x1={3_486} y1={222} x2={3_524} y2={222} />
            <line x1={3_508} y1={222} x2={3_508} y2={242} />
            <line x1={3_522} y1={222} x2={3_522} y2={236} />
          </g>
        </g>
      );
    case "authorizing":
      return (
        <g className="fill-none stroke-12">
          <g className={colorClasses.stroke}>
            <path d="M 3448 204 L 3472 222 L 3448 240" />
            <path d="M 3488 204 L 3512 222 L 3488 240" />
          </g>
        </g>
      );
    case "empty":
      return (
        <rect
          x={3_452}
          y={194}
          width={56}
          height={56}
          rx={8}
          className={colorClasses.fill}
        />
      );
    case "playing":
      return (
        <path
          d="M 3454 188 L 3454 256 L 3516 222 Z"
          className={colorClasses.fill}
        />
      );
    case "paused":
      return (
        <g className={colorClasses.fill}>
          <rect x={3_452} y={190} width={18} height={64} rx={4} />
          <rect x={3_490} y={190} width={18} height={64} rx={4} />
        </g>
      );
    case "unsupported":
      return (
        <g className="fill-none stroke-10">
          <g className={colorClasses.stroke}>
            <path d="M 3460 192 L 3500 192 L 3520 212 L 3520 232 L 3500 252 L 3460 252 L 3440 232 L 3440 212 Z" />
            <line x1={3_480} y1={204} x2={3_480} y2={230} />
            <g className="stroke-none">
              <g className={colorClasses.fill}>
                <circle cx={3_480} cy={242} r={2} />
              </g>
            </g>
          </g>
        </g>
      );
    case "reconnecting":
      return (
        <g className="fill-none stroke-10">
          <g className={colorClasses.stroke}>
            <path d="M 3510 204 A 34 34 0 1 0 3510 240" />
            <path d="M 3508 186 L 3514 210 L 3490 208" />
          </g>
        </g>
      );
    case "failure":
      return (
        <g className="fill-none stroke-10">
          <g className={colorClasses.stroke}>
            <circle cx={3_480} cy={222} r={32} />
            <line x1={3_462} y1={204} x2={3_498} y2={240} />
            <line x1={3_498} y1={204} x2={3_462} y2={240} />
          </g>
        </g>
      );
    case "fatal-initialization-failure":
      return (
        <g className="fill-none stroke-10">
          <g className={colorClasses.stroke}>
            <rect x={3_444} y={186} width={72} height={72} rx={12} />
            <line x1={3_462} y1={204} x2={3_498} y2={240} />
            <line x1={3_498} y1={204} x2={3_462} y2={240} />
          </g>
        </g>
      );
  }

  return unreachable(treatment);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay status variant: ${String(value)}`);
}
