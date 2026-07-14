import { type ReactElement, useReducer } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { OverlayItemAppearance } from "./OverlayItemAppearance.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import {
  emptyOverlayTextWidths,
  overlayMetadataAvailableWidth,
  overlayShell,
  overlayShellClipPathId,
  overlayShellWidthForTextWidths,
  overlayTextWidthsWithMeasurement,
  type OverlayTextMeasurement,
  type OverlayTextMeasurementReporter,
  type OverlayTextWidths,
} from "./overlay-layout.ts";
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayShell } from "./OverlayShell.tsx";
import { OverlayVisualProviderLinks } from "./OverlayVisualProviderLinks.tsx";
import type { OverlayPresentation } from "./overlay-presentation.ts";
import {
  type OverlayShellTransitionPhase,
  useOverlayShellTransition,
} from "./useOverlayShellTransition.ts";

type OverlayVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayVisual({
  geometry,
  motion,
  presentation,
  snapshot,
}: OverlayVisualProps): ReactElement {
  const shellTransition = useOverlayShellTransition(snapshot, motion);
  const displayedSnapshot = shellTransition.snapshot;
  const animationIdentityKey = overlayAnimationIdentityKey(displayedSnapshot);
  const contentSizedShell = useContentSizedShell(animationIdentityKey);
  const shellWidth = shellWidthForTransition(
    shellTransition.phase,
    contentSizedShell.width,
  );
  const Attribution = presentation.attribution;

  return (
    <div className="relative shrink-0">
      <svg
        aria-hidden="true"
        className="block"
        width={geometry.width.value}
        height={geometry.height.value}
        viewBox={geometry.viewBox}
      >
        <OverlayShell
          motion={motion}
          onWidthTransitionEnd={shellTransition.completeWidthTransition}
          width={shellWidth}
        />
        <g clipPath={`url(#${overlayShellClipPathId})`}>
          <OverlayItemAppearance
            identity={animationIdentityKey}
            motion={motion}
          >
            <OverlayArtwork motion={motion} snapshot={displayedSnapshot} />
            <OverlayMetadata
              availableWidth={contentSizedShell.availableWidth}
              motion={motion}
              onTextMeasurement={contentSizedShell.reportTextMeasurement}
              presentation={presentation}
              snapshot={displayedSnapshot}
            />
            <Attribution shellWidth={shellWidth} />
          </OverlayItemAppearance>
        </g>
      </svg>
      <OverlayVisualProviderLinks
        availableWidth={contentSizedShell.availableWidth}
        presentation={presentation}
        snapshot={displayedSnapshot}
      />
    </div>
  );
}

function shellWidthForTransition(
  phase: OverlayShellTransitionPhase,
  contentWidth: number,
): number {
  return phase === "collapsing" ? overlayShell.minimumWidth : contentWidth;
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
