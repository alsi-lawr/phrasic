import { type ReactElement, useReducer } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { OverlayItemAppearance } from "./OverlayItemAppearance.tsx";
import { OverlaySpotifyAttribution } from "./OverlaySpotifyAttribution.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
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
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayShell } from "./OverlayShell.tsx";
import { OverlayVisualSpotifyLinks } from "./OverlayVisualSpotifyLinks.tsx";

type OverlayVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayVisual({
  geometry,
  motion,
  snapshot,
}: OverlayVisualProps): ReactElement {
  const animationIdentityKey = overlayAnimationIdentityKey(snapshot);
  const contentSizedShell = useContentSizedShell(animationIdentityKey);

  return (
    <div className="relative shrink-0">
      <svg
        aria-hidden="true"
        className="block"
        width={geometry.width.value}
        height={geometry.height.value}
        viewBox={geometry.viewBox}
      >
        <OverlayShell width={contentSizedShell.width} />
        <g clipPath={`url(#${overlayShellClipPathId})`}>
          <OverlayItemAppearance
            identity={animationIdentityKey}
            motion={motion}
          >
            <OverlayArtwork motion={motion} snapshot={snapshot} />
            <OverlayMetadata
              availableWidth={contentSizedShell.availableWidth}
              motion={motion}
              onTextMeasurement={contentSizedShell.reportTextMeasurement}
              snapshot={snapshot}
            />
            <OverlaySpotifyAttribution shellWidth={contentSizedShell.width} />
          </OverlayItemAppearance>
        </g>
      </svg>
      <OverlayVisualSpotifyLinks
        availableWidth={contentSizedShell.availableWidth}
        snapshot={snapshot}
      />
    </div>
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
