import { OverlayFakeMusicAttribution } from "../../components/overlay/OverlayFakeMusicAttribution.tsx";
import type { OverlayPresentation } from "../../components/overlay/overlay-presentation.ts";

export const fakeMusicOverlayPresentation: OverlayPresentation = Object.freeze({
  attribution: OverlayFakeMusicAttribution,
  displayName: "Fake Music",
  headingId: "fake-music-now-playing-heading",
  providerId: "fake",
});
