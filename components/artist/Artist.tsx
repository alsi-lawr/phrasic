import type {
  LastPlaybackItem,
  NowPlayingItem,
} from "../../domain/playback.ts";
import type { ReactElement } from "react";
import "./Artist.css";

type ArtistProps = {
  readonly item: LastPlaybackItem;
};

export default function Artist({ item }: ArtistProps): ReactElement {
  if (item.kind === "unavailable") {
    return <div className="artist" />;
  }

  const artist = artistText(item.item);
  return <div className="artist fade-in">{artist}</div>;
}

function artistText(item: NowPlayingItem): string {
  switch (item.kind) {
    case "track":
      return item.artists.map((artist): string => artist.name.value).join(", ");
    case "episode":
      return item.show.publisher.value;
  }

  return assertNever(item);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected playback item: ${String(value)}`);
}
