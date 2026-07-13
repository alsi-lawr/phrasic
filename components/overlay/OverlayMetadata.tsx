import type { ReactElement } from "react";
import type {
  LastPlaybackItem,
  NowPlayingItem,
} from "../../domain/playback.ts";
import type { OverlayVisualStatus } from "./overlay-status.ts";

type OverlayMetadataProps = {
  readonly item: LastPlaybackItem;
  readonly status: OverlayVisualStatus;
};

type OverlayMetadataContent = {
  readonly category: string;
  readonly context: string;
  readonly subtitle: string;
  readonly title: string;
};

export function OverlayMetadata({
  item,
  status,
}: OverlayMetadataProps): ReactElement {
  const metadata = metadataContent(item, status);

  return (
    <g fontFamily="Arial, Helvetica, sans-serif">
      <text
        x={1_344}
        y={272}
        fill="#8f9baa"
        fontSize={82}
        fontWeight={700}
        letterSpacing={12}
      >
        {metadata.category}
      </text>
      <text
        x={1_344}
        y={596}
        fill="#f7fafc"
        fontSize={258}
        fontWeight={700}
        textLength={titleTextLength(metadata.title)}
        lengthAdjust="spacingAndGlyphs"
      >
        {metadata.title}
      </text>
      <text
        x={1_344}
        y={748}
        fill="#d7dfe8"
        fontSize={126}
        fontWeight={600}
        textLength={subtitleTextLength(metadata.subtitle)}
        lengthAdjust="spacingAndGlyphs"
      >
        {metadata.subtitle}
      </text>
      <text
        x={1_344}
        y={938}
        fill="#8f9baa"
        fontSize={88}
        fontWeight={600}
        letterSpacing={4}
        textLength={contextTextLength(metadata.context)}
        lengthAdjust="spacingAndGlyphs"
      >
        {metadata.context}
      </text>
    </g>
  );
}

function metadataContent(
  item: LastPlaybackItem,
  status: OverlayVisualStatus,
): OverlayMetadataContent {
  if (item.kind === "unavailable") {
    return frozenMetadata(
      "SPOTIFY NOW PLAYING",
      "PLAYBACK UPDATES WILL APPEAR HERE",
      "Waiting for a playable item",
      status.message,
    );
  }

  return metadataForItem(item.item);
}

function metadataForItem(item: NowPlayingItem): OverlayMetadataContent {
  switch (item.kind) {
    case "track":
      return frozenMetadata(
        "TRACK",
        item.collection.title.value,
        item.artists.map((artist): string => artist.name.value).join(", "),
        item.title.value,
      );
    case "episode":
      return frozenMetadata(
        "EPISODE",
        item.show.publisher.value,
        item.show.title.value,
        item.title.value,
      );
  }

  return unreachable(item);
}

function frozenMetadata(
  category: string,
  context: string,
  subtitle: string,
  title: string,
): OverlayMetadataContent {
  const content: OverlayMetadataContent = {
    category,
    context,
    subtitle,
    title,
  };

  return Object.freeze(content);
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
  throw new Error(`Unexpected now-playing item: ${String(value)}`);
}
