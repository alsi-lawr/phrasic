import {
  emptyOverlayTextWidths,
  overlayShellWidthForTextWidths,
  type OverlayTextMeasurement,
} from "../../components/overlay/overlay-layout.ts";

const titleMeasurement: OverlayTextMeasurement = Object.freeze({
  identity: "spotify:track-1",
  line: "title",
  width: 1_200,
});

const invalidMeasurement: OverlayTextMeasurement = {
  identity: "spotify:track-1",
  // @ts-expect-error Overlay measurements only accept declared visual lines.
  line: "album",
  width: 1_200,
};
// @ts-expect-error Text-width measurements remain readonly.
titleMeasurement.width = 0;
// @ts-expect-error Measured title widths remain readonly.
emptyOverlayTextWidths.title = 0;

void invalidMeasurement;
void overlayShellWidthForTextWidths(emptyOverlayTextWidths);
void titleMeasurement;
