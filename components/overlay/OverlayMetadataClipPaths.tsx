import type { ReactElement } from "react";
import {
  overlayMetadataLayout,
  type OverlayTextLineLayout,
} from "./overlay-layout.ts";

type MetadataClipPathsProps = {
  readonly availableWidth: number;
};

export function MetadataClipPaths({
  availableWidth,
}: MetadataClipPathsProps): ReactElement {
  return (
    <defs>
      <MetadataClipPath
        line={overlayMetadataLayout.creatorLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.titleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.detailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.contextLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusLabelLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusTitleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusDetailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusContextLine}
        width={availableWidth}
      />
    </defs>
  );
}

type MetadataClipPathProps = {
  readonly line: OverlayTextLineLayout;
  readonly width: number;
};

function MetadataClipPath({
  line,
  width,
}: MetadataClipPathProps): ReactElement {
  return (
    <clipPath id={line.clipPathId} clipPathUnits="userSpaceOnUse">
      <rect
        x={overlayMetadataLayout.x}
        y={line.clipY}
        width={width}
        height={line.clipHeight}
      />
    </clipPath>
  );
}
