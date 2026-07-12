import type { LastPlaybackItem } from "@/domain/playback";
import type { ReactElement } from "react";
import "./Title.css";

type TitleProps = {
  readonly item: LastPlaybackItem;
};

export default function Title({ item }: TitleProps): ReactElement {
  if (item.kind === "unavailable") {
    return <div className="title" />;
  }

  const title = item.item.title.value;
  const className =
    title.length > 23 ? "title scroll-text fade-in" : "title fade-in";
  return <div className={className}>{title}</div>;
}
