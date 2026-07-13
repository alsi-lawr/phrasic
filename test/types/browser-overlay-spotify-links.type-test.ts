import type { ComponentProps } from "react";
import type { ProviderLink } from "../../domain/playback.ts";
import { OverlayVisualSpotifyLinks } from "../../components/overlay/OverlayVisualSpotifyLinks.tsx";
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
  visibleTarget: Object.freeze({ kind: "item-metadata" }),
});
const spotifyLinks: OverlaySpotifyLinks = spotifyLinksForMetadata(metadata);
const visualSpotifyLinkProps: ComponentProps<typeof OverlayVisualSpotifyLinks> =
  Object.freeze({ availableWidth: 3_096, links: spotifyLinks });
const invalidSpotifyLink: OverlaySpotifyLink = {
  destination: "track",
  label: "LISTEN ON SPOTIFY: TRACK — Track title",
  // @ts-expect-error Spotify destinations only expose validated ProviderLink values.
  providerLink: "https://open.spotify.com/track/track-1",
  visibleTarget: Object.freeze({ kind: "item-metadata" }),
};
// @ts-expect-error Track links always target the visible artwork and item metadata.
const invalidVisibleTarget: OverlaySpotifyLink = {
  destination: "track",
  label: "LISTEN ON SPOTIFY: TRACK — Track title",
  providerLink,
  visibleTarget: Object.freeze({ kind: "detail-metadata" }),
};
// @ts-expect-error Spotify link destinations remain readonly.
spotifyLink.providerLink = providerLink;
// @ts-expect-error Visible Spotify link props are readonly.
visualSpotifyLinkProps.availableWidth = 0;

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

  const unhandledDestination: never = link;
  return unhandledDestination;
}

void spotifyLink;
void spotifyLinks;
void visualSpotifyLinkProps;
void invalidSpotifyLink;
void invalidVisibleTarget;
void spotifyLinksKind(spotifyLinks);
void spotifyDestination(spotifyLink);
