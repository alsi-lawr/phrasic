"use client";

import type { ReactElement } from "react";
import AlbumArtwork from "./artwork/AlbumArtwork";
import { FetchDataProvider } from "./hookintoupdates/FetchDataProvider";
import SongDetails from "./songdetails/SongDetails";
import "./NowPlaying.css";

export default function NowPlaying(): ReactElement {
  return (
    <div className="container">
      <FetchDataProvider>
        <AlbumArtwork />
        <SongDetails />
      </FetchDataProvider>
    </div>
  );
}
