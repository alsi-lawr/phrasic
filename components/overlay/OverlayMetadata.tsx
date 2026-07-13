import type { ReactElement } from "react";
import {
  metadataForOverlayState,
  type OverlayUiState,
} from "./overlay-state.ts";

type OverlayMetadataProps = {
  readonly state: OverlayUiState;
};

export function OverlayMetadata({ state }: OverlayMetadataProps): ReactElement {
  const metadata = metadataForOverlayState(state);

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
