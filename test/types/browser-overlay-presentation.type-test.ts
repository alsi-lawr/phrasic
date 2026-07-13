import {
  fallbackVinylClasses,
  overlayMetadataTextClasses,
  type OverlayMetadataTextClass,
} from "../../components/overlay/overlay-presentation.ts";

const metadataTextClass: OverlayMetadataTextClass =
  overlayMetadataTextClasses.title;
const vinylDiscClass = fallbackVinylClasses.disc;

// @ts-expect-error Metadata variants must remain complete static Tailwind class strings.
const invalidMetadataTextClass: OverlayMetadataTextClass = "fill-overlay-title";
// @ts-expect-error Metadata class variants are readonly.
overlayMetadataTextClasses.title = metadataTextClass;
// @ts-expect-error Vinyl classes are readonly presentation contracts.
fallbackVinylClasses.disc = vinylDiscClass;

void metadataTextClass;
void vinylDiscClass;
void invalidMetadataTextClass;
