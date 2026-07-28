import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import type { OverlayGeometry } from "../overlay/overlay-geometry.ts";
import type { OverlayMotionDecision } from "../overlay/overlay-motion.ts";
import { OverlayFallbackArtwork } from "../overlay/OverlayArtwork.tsx";
import { OverlayVisualFrame } from "../overlay/OverlayVisualFrame.tsx";
import { LocalPlaybackAttribution } from "./LocalPlaybackAttribution.tsx";
import { LocalPlaybackMetadata } from "./LocalPlaybackMetadata.tsx";

type LocalPlaybackVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly presentation: LocalPlaybackPresentation;
};

export function LocalPlaybackVisual({
  geometry,
  motion,
  presentation,
}: LocalPlaybackVisualProps): ReactElement {
  return (
    <OverlayVisualFrame
      animationIdentity={localAnimationIdentityKey}
      geometry={geometry}
      motion={motion}
      renderArtwork={({ motion: displayedMotion, snapshot }) => (
        <OverlayFallbackArtwork
          identity={localAnimationIdentityKey(snapshot)}
          motion={displayedMotion}
        />
      )}
      renderAttribution={(shellWidth): ReactElement => (
        <LocalPlaybackAttribution shellWidth={shellWidth} />
      )}
      renderMetadata={({
        animationIdentityKey,
        availableWidth,
        motion: displayedMotion,
        onTextMeasurement,
        snapshot,
      }): ReactElement => (
        <LocalPlaybackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={displayedMotion}
          onTextMeasurement={onTextMeasurement}
          presentation={snapshot}
        />
      )}
      snapshot={presentation}
    />
  );
}

function localAnimationIdentityKey(
  presentation: LocalPlaybackPresentation,
): string {
  switch (presentation.kind) {
    case "content":
    case "stale-content":
      return localItemIdentityKey(presentation);
    case "metadata-unavailable":
      return "animation:local:metadata-unavailable";
    case "unavailable":
      return `animation:local:unavailable:${presentation.status}`;
  }

  return unreachable(presentation);
}

function localItemIdentityKey(
  presentation: Extract<
    LocalPlaybackPresentation,
    { readonly kind: "content" | "stale-content" }
  >,
): string {
  const metadata = presentation.snapshot.metadata;
  const nativeIdentity = metadata.nativeIdentity?.toString();
  if (nativeIdentity !== undefined) {
    return `animation:local:item:${nativeIdentity.length}:${nativeIdentity}`;
  }

  const title = metadata.title.toString();
  const creator = metadata.creator?.toString() ?? "";
  const collection = metadata.collection?.toString() ?? "";
  return [
    "animation:local:item",
    `${title.length}:${title}`,
    `${creator.length}:${creator}`,
    `${collection.length}:${collection}`,
  ].join(":");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local overlay value: ${String(value)}`);
}
