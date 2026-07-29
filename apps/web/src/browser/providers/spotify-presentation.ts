import { OverlaySpotifyAttribution } from "../../components/overlay/OverlaySpotifyAttribution.tsx";
import type { OverlayPresentation } from "../../components/overlay/overlay-presentation.ts";

export const spotifyOverlayPresentation: OverlayPresentation = {
  attribution: OverlaySpotifyAttribution,
  displayName: "Spotify",
  headingId: "spotify-now-playing-heading",
  providerId: "spotify",
};
