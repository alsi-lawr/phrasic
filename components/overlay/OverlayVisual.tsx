import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import {
  currentPlaybackItem,
  unavailableLastPlaybackItem,
  type LastPlaybackItem,
} from "../../domain/playback.ts";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import type { OverlayVisualStatus } from "./overlay-status.ts";
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayShell } from "./OverlayShell.tsx";
import { OverlayStatus } from "./OverlayStatus.tsx";

type OverlayVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
  readonly status: OverlayVisualStatus;
};

export function OverlayVisual({
  geometry,
  snapshot,
  status,
}: OverlayVisualProps): ReactElement {
  const item = itemForSnapshot(snapshot);

  return (
    <svg
      aria-hidden="true"
      className="block shrink-0"
      width={geometry.width.value}
      height={geometry.height.value}
      viewBox={geometry.viewBox}
    >
      <OverlayShell />
      <OverlayArtwork item={item} />
      <OverlayMetadata item={item} status={status} />
      <OverlayStatus status={status} />
    </svg>
  );
}

function itemForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
): LastPlaybackItem {
  if (snapshot.kind === "fatal") {
    return unavailableLastPlaybackItem();
  }

  return currentPlaybackItem(snapshot.state);
}
