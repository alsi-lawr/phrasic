import type { ReactElement } from "react";
import { MarqueeText } from "./MarqueeText.tsx";
import {
  type OverlayEpisodeMetadataView,
  type OverlayItemMetadataPresentation,
  type OverlayMetadataView,
  type OverlayStatusMetadataView,
  type OverlayTrackMetadataView,
} from "./overlay-metadata.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";

const metadataTextX = 1_344;
const metadataTextAvailableWidth = 3_096;

type OverlayTextLineLayout = {
  readonly clipHeight: number;
  readonly clipPathId: string;
  readonly clipY: number;
  readonly fill: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacing: number;
  readonly x: number;
  readonly y: number;
};

const titleLine: OverlayTextLineLayout = Object.freeze({
  clipHeight: 302,
  clipPathId: "overlay-metadata-title-clip",
  clipY: 348,
  fill: "#f7fafc",
  fontSize: 258,
  fontWeight: 700,
  letterSpacing: 0,
  x: metadataTextX,
  y: 596,
});
const subtitleLine: OverlayTextLineLayout = Object.freeze({
  clipHeight: 168,
  clipPathId: "overlay-metadata-subtitle-clip",
  clipY: 650,
  fill: "#d7dfe8",
  fontSize: 126,
  fontWeight: 600,
  letterSpacing: 0,
  x: metadataTextX,
  y: 748,
});
const contextLine: OverlayTextLineLayout = Object.freeze({
  clipHeight: 126,
  clipPathId: "overlay-metadata-context-clip",
  clipY: 858,
  fill: "#8f9baa",
  fontSize: 88,
  fontWeight: 600,
  letterSpacing: 4,
  x: metadataTextX,
  y: 938,
});

type OverlayMetadataProps = {
  readonly metadata: OverlayMetadataView;
  readonly motion: OverlayMotionDecision;
};

export function OverlayMetadata({
  metadata,
  motion,
}: OverlayMetadataProps): ReactElement {
  return (
    <g fontFamily="Arial, Helvetica, sans-serif">
      <MetadataClipPaths />
      <MetadataView metadata={metadata} motion={motion} />
    </g>
  );
}

type MetadataViewProps = {
  readonly metadata: OverlayMetadataView;
  readonly motion: OverlayMotionDecision;
};

function MetadataView({ metadata, motion }: MetadataViewProps): ReactElement {
  switch (metadata.kind) {
    case "status":
      return <StatusMetadata metadata={metadata} />;
    case "track":
      return <TrackMetadata metadata={metadata} motion={motion} />;
    case "episode":
      return <EpisodeMetadata metadata={metadata} motion={motion} />;
  }

  return unreachable(metadata);
}

type StatusMetadataProps = {
  readonly metadata: OverlayStatusMetadataView;
};

function StatusMetadata({ metadata }: StatusMetadataProps): ReactElement {
  return (
    <>
      <MetadataCategory value={metadata.category} />
      <StaticMetadataLine
        line={titleLine}
        text={metadata.title}
        textLength={titleTextLength(metadata.title)}
      />
      <StaticMetadataLine
        line={subtitleLine}
        text={metadata.subtitle}
        textLength={subtitleTextLength(metadata.subtitle)}
      />
      <StaticMetadataLine
        line={contextLine}
        text={metadata.context}
        textLength={contextTextLength(metadata.context)}
      />
    </>
  );
}

type TrackMetadataProps = {
  readonly metadata: OverlayTrackMetadataView;
  readonly motion: OverlayMotionDecision;
};

function TrackMetadata({ metadata, motion }: TrackMetadataProps): ReactElement {
  return (
    <>
      <MetadataCategory
        value={trackCategoryForPresentation(metadata.presentation)}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={titleLine}
        motion={motion}
        text={metadata.trackTitle.value}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={subtitleLine}
        motion={motion}
        text={artistNames(metadata.artists)}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={contextLine}
        motion={motion}
        text={metadata.album.title.value}
      />
    </>
  );
}

type EpisodeMetadataProps = {
  readonly metadata: OverlayEpisodeMetadataView;
  readonly motion: OverlayMotionDecision;
};

function EpisodeMetadata({
  metadata,
  motion,
}: EpisodeMetadataProps): ReactElement {
  return (
    <>
      <MetadataCategory
        value={episodeCategoryForPresentation(metadata.presentation)}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={titleLine}
        motion={motion}
        text={metadata.episodeTitle.value}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={subtitleLine}
        motion={motion}
        text={metadata.show.title.value}
      />
      <MetadataMarqueeLine
        animationIdentity={metadata.itemIdentity}
        line={contextLine}
        motion={motion}
        text={metadata.show.publisher.value}
      />
    </>
  );
}

type MetadataCategoryProps = {
  readonly value: string;
};

function MetadataCategory({ value }: MetadataCategoryProps): ReactElement {
  return (
    <text
      x={metadataTextX}
      y={272}
      fill="#8f9baa"
      fontSize={82}
      fontWeight={700}
      letterSpacing={12}
    >
      {value}
    </text>
  );
}

type MetadataMarqueeLineProps = {
  readonly animationIdentity: OverlayTrackMetadataView["itemIdentity"];
  readonly line: OverlayTextLineLayout;
  readonly motion: OverlayMotionDecision;
  readonly text: string;
};

function MetadataMarqueeLine({
  animationIdentity,
  line,
  motion,
  text,
}: MetadataMarqueeLineProps): ReactElement {
  return (
    <MarqueeText
      animationIdentity={animationIdentity}
      availableWidth={metadataTextAvailableWidth}
      clipPathId={line.clipPathId}
      fill={line.fill}
      fontSize={line.fontSize}
      fontWeight={line.fontWeight}
      letterSpacing={line.letterSpacing}
      motion={motion}
      text={text}
      x={line.x}
      y={line.y}
    />
  );
}

type StaticMetadataLineProps = {
  readonly line: OverlayTextLineLayout;
  readonly text: string;
  readonly textLength: number;
};

function StaticMetadataLine({
  line,
  text,
  textLength,
}: StaticMetadataLineProps): ReactElement {
  return (
    <text
      x={line.x}
      y={line.y}
      fill={line.fill}
      fontSize={line.fontSize}
      fontWeight={line.fontWeight}
      letterSpacing={line.letterSpacing}
      textLength={textLength}
      lengthAdjust="spacingAndGlyphs"
    >
      {text}
    </text>
  );
}

function MetadataClipPaths(): ReactElement {
  return (
    <defs>
      <MetadataClipPath line={titleLine} />
      <MetadataClipPath line={subtitleLine} />
      <MetadataClipPath line={contextLine} />
    </defs>
  );
}

type MetadataClipPathProps = {
  readonly line: OverlayTextLineLayout;
};

function MetadataClipPath({ line }: MetadataClipPathProps): ReactElement {
  return (
    <clipPath id={line.clipPathId} clipPathUnits="userSpaceOnUse">
      <rect
        x={line.x}
        y={line.clipY}
        width={metadataTextAvailableWidth}
        height={line.clipHeight}
      />
    </clipPath>
  );
}

function trackCategoryForPresentation(
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

function episodeCategoryForPresentation(
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

function titleTextLength(value: string): number {
  return boundedTextLength(value, 720, 2_880, 150);
}

function subtitleTextLength(value: string): number {
  return boundedTextLength(value, 520, 2_880, 72);
}

function contextTextLength(value: string): number {
  return boundedTextLength(value, 640, 2_880, 52);
}

function boundedTextLength(
  value: string,
  minimum: number,
  maximum: number,
  averageGlyphWidth: number,
): number {
  return Math.min(maximum, Math.max(minimum, value.length * averageGlyphWidth));
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata view: ${String(value)}`);
}
