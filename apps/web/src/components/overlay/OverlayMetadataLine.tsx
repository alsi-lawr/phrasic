import type { ReactElement } from "react";
import { MarqueeText } from "./MarqueeText.tsx";
import {
  overlayMetadataLayout,
  type OverlayTextLineLayout,
  type OverlayTextMeasurementReporter,
} from "./overlay-layout.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

type MetadataMarqueeLineProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly line: OverlayTextLineLayout;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly text: string;
  readonly textClass: string;
};

export function MetadataMarqueeLine({
  animationIdentityKey,
  availableWidth,
  line,
  motion,
  onTextMeasurement,
  text,
  textClass,
}: MetadataMarqueeLineProps): ReactElement {
  return (
    <MarqueeText
      animationIdentityKey={animationIdentityKey}
      availableWidth={availableWidth}
      clipPathId={line.clipPathId}
      measurementIdentity={animationIdentityKey}
      measurementLine={line.line}
      motion={motion}
      onTextMeasurement={onTextMeasurement}
      text={text}
      textClass={textClass}
      x={overlayMetadataLayout.x}
      y={line.y}
    />
  );
}
