export type OverlayContentLine = "context" | "creator" | "detail" | "title";

export type OverlayTextWidths = {
  readonly context: number;
  readonly creator: number;
  readonly detail: number;
  readonly title: number;
};

export type OverlayTextMeasurement = {
  readonly identity: string;
  readonly line: OverlayContentLine;
  readonly width: number;
};

export type OverlayTextMeasurementReporter = (
  measurement: OverlayTextMeasurement,
) => void;

export const overlayShell: Readonly<{
  height: number;
  maximumWidth: number;
  minimumWidth: number;
  radius: number;
}> = {
  height: 1_080,
  maximumWidth: 4_725,
  minimumWidth: 1_080,
  radius: 200,
};

export const overlayArtworkRectangle: Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}> = {
  height: overlayShell.height,
  width: overlayShell.height,
  x: 0,
  y: 0,
};

export const overlayArtworkClipPathId = "overlay-artwork-rounded-clip";
export const overlayShellClipPathId = "overlay-shell-clip";

export const overlayArtworkRoundedClipPathData =
  "M 200 0 H 880 A 200 200 0 0 1 1080 200 V 880 A 200 200 0 0 1 880 1080 H 200 A 200 200 0 0 1 0 880 V 200 A 200 200 0 0 1 200 0 Z";

const overlayCreatorLine: OverlayTextLineLayout = {
  clipHeight: 250,
  clipPathId: "overlay-metadata-creator-clip",
  clipY: 180,
  line: "creator",
  y: 380,
};
const overlayTitleLine: OverlayTextLineLayout = {
  clipHeight: 360,
  clipPathId: "overlay-metadata-title-clip",
  clipY: 400,
  line: "title",
  y: 690,
};
const overlayDetailLine: OverlayTextLineLayout = {
  clipHeight: 110,
  clipPathId: "overlay-metadata-detail-clip",
  clipY: 790,
  line: "detail",
  y: 870,
};
const overlayContextLine: OverlayTextLineLayout = {
  clipHeight: 90,
  clipPathId: "overlay-metadata-context-clip",
  clipY: 930,
  line: "context",
  y: 995,
};
const overlayStatusLabelLine: OverlayTextLineLayout = {
  clipHeight: 150,
  clipPathId: "overlay-status-label-clip",
  clipY: 260,
  line: "creator",
  y: 370,
};
const overlayStatusTitleLine: OverlayTextLineLayout = {
  clipHeight: 150,
  clipPathId: "overlay-status-title-clip",
  clipY: 430,
  line: "title",
  y: 540,
};
const overlayStatusDetailLine: OverlayTextLineLayout = {
  clipHeight: 120,
  clipPathId: "overlay-status-detail-clip",
  clipY: 620,
  line: "detail",
  y: 710,
};
const overlayStatusContextLine: OverlayTextLineLayout = {
  clipHeight: 100,
  clipPathId: "overlay-status-context-clip",
  clipY: 800,
  line: "context",
  y: 875,
};

export type OverlayTextLineLayout = {
  readonly clipHeight: number;
  readonly clipPathId: string;
  readonly clipY: number;
  readonly line: OverlayContentLine;
  readonly y: number;
};

export const overlayMetadataLayout: Readonly<{
  contextLine: OverlayTextLineLayout;
  creatorLine: OverlayTextLineLayout;
  detailLine: OverlayTextLineLayout;
  rightPadding: number;
  statusContextLine: OverlayTextLineLayout;
  statusDetailLine: OverlayTextLineLayout;
  statusLabelLine: OverlayTextLineLayout;
  statusTitleLine: OverlayTextLineLayout;
  titleLine: OverlayTextLineLayout;
  x: number;
}> = {
  contextLine: overlayContextLine,
  creatorLine: overlayCreatorLine,
  detailLine: overlayDetailLine,
  rightPadding: 200,
  statusContextLine: overlayStatusContextLine,
  statusDetailLine: overlayStatusDetailLine,
  statusLabelLine: overlayStatusLabelLine,
  statusTitleLine: overlayStatusTitleLine,
  titleLine: overlayTitleLine,
  x: 1_380,
};

export const emptyOverlayTextWidths: OverlayTextWidths = {
  context: 0,
  creator: 0,
  detail: 0,
  title: 0,
};

export function overlayShellWidthForTextWidths(
  textWidths: OverlayTextWidths,
): number {
  const widestText = Math.max(
    boundedTextWidth(textWidths.context),
    boundedTextWidth(textWidths.creator),
    boundedTextWidth(textWidths.detail),
    boundedTextWidth(textWidths.title),
  );
  if (widestText === 0) {
    return overlayShell.minimumWidth;
  }
  const requestedWidth =
    overlayMetadataLayout.x + widestText + overlayMetadataLayout.rightPadding;

  return clamp(
    requestedWidth,
    overlayShell.minimumWidth,
    overlayShell.maximumWidth,
  );
}

export function overlayMetadataAvailableWidth(shellWidth: number): number {
  const boundedShellWidth = clamp(
    shellWidth,
    overlayShell.minimumWidth,
    overlayShell.maximumWidth,
  );
  const availableWidth =
    boundedShellWidth -
    overlayMetadataLayout.x -
    overlayMetadataLayout.rightPadding;

  return Math.max(0, availableWidth);
}

export function overlayTextWidthsWithMeasurement(
  textWidths: OverlayTextWidths,
  measurement: OverlayTextMeasurement,
): OverlayTextWidths {
  const width = boundedTextWidth(measurement.width);

  switch (measurement.line) {
    case "context":
      return updatedTextWidths(textWidths, "context", width);
    case "creator":
      return updatedTextWidths(textWidths, "creator", width);
    case "detail":
      return updatedTextWidths(textWidths, "detail", width);
    case "title":
      return updatedTextWidths(textWidths, "title", width);
  }

  return unreachable(measurement.line);
}

function updatedTextWidths(
  textWidths: OverlayTextWidths,
  line: OverlayContentLine,
  width: number,
): OverlayTextWidths {
  if (textWidths[line] === width) {
    return textWidths;
  }

  switch (line) {
    case "context":
      return { ...textWidths, context: width };
    case "creator":
      return { ...textWidths, creator: width };
    case "detail":
      return { ...textWidths, detail: width };
    case "title":
      return { ...textWidths, title: width };
  }

  return unreachable(line);
}

function boundedTextWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return 0;
  }

  return Math.min(width, overlayShell.maximumWidth);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay content line: ${String(value)}`);
}
