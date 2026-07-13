import type { ReactElement } from "react";
import { OverlayArtwork } from "./OverlayArtwork.tsx";
import { type OverlayGeometry } from "./overlay-geometry.ts";
import {
  visualTreatmentForOverlayState,
  type OverlayUiState,
} from "./overlay-state.ts";
import { OverlayMetadata } from "./OverlayMetadata.tsx";
import { OverlayShell } from "./OverlayShell.tsx";
import { OverlayStatus } from "./OverlayStatus.tsx";

type OverlayVisualProps = {
  readonly geometry: OverlayGeometry;
  readonly state: OverlayUiState;
};

export function OverlayVisual({
  geometry,
  state,
}: OverlayVisualProps): ReactElement {
  const treatment = visualTreatmentForOverlayState(state);

  return (
    <svg
      aria-hidden="true"
      className="block shrink-0"
      width={geometry.width.value}
      height={geometry.height.value}
      viewBox={geometry.viewBox}
    >
      <OverlayShell />
      <OverlayArtwork state={state} />
      <OverlayMetadata state={state} />
      <OverlayStatus treatment={treatment} />
    </svg>
  );
}
