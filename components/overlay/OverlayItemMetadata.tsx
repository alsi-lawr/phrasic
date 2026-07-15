import type { ReactElement } from "react";
import type { NowPlayingItem } from "../../domain/playback-item.ts";
import { artistNames } from "./overlay-copy.ts";
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

type ItemMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly episodeContext: string;
  readonly item: NowPlayingItem;
};

export function ItemMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  episodeContext,
  item,
  motion,
  onTextMeasurement,
}: ItemMetadataProps): ReactElement {
  switch (item.kind) {
    case "track":
      return (
        <TrackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context={context}
          item={item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "episode":
      return (
        <EpisodeMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context={episodeContext}
          item={item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
  }

  return unreachable(item);
}

type TrackMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly item: Extract<NowPlayingItem, { readonly kind: "track" }>;
};

function TrackMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  item,
  motion,
  onTextMeasurement,
}: TrackMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.creatorLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={artistNames(item)}
        textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.title}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`ALBUM · ${item.collection.title}`}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

type EpisodeMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly item: Extract<NowPlayingItem, { readonly kind: "episode" }>;
};

function EpisodeMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  item,
  motion,
  onTextMeasurement,
}: EpisodeMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.creatorLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.show.publisher}
        textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.title}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`SHOW · ${item.show.title}`}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay item metadata value: ${String(value)}`);
}
