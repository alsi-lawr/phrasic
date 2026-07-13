import type { ProviderLink, Result } from "../../domain/playback.ts";
import type {
  OverlayEpisodeMetadataView,
  OverlayMetadataView,
  OverlayTrackMetadataView,
} from "./overlay-metadata.ts";

export type OverlaySpotifyLinkDestination =
  "album" | "creator" | "episode" | "show" | "track";

type OverlaySpotifyItemVisibleTarget = {
  readonly kind: "item-metadata";
};

type OverlaySpotifyCreatorVisibleTarget = {
  readonly kind: "creator-metadata";
  readonly precedingText: string;
  readonly text: string;
};

type OverlaySpotifyDetailVisibleTarget = {
  readonly kind: "detail-metadata";
};

type OverlaySpotifyShowVisibleTarget = {
  readonly kind: "show-metadata";
};

export type OverlaySpotifyLinkVisibleTarget =
  | OverlaySpotifyCreatorVisibleTarget
  | OverlaySpotifyDetailVisibleTarget
  | OverlaySpotifyItemVisibleTarget
  | OverlaySpotifyShowVisibleTarget;

type OverlaySpotifyAlbumLink = {
  readonly destination: "album";
  readonly label: string;
  readonly providerLink: ProviderLink;
  readonly visibleTarget: OverlaySpotifyDetailVisibleTarget;
};

type OverlaySpotifyCreatorLink = {
  readonly destination: "creator";
  readonly label: string;
  readonly providerLink: ProviderLink;
  readonly visibleTarget: OverlaySpotifyCreatorVisibleTarget;
};

type OverlaySpotifyEpisodeLink = {
  readonly destination: "episode";
  readonly label: string;
  readonly providerLink: ProviderLink;
  readonly visibleTarget: OverlaySpotifyItemVisibleTarget;
};

type OverlaySpotifyShowLink = {
  readonly destination: "show";
  readonly label: string;
  readonly providerLink: ProviderLink;
  readonly visibleTarget: OverlaySpotifyShowVisibleTarget;
};

type OverlaySpotifyTrackLink = {
  readonly destination: "track";
  readonly label: string;
  readonly providerLink: ProviderLink;
  readonly visibleTarget: OverlaySpotifyItemVisibleTarget;
};

export type OverlaySpotifyLink =
  | OverlaySpotifyAlbumLink
  | OverlaySpotifyCreatorLink
  | OverlaySpotifyEpisodeLink
  | OverlaySpotifyShowLink
  | OverlaySpotifyTrackLink;

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
const itemVisibleTarget: OverlaySpotifyItemVisibleTarget = Object.freeze({
  kind: "item-metadata",
});
const detailVisibleTarget: OverlaySpotifyDetailVisibleTarget = Object.freeze({
  kind: "detail-metadata",
});
const showVisibleTarget: OverlaySpotifyShowVisibleTarget = Object.freeze({
  kind: "show-metadata",
});
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

export function spotifyLinkAccessibleName(link: OverlaySpotifyLink): string {
  return `${link.label} (opens in a new tab)`;
}

function spotifyLinksForTrack(
  metadata: OverlayTrackMetadataView,
): OverlaySpotifyLinks {
  const itemLink = spotifyProviderLink(metadata.itemLinks, "track");
  if (itemLink.kind === "failure") {
    return unavailableSpotifyLinks(itemLink.error);
  }

  const creatorLinks = spotifyCreatorLinksFor(metadata);
  if (creatorLinks.kind === "failure") {
    return unavailableSpotifyLinks(creatorLinks.error);
  }

  const albumLink = spotifyProviderLink(metadata.album.links, "album");
  if (albumLink.kind === "failure") {
    return unavailableSpotifyLinks(albumLink.error);
  }

  return availableSpotifyLinks([
    trackSpotifyLink(
      `LISTEN ON SPOTIFY: TRACK — ${metadata.trackTitle.value}`,
      itemLink.value,
    ),
    ...creatorLinks.value,
    albumSpotifyLink(
      `OPEN ALBUM ON SPOTIFY: ${metadata.album.title.value}`,
      albumLink.value,
    ),
  ]);
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
    episodeSpotifyLink(
      `LISTEN ON SPOTIFY: EPISODE — ${metadata.episodeTitle.value}`,
      itemLink.value,
    ),
    showSpotifyLink(
      `OPEN SHOW ON SPOTIFY: ${metadata.show.title.value}`,
      showLink.value,
    ),
  ]);
}

function spotifyCreatorLinksFor(
  metadata: OverlayTrackMetadataView,
): Result<
  ReadonlyArray<OverlaySpotifyCreatorLink>,
  OverlaySpotifyLinkMappingFailure
> {
  const links: OverlaySpotifyCreatorLink[] = [];
  let precedingText = "";

  for (const creator of metadata.artists) {
    const creatorLink = spotifyProviderLink(creator.links, "creator");
    if (creatorLink.kind === "failure") {
      return Object.freeze({ kind: "failure", error: creatorLink.error });
    }

    links.push(
      creatorSpotifyLink(
        `OPEN CREATOR ON SPOTIFY: ${creator.name.value}`,
        creatorLink.value,
        precedingText,
        creator.name.value,
      ),
    );
    precedingText = `${precedingText}${creator.name.value}, `;
  }

  return Object.freeze({ kind: "success", value: Object.freeze(links) });
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

function albumSpotifyLink(
  label: string,
  providerLink: ProviderLink,
): OverlaySpotifyAlbumLink {
  return Object.freeze({
    destination: "album",
    label,
    providerLink,
    visibleTarget: detailVisibleTarget,
  });
}

function creatorSpotifyLink(
  label: string,
  providerLink: ProviderLink,
  precedingText: string,
  text: string,
): OverlaySpotifyCreatorLink {
  const visibleTarget: OverlaySpotifyCreatorVisibleTarget = Object.freeze({
    kind: "creator-metadata",
    precedingText,
    text,
  });

  return Object.freeze({
    destination: "creator",
    label,
    providerLink,
    visibleTarget,
  });
}

function episodeSpotifyLink(
  label: string,
  providerLink: ProviderLink,
): OverlaySpotifyEpisodeLink {
  return Object.freeze({
    destination: "episode",
    label,
    providerLink,
    visibleTarget: itemVisibleTarget,
  });
}

function showSpotifyLink(
  label: string,
  providerLink: ProviderLink,
): OverlaySpotifyShowLink {
  return Object.freeze({
    destination: "show",
    label,
    providerLink,
    visibleTarget: showVisibleTarget,
  });
}

function trackSpotifyLink(
  label: string,
  providerLink: ProviderLink,
): OverlaySpotifyTrackLink {
  return Object.freeze({
    destination: "track",
    label,
    providerLink,
    visibleTarget: itemVisibleTarget,
  });
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
