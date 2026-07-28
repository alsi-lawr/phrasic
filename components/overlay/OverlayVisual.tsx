import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayVisualFrame } from "./OverlayVisualFrame.tsx";
import { OverlayVisualProviderLinks } from "./OverlayVisualProviderLinks.tsx";
import type { OverlayPresentation } from "./overlay-presentation.ts";

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
  const Attribution = presentation.attribution;

  return (
    <OverlayVisualFrame
      animationIdentity={overlayAnimationIdentityKey}
      geometry={geometry}
      motion={motion}
      renderArtwork={(props): ReactElement => <OverlayArtwork {...props} />}
      renderAttribution={(shellWidth): ReactElement | null => (
        <Attribution shellWidth={shellWidth} />
      )}
      renderInteractionLayer={({ availableWidth, snapshot: displayed }) => (
        <OverlayVisualProviderLinks
          availableWidth={availableWidth}
          presentation={presentation}
          snapshot={displayed}
        />
      )}
      renderMetadata={({
        availableWidth,
        motion: displayedMotion,
        onTextMeasurement,
        snapshot: displayed,
      }): ReactElement => (
        <OverlayMetadata
          availableWidth={availableWidth}
          motion={displayedMotion}
          onTextMeasurement={onTextMeasurement}
          presentation={presentation}
          snapshot={displayed}
        />
      )}
      snapshot={snapshot}
    />
  );
}
