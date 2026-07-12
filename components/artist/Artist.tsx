import type {
  PlaybackWireItem,
  PlaybackWireItemAvailability,
} from "@/domain/playback-stream";
import type { ReactElement } from "react";
import "./Artist.css";

type ArtistProps = {
  readonly item: PlaybackWireItemAvailability;
};

export default function Artist({ item }: ArtistProps): ReactElement {
  if (item.kind === "unavailable") {
    return <div className="artist" />;
  }

  const artist = artistText(item.item);
  return <div className="artist fade-in">{artist}</div>;
}

function artistText(item: PlaybackWireItem): string {
  switch (item.kind) {
    case "track":
      return item.artists.map((artist): string => artist.name).join(", ");
    case "episode":
      return item.show.publisher;
  }

  return assertNever(item);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected playback item: ${String(value)}`);
}
