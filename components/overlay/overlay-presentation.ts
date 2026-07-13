import type { OverlayVisualTone } from "./overlay-state.ts";

const overlayMetadataContextTextClass =
  "font-overlay-display fill-overlay-content-muted text-overlay-detail font-semibold tracking-overlay-context";
const overlayMetadataSubtitleTextClass =
  "font-overlay-display fill-overlay-content-secondary text-overlay-subtitle font-semibold tracking-overlay-normal";
const overlayMetadataTitleTextClass =
  "font-overlay-display fill-overlay-content-title text-overlay-title font-bold tracking-overlay-normal";

type OverlayMetadataContextTextClass = typeof overlayMetadataContextTextClass;
type OverlayMetadataSubtitleTextClass = typeof overlayMetadataSubtitleTextClass;
type OverlayMetadataTitleTextClass = typeof overlayMetadataTitleTextClass;

export type OverlayMetadataTextClass =
  | OverlayMetadataContextTextClass
  | OverlayMetadataSubtitleTextClass
  | OverlayMetadataTitleTextClass;

type OverlayMetadataTextClasses = {
  readonly context: OverlayMetadataContextTextClass;
  readonly subtitle: OverlayMetadataSubtitleTextClass;
  readonly title: OverlayMetadataTitleTextClass;
};

export const overlayMetadataTextClasses: OverlayMetadataTextClasses =
  Object.freeze({
    context: overlayMetadataContextTextClass,
    subtitle: overlayMetadataSubtitleTextClass,
    title: overlayMetadataTitleTextClass,
  } satisfies OverlayMetadataTextClasses);

export const overlayMetadataCategoryTextClass =
  "font-overlay-display fill-overlay-content-muted text-overlay-category font-bold tracking-overlay-category";
export const overlayStatusLabelTextClass =
  "font-overlay-display fill-overlay-status-neutral text-overlay-detail font-bold tracking-overlay-status";

const statusActiveFillClass = "fill-overlay-status-active";
const statusFailureFillClass = "fill-overlay-status-failure";
const statusNeutralFillClass = "fill-overlay-status-neutral";
const statusWarningFillClass = "fill-overlay-status-warning";
const statusActiveStrokeClass = "stroke-overlay-status-active";
const statusFailureStrokeClass = "stroke-overlay-status-failure";
const statusNeutralStrokeClass = "stroke-overlay-status-neutral";
const statusWarningStrokeClass = "stroke-overlay-status-warning";

type OverlayActiveStatusColorClasses = {
  readonly fill: typeof statusActiveFillClass;
  readonly stroke: typeof statusActiveStrokeClass;
};
type OverlayFailureStatusColorClasses = {
  readonly fill: typeof statusFailureFillClass;
  readonly stroke: typeof statusFailureStrokeClass;
};
type OverlayNeutralStatusColorClasses = {
  readonly fill: typeof statusNeutralFillClass;
  readonly stroke: typeof statusNeutralStrokeClass;
};
type OverlayWarningStatusColorClasses = {
  readonly fill: typeof statusWarningFillClass;
  readonly stroke: typeof statusWarningStrokeClass;
};

export type OverlayStatusColorClasses =
  | OverlayActiveStatusColorClasses
  | OverlayFailureStatusColorClasses
  | OverlayNeutralStatusColorClasses
  | OverlayWarningStatusColorClasses;

type OverlayStatusColorClassMap = Readonly<{
  readonly active: OverlayActiveStatusColorClasses;
  readonly failure: OverlayFailureStatusColorClasses;
  readonly neutral: OverlayNeutralStatusColorClasses;
  readonly warning: OverlayWarningStatusColorClasses;
}>;

const overlayStatusColorClassesByTone: OverlayStatusColorClassMap =
  Object.freeze({
    active: Object.freeze({
      fill: statusActiveFillClass,
      stroke: statusActiveStrokeClass,
    } satisfies OverlayStatusColorClasses),
    failure: Object.freeze({
      fill: statusFailureFillClass,
      stroke: statusFailureStrokeClass,
    } satisfies OverlayStatusColorClasses),
    neutral: Object.freeze({
      fill: statusNeutralFillClass,
      stroke: statusNeutralStrokeClass,
    } satisfies OverlayStatusColorClasses),
    warning: Object.freeze({
      fill: statusWarningFillClass,
      stroke: statusWarningStrokeClass,
    } satisfies OverlayStatusColorClasses),
  } satisfies OverlayStatusColorClassMap);

export function statusColorClassesForTone(
  tone: OverlayVisualTone,
): OverlayStatusColorClasses {
  return overlayStatusColorClassesByTone[tone];
}
