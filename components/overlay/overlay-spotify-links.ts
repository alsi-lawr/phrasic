import type { ProviderLink, Result } from "../../domain/playback.ts";
import type {
  OverlayEpisodeMetadataView,
  OverlayMetadataView,
  OverlayTrackMetadataView,
} from "./overlay-metadata.ts";

export type OverlaySpotifyLinkDestination =
  "album" | "creator" | "episode" | "show" | "track";

export type OverlaySpotifyLink = {
  readonly destination: OverlaySpotifyLinkDestination;
  readonly label: string;
  readonly providerLink: ProviderLink;
};

export type OverlaySpotifyLinkMappingFailure = {
  readonly destination: OverlaySpotifyLinkDestination;
  readonly kind: "spotify-link-unavailable";
  readonly reason: "missing-spotify-link" | "non-spotify-link";
};

export type OverlaySpotifyLinks =
  | {
      readonly kind: "available";
      readonly links: ReadonlyArray<OverlaySpotifyLink>;
    }
  | {
      readonly kind: "not-applicable";
    }
  | {
      readonly failure: OverlaySpotifyLinkMappingFailure;
      readonly kind: "unavailable";
    };

const spotifyProviderId = "spotify";
const noSpotifyLinks: OverlaySpotifyLinks = Object.freeze({
  kind: "not-applicable",
});

export function spotifyLinksForMetadata(
  metadata: OverlayMetadataView,
): OverlaySpotifyLinks {
  switch (metadata.kind) {
    case "status":
      return noSpotifyLinks;
    case "track":
      return spotifyLinksForTrack(metadata);
    case "episode":
      return spotifyLinksForEpisode(metadata);
  }

  return unreachable(metadata);
}

function spotifyLinksForTrack(
  metadata: OverlayTrackMetadataView,
): OverlaySpotifyLinks {
  const itemLink = spotifyProviderLink(metadata.itemLinks, "track");
  if (itemLink.kind === "failure") {
    return unavailableSpotifyLinks(itemLink.error);
  }

  const links: OverlaySpotifyLink[] = [
    spotifyLink(
      "track",
      `LISTEN ON SPOTIFY: TRACK — ${metadata.trackTitle.value}`,
      itemLink.value,
    ),
  ];
  for (const creator of metadata.artists) {
    const creatorLink = spotifyProviderLink(creator.links, "creator");
    if (creatorLink.kind === "failure") {
      return unavailableSpotifyLinks(creatorLink.error);
    }

    links.push(
      spotifyLink(
        "creator",
        `OPEN CREATOR ON SPOTIFY: ${creator.name.value}`,
        creatorLink.value,
      ),
    );
  }

  const albumLink = spotifyProviderLink(metadata.album.links, "album");
  if (albumLink.kind === "failure") {
    return unavailableSpotifyLinks(albumLink.error);
  }

  links.push(
    spotifyLink(
      "album",
      `OPEN ALBUM ON SPOTIFY: ${metadata.album.title.value}`,
      albumLink.value,
    ),
  );

  return availableSpotifyLinks(links);
}

function spotifyLinksForEpisode(
  metadata: OverlayEpisodeMetadataView,
): OverlaySpotifyLinks {
  const itemLink = spotifyProviderLink(metadata.itemLinks, "episode");
  if (itemLink.kind === "failure") {
    return unavailableSpotifyLinks(itemLink.error);
  }

  const showLink = spotifyProviderLink(metadata.show.links, "show");
  if (showLink.kind === "failure") {
    return unavailableSpotifyLinks(showLink.error);
  }

  return availableSpotifyLinks([
    spotifyLink(
      "episode",
      `LISTEN ON SPOTIFY: EPISODE — ${metadata.episodeTitle.value}`,
      itemLink.value,
    ),
    spotifyLink(
      "show",
      `OPEN SHOW ON SPOTIFY: ${metadata.show.title.value}`,
      showLink.value,
    ),
  ]);
}

function spotifyProviderLink(
  links: ReadonlyArray<ProviderLink>,
  destination: OverlaySpotifyLinkDestination,
): Result<ProviderLink, OverlaySpotifyLinkMappingFailure> {
  const link = links.find(
    (candidate: ProviderLink): boolean =>
      candidate.providerId.value === spotifyProviderId,
  );
  if (link !== undefined) {
    return Object.freeze({ kind: "success", value: link });
  }

  return Object.freeze({
    error: spotifyLinkMappingFailure(
      destination,
      links.length === 0 ? "missing-spotify-link" : "non-spotify-link",
    ),
    kind: "failure",
  });
}

function spotifyLink(
  destination: OverlaySpotifyLinkDestination,
  label: string,
  providerLink: ProviderLink,
): OverlaySpotifyLink {
  return Object.freeze({ destination, label, providerLink });
}

function availableSpotifyLinks(
  links: ReadonlyArray<OverlaySpotifyLink>,
): OverlaySpotifyLinks {
  return Object.freeze({
    kind: "available",
    links: Object.freeze([...links]),
  });
}

function unavailableSpotifyLinks(
  failure: OverlaySpotifyLinkMappingFailure,
): OverlaySpotifyLinks {
  return Object.freeze({ failure, kind: "unavailable" });
}

function spotifyLinkMappingFailure(
  destination: OverlaySpotifyLinkDestination,
  reason: OverlaySpotifyLinkMappingFailure["reason"],
): OverlaySpotifyLinkMappingFailure {
  return Object.freeze({
    destination,
    kind: "spotify-link-unavailable",
    reason,
  });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Spotify link metadata: ${String(value)}`);
}
