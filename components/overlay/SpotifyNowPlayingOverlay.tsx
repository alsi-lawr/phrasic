import type { ReactElement } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import { PlaybackWorkerProvider } from "../playback/PlaybackWorkerProvider.tsx";
import { usePlaybackWorker } from "../playback/usePlaybackWorker.ts";
import { OverlayControls } from "./OverlayControls.tsx";
import { resolveOverlayGeometry } from "./overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "./overlay-motion.ts";
import {
  OverlaySemanticCompanion,
  overlaySemanticHeadingId,
} from "./OverlaySemanticCompanion.tsx";
import { semanticViewForOverlayState } from "./overlay-semantics.ts";
import {
  controlPlanForOverlayState,
  overlayUiStateForSnapshot,
} from "./overlay-state.ts";
import { OverlayVisual } from "./OverlayVisual.tsx";
import { useReducedMotionPreference } from "./reduced-motion.ts";

type SpotifyNowPlayingOverlayProps = {
  readonly application: BrowserPlaybackApplication;
};

export default function SpotifyNowPlayingOverlay({
  application,
}: SpotifyNowPlayingOverlayProps): ReactElement {
  return (
    <PlaybackWorkerProvider application={application}>
      <SpotifyNowPlayingOverlayContent />
    </PlaybackWorkerProvider>
  );
}

function SpotifyNowPlayingOverlayContent(): ReactElement {
  const { beginAuthorization, logout, retry, snapshot } = usePlaybackWorker();
  const prefersReducedMotion = useReducedMotionPreference();
  const geometry = resolveOverlayGeometry(
    new URL(window.location.href).searchParams,
  );
  const state = overlayUiStateForSnapshot(snapshot);
  const motion = overlayMotionDecisionForPreference(prefersReducedMotion);
  const semantic = semanticViewForOverlayState(state);
  const controls = controlPlanForOverlayState(state, geometry.setupMode);

  return (
    <main className="m-0 flex w-full flex-col items-start justify-start p-0 font-sans">
      <h1 id={overlaySemanticHeadingId} className="sr-only">
        Spotify now playing
      </h1>
      <OverlaySemanticCompanion semantic={semantic} />
      <OverlayVisual
        geometry={geometry}
        metadata={semantic.metadata}
        motion={motion}
        state={state}
      />
      <OverlayControls
        actions={{ beginAuthorization, logout, retry }}
        plan={controls}
      />
    </main>
  );
}
