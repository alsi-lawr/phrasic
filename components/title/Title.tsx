import type { PlaybackWireItemAvailability } from "@/domain/playback-stream";
import type { ReactElement } from "react";
import "./Title.css";

type TitleProps = {
  readonly item: PlaybackWireItemAvailability;
};

export default function Title({ item }: TitleProps): ReactElement {
  if (item.kind === "unavailable") {
    return <div className="title" />;
  }

  const className =
    item.item.title.length > 23 ? "title scroll-text fade-in" : "title fade-in";
  return <div className={className}>{item.item.title}</div>;
}
