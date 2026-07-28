import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import {
  overlayMetadataLayout,
  type OverlayTextMeasurementReporter,
} from "../overlay/overlay-layout.ts";
import type { OverlayMotionDecision } from "../overlay/overlay-motion.ts";
import { MetadataClipPaths } from "../overlay/OverlayMetadataClipPaths.tsx";
import { MetadataMarqueeLine } from "../overlay/OverlayMetadataLine.tsx";
import { StatusMetadata } from "../overlay/OverlayStatusMetadata.tsx";
import {
  localAutomaticActionMessage,
  localPresentationLabel,
  localPresentationMessage,
} from "./local-playback-copy.ts";

type LocalPlaybackMetadataProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly presentation: LocalPlaybackPresentation;
};

export function LocalPlaybackMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
}: LocalPlaybackMetadataProps): ReactElement {
  return (
    <g>
      <MetadataClipPaths availableWidth={availableWidth} />
      <MetadataForPresentation
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        presentation={presentation}
      />
    </g>
  );
}

type MetadataForPresentationProps = LocalPlaybackMetadataProps;

function MetadataForPresentation({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
}: MetadataForPresentationProps): ReactElement {
  switch (presentation.kind) {
    case "content":
    case "stale-content":
      return (
        <LocalItemMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          presentation={presentation}
        />
      );
    case "metadata-unavailable":
    case "unavailable":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category={localPresentationLabel(presentation)}
          context={localAutomaticActionMessage(presentation)}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="Phrasic Local playback"
          title={localPresentationMessage(presentation)}
        />
      );
  }

  return unreachable(presentation);
}

type LocalItemMetadataProps = Omit<
  LocalPlaybackMetadataProps,
  "presentation"
> & {
  readonly presentation: Extract<
    LocalPlaybackPresentation,
    { readonly kind: "content" | "stale-content" }
  >;
};

function LocalItemMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
}: LocalItemMetadataProps): ReactElement {
  const metadata = presentation.snapshot.metadata;

  return (
    <>
      {metadata.creator === undefined ? null : (
        <MetadataMarqueeLine
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          line={overlayMetadataLayout.creatorLine}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          text={metadata.creator.toString()}
          textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
        />
      )}
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.title.toString()}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      {metadata.collection === undefined ? null : (
        <MetadataMarqueeLine
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          text={metadata.collection.toString()}
          textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
        />
      )}
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={localPresentationLabel(presentation)}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local metadata value: ${String(value)}`);
}
