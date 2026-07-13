import {
  type ReactElement,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  overlayItemIdentityKey,
  type OverlayItemIdentity,
} from "./overlay-metadata.ts";
import {
  marqueeDecisionForTextBounds,
  type MarqueeOverflowDecision,
} from "./overlay-marquee.ts";

type MarqueeTextProps = {
  readonly animationIdentity: OverlayItemIdentity;
  readonly availableWidth: number;
  readonly clipPathId: string;
  readonly fill: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
};

type MeasuredSvgTextOverflow = {
  readonly decision: MarqueeOverflowDecision;
  readonly textReference: RefObject<SVGTextElement | null>;
};

export function MarqueeText({
  animationIdentity,
  availableWidth,
  clipPathId,
  fill,
  fontSize,
  fontWeight,
  letterSpacing,
  text,
  x,
  y,
}: MarqueeTextProps): ReactElement {
  const animationIdentityKey = overlayItemIdentityKey(animationIdentity);
  const { decision, textReference } = useMeasuredSvgTextOverflow({
    animationIdentityKey,
    availableWidth,
    text,
  });

  if (decision.kind === "contained") {
    return (
      <g clipPath={`url(#${clipPathId})`}>
        <text
          ref={textReference}
          x={x}
          y={y}
          fill={fill}
          fontSize={fontSize}
          fontWeight={fontWeight}
          letterSpacing={letterSpacing}
        >
          {text}
        </text>
      </g>
    );
  }

  return (
    <g clipPath={`url(#${clipPathId})`}>
      <g key={animationIdentityKey}>
        <animateTransform
          attributeName="transform"
          type="translate"
          from="0 0"
          to={`${-decision.travelDistance} 0`}
          dur="12s"
          repeatCount="indefinite"
        />
        <text
          ref={textReference}
          x={x}
          y={y}
          fill={fill}
          fontSize={fontSize}
          fontWeight={fontWeight}
          letterSpacing={letterSpacing}
        >
          {text}
        </text>
        <text
          x={x + decision.travelDistance}
          y={y}
          fill={fill}
          fontSize={fontSize}
          fontWeight={fontWeight}
          letterSpacing={letterSpacing}
        >
          {text}
        </text>
      </g>
    </g>
  );
}

type MeasuredSvgTextOverflowOptions = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly text: string;
};

function useMeasuredSvgTextOverflow(
  options: MeasuredSvgTextOverflowOptions,
): MeasuredSvgTextOverflow {
  const textReference = useRef<SVGTextElement | null>(null);
  const [decision, setDecision] = useState<MarqueeOverflowDecision>(() =>
    marqueeDecisionForTextBounds({
      availableWidth: options.availableWidth,
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
      availableWidth: options.availableWidth,
      measuredWidth: bounds.width,
    });

    setDecision((currentDecision) =>
      sameMarqueeOverflowDecision(currentDecision, nextDecision)
        ? currentDecision
        : nextDecision,
    );
  }, [options.animationIdentityKey, options.availableWidth, options.text]);

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
    left.travelDistance === right.travelDistance
  );
}
