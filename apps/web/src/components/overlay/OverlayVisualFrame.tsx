import { type ReactElement, useReducer } from "react";
import type { OverlayGeometry } from "./overlay-geometry.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";
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
import { OverlayItemAppearance } from "./OverlayItemAppearance.tsx";
import { OverlayShell } from "./OverlayShell.tsx";
import {
  type OverlayShellTransitionPhase,
  useOverlayShellTransition,
} from "./useOverlayShellTransition.ts";

type OverlayVisualArtworkRenderProps<Snapshot> = {
  readonly motion: OverlayMotionDecision;
  readonly snapshot: Snapshot;
};

type OverlayVisualMetadataRenderProps<Snapshot> = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly snapshot: Snapshot;
};

type OverlayVisualInteractionRenderProps<Snapshot> = {
  readonly availableWidth: number;
  readonly snapshot: Snapshot;
};

type OverlayVisualFrameProps<Snapshot> = {
  readonly animationIdentity: (snapshot: Snapshot) => string;
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly renderArtwork: (
    props: OverlayVisualArtworkRenderProps<Snapshot>,
  ) => ReactElement;
  readonly renderAttribution: (shellWidth: number) => ReactElement | null;
  readonly renderInteractionLayer?: (
    props: OverlayVisualInteractionRenderProps<Snapshot>,
  ) => ReactElement | null;
  readonly renderMetadata: (
    props: OverlayVisualMetadataRenderProps<Snapshot>,
  ) => ReactElement;
  readonly snapshot: Snapshot;
};

export function OverlayVisualFrame<Snapshot>({
  animationIdentity,
  geometry,
  motion,
  renderArtwork,
  renderAttribution,
  renderInteractionLayer,
  renderMetadata,
  snapshot,
}: OverlayVisualFrameProps<Snapshot>): ReactElement {
  const current = {
    identity: animationIdentity(snapshot),
    snapshot,
  };
  const shellTransition = useOverlayShellTransition(current, motion);
  const displayedSnapshot = shellTransition.snapshot;
  const animationIdentityKey = shellTransition.identity;
  const contentSizedShell = useContentSizedShell(animationIdentityKey);
  const shellWidth = shellWidthForTransition(
    shellTransition.phase,
    contentSizedShell.width,
  );

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
          {renderArtwork({ motion, snapshot: displayedSnapshot })}
          <OverlayItemAppearance
            identity={animationIdentityKey}
            motion={motion}
          >
            {renderMetadata({
              animationIdentityKey,
              availableWidth: contentSizedShell.availableWidth,
              motion,
              onTextMeasurement: contentSizedShell.reportTextMeasurement,
              snapshot: displayedSnapshot,
            })}
            {renderAttribution(shellWidth)}
          </OverlayItemAppearance>
        </g>
      </svg>
      {renderInteractionLayer?.({
        availableWidth: contentSizedShell.availableWidth,
        snapshot: displayedSnapshot,
      })}
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
  return { identity, widths: emptyOverlayTextWidths };
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

  return { identity: measurement.identity, widths };
}
