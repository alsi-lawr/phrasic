import type { ReactElement } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import { PlaybackWorkerProvider } from "../playback/PlaybackWorkerProvider.tsx";
import { usePlaybackWorker } from "../playback/usePlaybackWorker.ts";
import { OverlayControls } from "./OverlayControls.tsx";
import { resolveOverlayGeometry } from "./overlay-geometry.ts";
import {
  controlPlanForOverlayState,
  overlayUiStateForSnapshot,
} from "./overlay-state.ts";
import { OverlayVisual } from "./OverlayVisual.tsx";

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
  const geometry = resolveOverlayGeometry(
    new URL(window.location.href).searchParams,
  );
  const state = overlayUiStateForSnapshot(snapshot);
  const controls = controlPlanForOverlayState(state, geometry.setupMode);

  return (
    <div className="m-0 flex w-full flex-col items-start justify-start p-0">
      <OverlayVisual geometry={geometry} state={state} />
      <OverlayControls
        actions={{ beginAuthorization, logout, retry }}
        plan={controls}
      />
    </div>
  );
}
