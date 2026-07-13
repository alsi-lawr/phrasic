const overlayMetadataContextTextClass =
  "font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context";
const overlayMetadataCreatorTextClass =
  "font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase";
const overlayMetadataDetailTextClass =
  "font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail";
const overlayMetadataStatusTextClass =
  "font-overlay-display fill-overlay-status text-overlay-status-size font-semibold tracking-overlay-normal";
const overlayMetadataTitleTextClass =
  "font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal";

type OverlayMetadataContextTextClass = typeof overlayMetadataContextTextClass;
type OverlayMetadataCreatorTextClass = typeof overlayMetadataCreatorTextClass;
type OverlayMetadataDetailTextClass = typeof overlayMetadataDetailTextClass;
type OverlayMetadataStatusTextClass = typeof overlayMetadataStatusTextClass;
type OverlayMetadataTitleTextClass = typeof overlayMetadataTitleTextClass;

export type OverlayMetadataTextClass =
  | OverlayMetadataContextTextClass
  | OverlayMetadataCreatorTextClass
  | OverlayMetadataDetailTextClass
  | OverlayMetadataStatusTextClass
  | OverlayMetadataTitleTextClass;

type OverlayMetadataTextClasses = {
  readonly context: OverlayMetadataContextTextClass;
  readonly creator: OverlayMetadataCreatorTextClass;
  readonly detail: OverlayMetadataDetailTextClass;
  readonly status: OverlayMetadataStatusTextClass;
  readonly title: OverlayMetadataTitleTextClass;
};

export const overlayMetadataTextClasses: OverlayMetadataTextClasses =
  Object.freeze({
    context: overlayMetadataContextTextClass,
    creator: overlayMetadataCreatorTextClass,
    detail: overlayMetadataDetailTextClass,
    status: overlayMetadataStatusTextClass,
    title: overlayMetadataTitleTextClass,
  } satisfies OverlayMetadataTextClasses);

export const overlayShellClass = "fill-overlay-shell opacity-90";

type FallbackVinylClasses = {
  readonly disc: "fill-overlay-vinyl-disc";
  readonly groove: "fill-none stroke-overlay-vinyl-groove stroke-8";
  readonly hub: "fill-overlay-vinyl-hub";
  readonly label: "fill-overlay-vinyl-label";
  readonly rim: "fill-none stroke-overlay-vinyl-rim stroke-8";
};

export const fallbackVinylClasses: FallbackVinylClasses = Object.freeze({
  disc: "fill-overlay-vinyl-disc",
  groove: "fill-none stroke-overlay-vinyl-groove stroke-8",
  hub: "fill-overlay-vinyl-hub",
  label: "fill-overlay-vinyl-label",
  rim: "fill-none stroke-overlay-vinyl-rim stroke-8",
} satisfies FallbackVinylClasses);
