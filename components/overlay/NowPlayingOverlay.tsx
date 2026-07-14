import type { ReactElement } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import { PlaybackWorkerProvider } from "../playback/PlaybackWorkerProvider.tsx";
import { usePlaybackWorker } from "../playback/usePlaybackWorker.ts";
import { OverlayControls } from "./OverlayControls.tsx";
import { resolveOverlayGeometry } from "./overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "./overlay-motion.ts";
import { OverlaySemanticCompanion } from "./OverlaySemanticCompanion.tsx";
import { OverlaySetupDiagnostic } from "./OverlaySetupDiagnostic.tsx";
import { OverlayVisual } from "./OverlayVisual.tsx";
import { useReducedMotionPreference } from "./reduced-motion.ts";
import type { OverlayPresentation } from "./overlay-presentation.ts";

type NowPlayingOverlayProps = {
  readonly application: BrowserPlaybackApplication;
  readonly presentation: OverlayPresentation;
};

export default function NowPlayingOverlay({
  application,
  presentation,
}: NowPlayingOverlayProps): ReactElement {
  return (
    <PlaybackWorkerProvider application={application}>
      <NowPlayingOverlayContent presentation={presentation} />
    </PlaybackWorkerProvider>
  );
}

type NowPlayingOverlayContentProps = {
  readonly presentation: OverlayPresentation;
};

function NowPlayingOverlayContent({
  presentation,
}: NowPlayingOverlayContentProps): ReactElement {
  const { beginAuthorization, logout, retry, snapshot } = usePlaybackWorker();
  const prefersReducedMotion = useReducedMotionPreference();
  const geometry = resolveOverlayGeometry(
    new URL(window.location.href).searchParams,
  );
  const motion = overlayMotionDecisionForPreference(prefersReducedMotion);

  return (
    <main className="m-0 flex w-full flex-col items-start justify-start p-0 font-sans">
      <h1 id={presentation.headingId} className="sr-only">
        {presentation.displayName} now playing
      </h1>
      <OverlaySemanticCompanion
        presentation={presentation}
        snapshot={snapshot}
      />
      <OverlayVisual
        geometry={geometry}
        motion={motion}
        presentation={presentation}
        snapshot={snapshot}
      />
      <OverlaySetupDiagnostic diagnostic={geometry.diagnostic} />
      <OverlayControls
        actions={{ beginAuthorization, logout, retry }}
        presentation={presentation}
        setupMode={geometry.setupMode}
        snapshot={snapshot}
      />
    </main>
  );
}
