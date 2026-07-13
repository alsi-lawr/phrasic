import type { ReactElement } from "react";
import { MarqueeText } from "./MarqueeText.tsx";
import {
  type OverlayEpisodeMetadataView,
  type OverlayItemMetadataPresentation,
  type OverlayMetadataView,
  type OverlayStatusMetadataView,
  type OverlayTrackMetadataView,
  overlayMetadataAnimationIdentityKey,
} from "./overlay-metadata.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import {
  overlayMetadataLayout,
  type OverlayTextLineLayout,
  type OverlayTextMeasurementReporter,
} from "./overlay-layout.ts";
import {
  overlayMetadataTextClasses,
  type OverlayMetadataTextClass,
} from "./overlay-presentation.ts";

type OverlayMetadataProps = {
  readonly availableWidth: number;
  readonly metadata: OverlayMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

export function OverlayMetadata({
  availableWidth,
  metadata,
  motion,
  onTextMeasurement,
}: OverlayMetadataProps): ReactElement {
  const animationIdentityKey = overlayMetadataAnimationIdentityKey(metadata);

  return (
    <g>
      <MetadataClipPaths availableWidth={availableWidth} />
      <MetadataView
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        metadata={metadata}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
      />
    </g>
  );
}

type MetadataViewProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly metadata: OverlayMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

function MetadataView({
  animationIdentityKey,
  availableWidth,
  metadata,
  motion,
  onTextMeasurement,
}: MetadataViewProps): ReactElement {
  switch (metadata.kind) {
    case "status":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          metadata={metadata}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "track":
      return (
        <TrackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          metadata={metadata}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "episode":
      return (
        <EpisodeMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          metadata={metadata}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
  }

  return unreachable(metadata);
}

type StatusMetadataProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly metadata: OverlayStatusMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

function StatusMetadata({
  animationIdentityKey,
  availableWidth,
  metadata,
  motion,
  onTextMeasurement,
}: StatusMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusLabelLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.category}
        textClass={overlayMetadataTextClasses.status}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusTitleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.title}
        textClass={overlayMetadataTextClasses.detail}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusDetailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.subtitle}
        textClass={overlayMetadataTextClasses.detail}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusContextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.context}
        textClass={overlayMetadataTextClasses.context}
      />
    </>
  );
}

type TrackMetadataProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly metadata: OverlayTrackMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

function TrackMetadata({
  animationIdentityKey,
  availableWidth,
  metadata,
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
        text={artistNames(metadata.artists)}
        textClass={overlayMetadataTextClasses.creator}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.trackTitle.value}
        textClass={overlayMetadataTextClasses.title}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`ALBUM · ${metadata.album.title.value}`}
        textClass={overlayMetadataTextClasses.detail}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={trackContextForPresentation(metadata.presentation)}
        textClass={overlayMetadataTextClasses.context}
      />
    </>
  );
}

type EpisodeMetadataProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly metadata: OverlayEpisodeMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

function EpisodeMetadata({
  animationIdentityKey,
  availableWidth,
  metadata,
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
        text={metadata.show.publisher.value}
        textClass={overlayMetadataTextClasses.creator}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={metadata.episodeTitle.value}
        textClass={overlayMetadataTextClasses.title}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`SHOW · ${metadata.show.title.value}`}
        textClass={overlayMetadataTextClasses.detail}
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={episodeContextForPresentation(metadata.presentation)}
        textClass={overlayMetadataTextClasses.context}
      />
    </>
  );
}

type MetadataMarqueeLineProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly line: OverlayTextLineLayout;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly text: string;
  readonly textClass: OverlayMetadataTextClass;
};

function MetadataMarqueeLine({
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

type MetadataClipPathsProps = {
  readonly availableWidth: number;
};

function MetadataClipPaths({
  availableWidth,
}: MetadataClipPathsProps): ReactElement {
  return (
    <defs>
      <MetadataClipPath
        line={overlayMetadataLayout.creatorLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.titleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.detailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.contextLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusLabelLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusTitleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusDetailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusContextLine}
        width={availableWidth}
      />
    </defs>
  );
}

type MetadataClipPathProps = {
  readonly line: OverlayTextLineLayout;
  readonly width: number;
};

function MetadataClipPath({
  line,
  width,
}: MetadataClipPathProps): ReactElement {
  return (
    <clipPath id={line.clipPathId} clipPathUnits="userSpaceOnUse">
      <rect
        x={overlayMetadataLayout.x}
        y={line.clipY}
        width={width}
        height={line.clipHeight}
      />
    </clipPath>
  );
}

function trackContextForPresentation(
  presentation: OverlayItemMetadataPresentation,
): string {
  switch (presentation.kind) {
    case "now-playing":
      return "NOW PLAYING · TRACK";
    case "paused":
      return "PAUSED · TRACK";
    case "stale":
      return "STALE TRACK";
  }

  return unreachable(presentation);
}

function episodeContextForPresentation(
  presentation: OverlayItemMetadataPresentation,
): string {
  switch (presentation.kind) {
    case "now-playing":
      return "NOW PLAYING · EPISODE";
    case "paused":
      return "PAUSED · EPISODE";
    case "stale":
      return "STALE EPISODE";
  }

  return unreachable(presentation);
}

function artistNames(artists: OverlayTrackMetadataView["artists"]): string {
  return artists.map((artist): string => artist.name.value).join(", ");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata view: ${String(value)}`);
}
