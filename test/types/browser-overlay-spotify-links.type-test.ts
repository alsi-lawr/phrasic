import type { ProviderLink } from "../../domain/playback.ts";
import type { OverlayMetadataView } from "../../components/overlay/overlay-metadata.ts";
import {
  spotifyLinksForMetadata,
  type OverlaySpotifyLink,
  type OverlaySpotifyLinks,
} from "../../components/overlay/overlay-spotify-links.ts";

declare const metadata: OverlayMetadataView;
declare const providerLink: ProviderLink;

const spotifyLink: OverlaySpotifyLink = Object.freeze({
  destination: "track",
  label: "LISTEN ON SPOTIFY: TRACK — Track title",
  providerLink,
});
const spotifyLinks: OverlaySpotifyLinks = spotifyLinksForMetadata(metadata);
const invalidSpotifyLink: OverlaySpotifyLink = {
  destination: "track",
  label: "LISTEN ON SPOTIFY: TRACK — Track title",
  // @ts-expect-error Spotify destinations only expose validated ProviderLink values.
  providerLink: "https://open.spotify.com/track/track-1",
};
// @ts-expect-error Spotify link destinations remain readonly.
spotifyLink.providerLink = providerLink;

function spotifyLinksKind(
  links: OverlaySpotifyLinks,
): OverlaySpotifyLinks["kind"] {
  switch (links.kind) {
    case "available":
    case "not-applicable":
    case "unavailable":
      return links.kind;
  }

  const unhandledLinks: never = links;
  return unhandledLinks;
}

function spotifyDestination(
  link: OverlaySpotifyLink,
): OverlaySpotifyLink["destination"] {
  switch (link.destination) {
    case "album":
    case "creator":
    case "episode":
    case "show":
    case "track":
      return link.destination;
  }

  const unhandledDestination: never = link.destination;
  return unhandledDestination;
}

void spotifyLink;
void spotifyLinks;
void invalidSpotifyLink;
void spotifyLinksKind(spotifyLinks);
void spotifyDestination(spotifyLink);
