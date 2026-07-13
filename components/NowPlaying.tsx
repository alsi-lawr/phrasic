import type { ReactElement } from "react";
import type { BrowserPlaybackApplication } from "../browser/application.ts";
import type { PlaybackState } from "../domain/playback.ts";
import AlbumArtwork from "./artwork/AlbumArtwork";
import { PlaybackWorkerProvider } from "./playback/PlaybackWorkerProvider";
import { usePlaybackWorker } from "./playback/usePlaybackWorker";
import SongDetails from "./songdetails/SongDetails";
import "./NowPlaying.css";

type NowPlayingProps = {
  readonly application: BrowserPlaybackApplication;
};

export default function NowPlaying({
  application,
}: NowPlayingProps): ReactElement {
  return (
    <PlaybackWorkerProvider application={application}>
      <NowPlayingContent />
    </PlaybackWorkerProvider>
  );
}

function NowPlayingContent(): ReactElement {
  const { snapshot } = usePlaybackWorker();

  if (snapshot.kind === "fatal") {
    const message =
      snapshot.reason === "configuration-unavailable"
        ? "The browser configuration is unavailable."
        : "This browser cannot start Spotify playback.";
    return (
      <PlaybackFrame>
        <PlaybackStatus message={message} />
      </PlaybackFrame>
    );
  }

  return <PlaybackView state={snapshot.state} />;
}

type PlaybackViewProps = {
  readonly state: PlaybackState;
};

function PlaybackView({ state }: PlaybackViewProps): ReactElement {
  const content = playbackContent(state);

  return (
    <>
      <PlaybackFrame>{content}</PlaybackFrame>
      <PlaybackControls state={state} />
    </>
  );
}

function playbackContent(state: PlaybackState): ReactElement {
  switch (state.kind) {
    case "playing":
    case "paused":
      return (
        <>
          <AlbumArtwork state={state} />
          <SongDetails state={state} />
        </>
      );
    case "initializing":
      return <PlaybackStatus message="Loading playback." />;
    case "authorization-required":
      return <PlaybackStatus message="Spotify authorization is required." />;
    case "authorizing":
      return <PlaybackStatus message="Authorizing Spotify." />;
    case "empty":
      return <PlaybackStatus message="No track is currently playing." />;
    case "unsupported":
      return (
        <PlaybackStatus message="The current Spotify item is unsupported." />
      );
    case "reconnecting":
      return <PlaybackStatus message="Reconnecting to Spotify." />;
    case "failure":
      return <PlaybackStatus message="Playback updates are unavailable." />;
  }

  return assertNever(state);
}

type PlaybackFrameProps = {
  readonly children: ReactElement;
};

function PlaybackFrame({ children }: PlaybackFrameProps): ReactElement {
  return <div className="container">{children}</div>;
}

type PlaybackControlsProps = {
  readonly state: PlaybackState;
};

function PlaybackControls({
  state,
}: PlaybackControlsProps): ReactElement | null {
  const { beginAuthorization, logout, retry } = usePlaybackWorker();

  switch (state.kind) {
    case "initializing":
      return null;
    case "authorization-required":
      return (
        <nav aria-label="Spotify playback controls">
          <button type="button" onClick={beginAuthorization}>
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
        <nav aria-label="Spotify playback controls">
          <button type="button" onClick={logout}>
            Disconnect Spotify
          </button>
        </nav>
      );
    case "reconnecting":
    case "failure":
      return (
        <nav aria-label="Spotify playback controls">
          <button type="button" onClick={retry}>
            Retry playback
          </button>
          <button type="button" onClick={logout}>
            Disconnect Spotify
          </button>
        </nav>
      );
  }

  return assertNever(state);
}

type PlaybackStatusProps = {
  readonly message: string;
};

function PlaybackStatus({ message }: PlaybackStatusProps): ReactElement {
  return (
    <p role="status" aria-live="polite">
      {message}
    </p>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unexpected playback state: ${String(value)}`);
}
