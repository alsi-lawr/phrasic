import type { ReactElement } from "react";
import type {
  BrowserPlaybackApplication,
  BrowserPlaybackApplicationSnapshot,
} from "../../browser/application.ts";
import type { PlaybackState } from "../../domain/playback.ts";
import { PlaybackWorkerProvider } from "../playback/PlaybackWorkerProvider.tsx";
import { usePlaybackWorker } from "../playback/usePlaybackWorker.ts";
import { resolveOverlayGeometry } from "./overlay-geometry.ts";
import { visualStatusForSnapshot } from "./overlay-status.ts";
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
  const status = visualStatusForSnapshot(snapshot);

  return (
    <div className="m-0 flex w-full flex-col items-start justify-start p-0">
      <OverlayVisual geometry={geometry} snapshot={snapshot} status={status} />
      <PlaybackStatus snapshot={snapshot} message={status.message} />
      <PlaybackControls
        snapshot={snapshot}
        beginAuthorization={beginAuthorization}
        logout={logout}
        retry={retry}
      />
    </div>
  );
}

type PlaybackStatusProps = {
  readonly message: string;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function PlaybackStatus({
  message,
  snapshot,
}: PlaybackStatusProps): ReactElement | null {
  if (
    snapshot.kind === "playback" &&
    (snapshot.state.kind === "playing" || snapshot.state.kind === "paused")
  ) {
    return null;
  }

  return (
    <p className="m-0 px-2 py-1 text-sm" role="status" aria-live="polite">
      {message}
    </p>
  );
}

type PlaybackControlsProps = {
  readonly beginAuthorization: () => void;
  readonly logout: () => void;
  readonly retry: () => void;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function PlaybackControls({
  beginAuthorization,
  logout,
  retry,
  snapshot,
}: PlaybackControlsProps): ReactElement | null {
  if (snapshot.kind === "fatal") {
    return null;
  }

  return controlsForPlaybackState(snapshot.state, {
    beginAuthorization,
    logout,
    retry,
  });
}

type PlaybackControlActions = {
  readonly beginAuthorization: () => void;
  readonly logout: () => void;
  readonly retry: () => void;
};

function controlsForPlaybackState(
  state: PlaybackState,
  actions: PlaybackControlActions,
): ReactElement | null {
  switch (state.kind) {
    case "initializing":
      return null;
    case "authorization-required":
      return (
        <nav
          className="m-0 flex w-full items-center gap-2 p-2"
          aria-label="Spotify playback controls"
        >
          <button
            className="rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100"
            type="button"
            onClick={actions.beginAuthorization}
          >
            Connect Spotify
          </button>
        </nav>
      );
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
      return (
        <nav
          className="m-0 flex w-full items-center gap-2 p-2"
          aria-label="Spotify playback controls"
        >
          <button
            className="rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100"
            type="button"
            onClick={actions.logout}
          >
            Disconnect Spotify
          </button>
        </nav>
      );
    case "reconnecting":
    case "failure":
      return (
        <nav
          className="m-0 flex w-full items-center gap-2 p-2"
          aria-label="Spotify playback controls"
        >
          <button
            className="rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100"
            type="button"
            onClick={actions.retry}
          >
            Retry playback
          </button>
          <button
            className="rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100"
            type="button"
            onClick={actions.logout}
          >
            Disconnect Spotify
          </button>
        </nav>
      );
  }

  return unreachable(state);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected playback state: ${String(value)}`);
}
