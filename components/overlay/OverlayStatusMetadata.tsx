import type { ReactElement } from "react";
import {
  overlayMetadataLayout,
  type OverlayTextMeasurementReporter,
} from "./overlay-layout.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";
import { MetadataMarqueeLine } from "./OverlayMetadataLine.tsx";

type MetadataContentProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

type StatusMetadataProps = MetadataContentProps & {
  readonly category: string;
  readonly context: string;
  readonly subtitle: string;
  readonly title: string;
};

export function StatusMetadata({
  animationIdentityKey,
  availableWidth,
  category,
  context,
  motion,
  onTextMeasurement,
  subtitle,
  title,
}: StatusMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusLabelLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={category}
        textClass="font-overlay-display fill-overlay-status text-overlay-status-size font-semibold tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusTitleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={title}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusDetailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={subtitle}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusContextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}
