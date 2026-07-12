import { currentPlaybackItem } from "@/domain/playback-stream";
import type { ReactElement } from "react";
import Artist from "../artist/Artist";
import { useFetchData } from "../hookintoupdates/FetchDataHook";
import Title from "../title/Title";
import "./SongDetails.css";

export default function SongDetails(): ReactElement {
  const { state } = useFetchData();
  const item = currentPlaybackItem(state);
  const className =
    item.kind === "available" ? "song-details" : "song-details no-data";

  return (
    <div className={className}>
      <Artist item={item} />
      <Title item={item} />
    </div>
  );
}
