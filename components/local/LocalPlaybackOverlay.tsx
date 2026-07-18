import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import { FallbackVinyl } from "../overlay/FallbackVinyl.tsx";
import { OverlayItemAppearance } from "../overlay/OverlayItemAppearance.tsx";
import { overlayMotionDecisionForPreference } from "../overlay/overlay-motion.ts";
import { LocalPlaybackMetadata } from "./LocalPlaybackMetadata.tsx";
import { LocalPlaybackSemanticCompanion } from "./LocalPlaybackSemanticCompanion.tsx";

type LocalPlaybackOverlayProps = {
  readonly presentation: LocalPlaybackPresentation;
  readonly prefersReducedMotion: boolean;
};

export function LocalPlaybackOverlay({
  presentation,
  prefersReducedMotion,
}: LocalPlaybackOverlayProps): ReactElement {
  const motion = overlayMotionDecisionForPreference(prefersReducedMotion);

  return (
    <main className="m-0 flex w-full flex-col items-start justify-start p-0 font-sans">
      <LocalPlaybackSemanticCompanion presentation={presentation} />
      <div className="m-0 flex w-full items-center gap-2 p-2">
        <svg
          aria-hidden="true"
          className="relative shrink-0"
          height={96}
          viewBox="0 0 1080 1080"
          width={96}
        >
          <OverlayItemAppearance
            identity={localPresentationAnimationKey(presentation)}
            motion={motion}
          >
            <FallbackVinyl motion={motion} />
          </OverlayItemAppearance>
        </svg>
        <LocalPlaybackMetadata presentation={presentation} />
      </div>
    </main>
  );
}

function localPresentationAnimationKey(
  presentation: LocalPlaybackPresentation,
): string {
  switch (presentation.kind) {
    case "content":
      return "local-content";
    case "stale-content":
      return "local-stale-content";
    case "metadata-unavailable":
      return "metadata-unavailable";
    case "unavailable":
      return `unavailable:${presentation.status}`;
  }

  return unreachable(presentation);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local overlay value: ${String(value)}`);
}
