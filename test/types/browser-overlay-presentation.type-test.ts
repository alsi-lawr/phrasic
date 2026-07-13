import {
  overlayMetadataTextClasses,
  statusColorClassesForTone,
  type OverlayMetadataTextClass,
  type OverlayStatusColorClasses,
} from "../../components/overlay/overlay-presentation.ts";
import type { OverlayVisualTone } from "../../components/overlay/overlay-state.ts";

declare const tone: OverlayVisualTone;

const metadataTextClass: OverlayMetadataTextClass =
  overlayMetadataTextClasses.title;
const statusColorClasses: OverlayStatusColorClasses =
  statusColorClassesForTone(tone);

// @ts-expect-error Metadata variants must remain complete static Tailwind class strings.
const invalidMetadataTextClass: OverlayMetadataTextClass =
  "fill-overlay-content-title";
const invalidStatusColorClasses: OverlayStatusColorClasses = {
  // @ts-expect-error Status fill variants must use an approved complete class.
  fill: "fill-overlay-status-pending",
  stroke: "stroke-overlay-status-active",
};
// @ts-expect-error Metadata class variants are readonly.
overlayMetadataTextClasses.title = metadataTextClass;
// @ts-expect-error Status color class variants are readonly.
statusColorClasses.fill = "fill-overlay-status-active";
// @ts-expect-error Status colors only accept declared overlay tones.
statusColorClassesForTone("pending");

void metadataTextClass;
void statusColorClasses;
void invalidMetadataTextClass;
void invalidStatusColorClasses;
