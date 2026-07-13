import {
  currentPlaybackItem,
  type PlaybackState,
} from "../../domain/playback.ts";
import type { ReactElement } from "react";
import Artist from "../artist/Artist";
import Title from "../title/Title";
import "./SongDetails.css";

type SongDetailsProps = {
  readonly state: PlaybackState;
};

export default function SongDetails({ state }: SongDetailsProps): ReactElement {
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
