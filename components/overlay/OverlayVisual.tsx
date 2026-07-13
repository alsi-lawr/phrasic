import { type ReactElement, useReducer } from "react";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { OverlayItemAppearance } from "./OverlayItemAppearance.tsx";
import { OverlaySpotifyAttribution } from "./OverlaySpotifyAttribution.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import {
  overlayMetadataAnimationIdentityKey,
  type OverlayMetadataView,
} from "./overlay-metadata.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import {
  emptyOverlayTextWidths,
  overlayMetadataAvailableWidth,
  overlayShellClipPathId,
  overlayShellWidthForTextWidths,
  overlayTextWidthsWithMeasurement,
  type OverlayTextMeasurement,
  type OverlayTextMeasurementReporter,
  type OverlayTextWidths,
} from "./overlay-layout.ts";
import { type OverlayUiState } from "./overlay-state.ts";
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayShell } from "./OverlayShell.tsx";

type OverlayVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly metadata: OverlayMetadataView;
  readonly motion: OverlayMotionDecision;
  readonly state: OverlayUiState;
};

export function OverlayVisual({
  geometry,
  metadata,
  motion,
  state,
}: OverlayVisualProps): ReactElement {
  const animationIdentityKey = overlayMetadataAnimationIdentityKey(metadata);
  const contentSizedShell = useContentSizedShell(animationIdentityKey);

  return (
    <svg
      aria-hidden="true"
      className="block shrink-0"
      width={geometry.width.value}
      height={geometry.height.value}
      viewBox={geometry.viewBox}
    >
      <OverlayShell width={contentSizedShell.width} />
      <g clipPath={`url(#${overlayShellClipPathId})`}>
        <OverlayItemAppearance identity={animationIdentityKey} motion={motion}>
          <OverlayArtwork motion={motion} state={state} />
          <OverlayMetadata
            availableWidth={contentSizedShell.availableWidth}
            metadata={metadata}
            motion={motion}
            onTextMeasurement={contentSizedShell.reportTextMeasurement}
          />
          <OverlaySpotifyAttribution shellWidth={contentSizedShell.width} />
        </OverlayItemAppearance>
      </g>
    </svg>
  );
}

type OverlayTextMeasurements = {
  readonly identity: string;
  readonly widths: OverlayTextWidths;
};

type ContentSizedShell = {
  readonly availableWidth: number;
  readonly reportTextMeasurement: OverlayTextMeasurementReporter;
  readonly width: number;
};

function useContentSizedShell(identity: string): ContentSizedShell {
  const [measurements, reportTextMeasurement] = useReducer(
    overlayTextMeasurementsReducer,
    identity,
    initialOverlayTextMeasurements,
  );
  const widths =
    measurements.identity === identity
      ? measurements.widths
      : emptyOverlayTextWidths;
  const width = overlayShellWidthForTextWidths(widths);
  const availableWidth = overlayMetadataAvailableWidth(width);

  return {
    availableWidth,
    reportTextMeasurement,
    width,
  };
}

function initialOverlayTextMeasurements(
  identity: string,
): OverlayTextMeasurements {
  return Object.freeze({ identity, widths: emptyOverlayTextWidths });
}

function overlayTextMeasurementsReducer(
  current: OverlayTextMeasurements,
  measurement: OverlayTextMeasurement,
): OverlayTextMeasurements {
  const currentWidths =
    current.identity === measurement.identity
      ? current.widths
      : emptyOverlayTextWidths;
  const widths = overlayTextWidthsWithMeasurement(currentWidths, measurement);

  if (current.identity === measurement.identity && widths === current.widths) {
    return current;
  }

  return Object.freeze({ identity: measurement.identity, widths });
}
