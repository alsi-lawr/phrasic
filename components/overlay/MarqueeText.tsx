import {
  type ReactElement,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  marqueeAnimationDurationSeconds,
  marqueeDecisionForTextBounds,
  staticMarqueeTextPresentationFor,
  type MarqueeOverflowDecision,
  type StaticMarqueeTextPresentation,
} from "./overlay-marquee.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import {
  type OverlayContentLine,
  type OverlayTextMeasurementReporter,
} from "./overlay-layout.ts";
import { type OverlayMetadataTextClass } from "./overlay-presentation.ts";

type MarqueeTextProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly clipPathId: string;
  readonly measurementIdentity: string;
  readonly measurementLine: OverlayContentLine;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly x: number;
  readonly y: number;
};

type MeasuredSvgTextOverflow = {
  readonly decision: MarqueeOverflowDecision;
  readonly textReference: RefObject<SVGTextElement | null>;
};

export function MarqueeText({
  animationIdentityKey,
  availableWidth,
  clipPathId,
  measurementIdentity,
  measurementLine,
  motion,
  onTextMeasurement,
  text,
  textClass,
  x,
  y,
}: MarqueeTextProps): ReactElement {
  const { decision, textReference } = useMeasuredSvgTextOverflow({
    animationIdentityKey,
    availableWidth,
    measurementIdentity,
    measurementLine,
    onTextMeasurement,
    text,
  });

  switch (motion.kind) {
    case "reduced":
      return (
        <ReducedMotionMarqueeText
          decision={decision}
          text={text}
          textClass={textClass}
          textReference={textReference}
          x={x}
          y={y}
        />
      );
    case "enabled":
      return (
        <MarqueeTextForDecision
          animationIdentityKey={animationIdentityKey}
          clipPathId={clipPathId}
          decision={decision}
          text={text}
          textClass={textClass}
          textReference={textReference}
          x={x}
          y={y}
        />
      );
  }

  return unreachable(motion);
}

type MarqueeTextForDecisionProps = {
  readonly animationIdentityKey: string;
  readonly clipPathId: string;
  readonly decision: MarqueeOverflowDecision;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly textReference: RefObject<SVGTextElement | null>;
  readonly x: number;
  readonly y: number;
};

function MarqueeTextForDecision({
  animationIdentityKey,
  clipPathId,
  decision,
  text,
  textClass,
  textReference,
  x,
  y,
}: MarqueeTextForDecisionProps): ReactElement {
  switch (decision.kind) {
    case "contained":
      return (
        <ClippedStaticMarqueeText
          clipPathId={clipPathId}
          text={text}
          textClass={textClass}
          textReference={textReference}
          x={x}
          y={y}
        />
      );
    case "overflowing":
      return (
        <AnimatedMarqueeText
          animationIdentityKey={animationIdentityKey}
          clipPathId={clipPathId}
          decision={decision}
          text={text}
          textClass={textClass}
          textReference={textReference}
          x={x}
          y={y}
        />
      );
  }

  return unreachable(decision);
}

type ClippedStaticMarqueeTextProps = {
  readonly clipPathId: string;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly textReference: RefObject<SVGTextElement | null>;
  readonly x: number;
  readonly y: number;
};

function ClippedStaticMarqueeText({
  clipPathId,
  text,
  textClass,
  textReference,
  x,
  y,
}: ClippedStaticMarqueeTextProps): ReactElement {
  return (
    <g clipPath={`url(#${clipPathId})`}>
      <text ref={textReference} x={x} y={y} className={textClass}>
        {text}
      </text>
    </g>
  );
}

type ReducedMotionMarqueeTextProps = {
  readonly decision: MarqueeOverflowDecision;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly textReference: RefObject<SVGTextElement | null>;
  readonly x: number;
  readonly y: number;
};

function ReducedMotionMarqueeText({
  decision,
  text,
  textClass,
  textReference,
  x,
  y,
}: ReducedMotionMarqueeTextProps): ReactElement {
  const presentation = staticMarqueeTextPresentationFor(decision);

  return (
    <>
      <ReducedMotionTextMeasurement
        text={text}
        textClass={textClass}
        textReference={textReference}
        x={x}
        y={y}
      />
      <ReducedMotionStaticText
        presentation={presentation}
        text={text}
        textClass={textClass}
        x={x}
        y={y}
      />
    </>
  );
}

type ReducedMotionTextMeasurementProps = {
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly textReference: RefObject<SVGTextElement | null>;
  readonly x: number;
  readonly y: number;
};

function ReducedMotionTextMeasurement({
  text,
  textClass,
  textReference,
  x,
  y,
}: ReducedMotionTextMeasurementProps): ReactElement {
  return (
    <g className="opacity-0">
      <text ref={textReference} x={x} y={y} className={textClass}>
        {text}
      </text>
    </g>
  );
}

type ReducedMotionStaticTextProps = {
  readonly presentation: StaticMarqueeTextPresentation;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly x: number;
  readonly y: number;
};

function ReducedMotionStaticText({
  presentation,
  text,
  textClass,
  x,
  y,
}: ReducedMotionStaticTextProps): ReactElement {
  switch (presentation.kind) {
    case "natural":
      return (
        <text x={x} y={y} className={textClass}>
          {text}
        </text>
      );
    case "shrink-to-fit":
      return (
        <text
          x={x}
          y={y}
          textLength={presentation.textLength}
          lengthAdjust="spacingAndGlyphs"
          className={textClass}
        >
          {text}
        </text>
      );
  }

  return unreachable(presentation);
}

type AnimatedMarqueeTextProps = {
  readonly animationIdentityKey: string;
  readonly clipPathId: string;
  readonly decision: Extract<
    MarqueeOverflowDecision,
    { readonly kind: "overflowing" }
  >;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
  readonly textReference: RefObject<SVGTextElement | null>;
  readonly x: number;
  readonly y: number;
};

function AnimatedMarqueeText({
  animationIdentityKey,
  clipPathId,
  decision,
  text,
  textClass,
  textReference,
  x,
  y,
}: AnimatedMarqueeTextProps): ReactElement {
  return (
    <g clipPath={`url(#${clipPathId})`}>
      <g key={animationIdentityKey}>
        <animateTransform
          attributeName="transform"
          type="translate"
          from={`${decision.startX} 0`}
          to={`${decision.endX} 0`}
          dur={`${marqueeAnimationDurationSeconds}s`}
          calcMode="linear"
          repeatCount="indefinite"
        />
        <text ref={textReference} x={x} y={y} className={textClass}>
          {text}
        </text>
      </g>
    </g>
  );
}

type MeasuredSvgTextOverflowOptions = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly measurementIdentity: string;
  readonly measurementLine: OverlayContentLine;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly text: string;
};

function useMeasuredSvgTextOverflow(
  options: MeasuredSvgTextOverflowOptions,
): MeasuredSvgTextOverflow {
  const {
    animationIdentityKey,
    availableWidth,
    measurementIdentity,
    measurementLine,
    onTextMeasurement,
    text,
  } = options;
  const textReference = useRef<SVGTextElement | null>(null);
  const [decision, setDecision] = useState<MarqueeOverflowDecision>(() =>
    marqueeDecisionForTextBounds({
      availableWidth,
      measuredWidth: 0,
    }),
  );

  useLayoutEffect(() => {
    const textElement = textReference.current;
    if (textElement === null) {
      return;
    }

    const bounds = textElement.getBBox();
    const nextDecision = marqueeDecisionForTextBounds({
      availableWidth,
      measuredWidth: bounds.width,
    });

    onTextMeasurement({
      identity: measurementIdentity,
      line: measurementLine,
      width: bounds.width,
    });

    setDecision((currentDecision) =>
      sameMarqueeOverflowDecision(currentDecision, nextDecision)
        ? currentDecision
        : nextDecision,
    );
  }, [
    animationIdentityKey,
    availableWidth,
    measurementIdentity,
    measurementLine,
    onTextMeasurement,
    text,
  ]);

  return { decision, textReference };
}

function sameMarqueeOverflowDecision(
  left: MarqueeOverflowDecision,
  right: MarqueeOverflowDecision,
): boolean {
  if (left.kind === "contained") {
    return right.kind === "contained";
  }

  if (right.kind === "contained") {
    return false;
  }

  return (
    left.measuredWidth === right.measuredWidth &&
    left.startX === right.startX &&
    left.endX === right.endX &&
    left.travelDistance === right.travelDistance
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected marquee motion value: ${String(value)}`);
}
