"use client";

import type { ReactElement } from "react";
import AlbumArtwork from "./artwork/AlbumArtwork";
import { useFetchData } from "./hookintoupdates/FetchDataHook";
import { FetchDataProvider } from "./hookintoupdates/FetchDataProvider";
import SongDetails from "./songdetails/SongDetails";
import "./NowPlaying.css";

export default function NowPlaying(): ReactElement {
  return (
    <div className="container">
      <FetchDataProvider>
        <NowPlayingContent />
      </FetchDataProvider>
    </div>
  );
}

function NowPlayingContent(): ReactElement {
  const { state } = useFetchData();

  switch (state.kind) {
    case "playing":
    case "paused":
      return (
        <>
          <AlbumArtwork />
          <SongDetails />
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
