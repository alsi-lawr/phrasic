import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import type { OverlayGeometry } from "../overlay/overlay-geometry.ts";
import type { OverlayMotionDecision } from "../overlay/overlay-motion.ts";
import { OverlaySetupDiagnostic } from "../overlay/OverlaySetupDiagnostic.tsx";
import { LocalPlaybackSemanticCompanion } from "./LocalPlaybackSemanticCompanion.tsx";
import { LocalPlaybackVisual } from "./LocalPlaybackVisual.tsx";

type LocalPlaybackOverlayProps = {
  readonly geometry: OverlayGeometry;
  readonly motion: OverlayMotionDecision;
  readonly presentation: LocalPlaybackPresentation;
};

export function LocalPlaybackOverlay({
  geometry,
  motion,
  presentation,
}: LocalPlaybackOverlayProps): ReactElement {
  return (
    <main className="m-0 flex w-full flex-col items-start justify-start p-0 font-sans">
      <h1 id="local-playback-heading" className="sr-only">
        Local playback now playing
      </h1>
      <LocalPlaybackSemanticCompanion presentation={presentation} />
      <LocalPlaybackVisual
        geometry={geometry}
        motion={motion}
        presentation={presentation}
      />
      <OverlaySetupDiagnostic diagnostic={geometry.diagnostic} />
    </main>
  );
}
