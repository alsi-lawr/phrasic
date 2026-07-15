import { failed, succeeded, type Result } from "./result.ts";
import type {
  DisplayText,
  OriginalArtworkUrl,
  PlaybackDurationMilliseconds,
  PlaybackPositionMilliseconds,
  ProviderCollectionId,
  ProviderId,
  ProviderItemId,
  ValueValidationError,
} from "./playback-values.ts";
import { validateHttpUrl } from "./playback-values.ts";

export type ArtworkUnavailableReason =
  "provider-artwork-is-invalid" | "provider-did-not-supply-artwork";

export type ItemConstructionError = {
  readonly kind: "invalid-item";
  readonly item: "episode" | "track";
  readonly reason:
    | "missing-creators"
    | "missing-provider-links"
    | "provider-link-provider-mismatch";
};

export type PlaybackSnapshotError = {
  readonly kind: "invalid-playback-snapshot";
  readonly reason: "position-exceeds-duration";
};

export type ProviderLinkInput = {
  readonly providerId: ProviderId;
  readonly href: unknown;
};

export type ProviderLink = {
  readonly providerId: ProviderId;
  readonly href: string;
};

export function createProviderLink(
  input: ProviderLinkInput,
): Result<ProviderLink, ValueValidationError> {
  const result = validateHttpUrl("provider-link", input.href);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded({ providerId: input.providerId, href: result.value });
}

export type OriginalArtwork =
  | {
      readonly kind: "available";
      readonly url: OriginalArtworkUrl;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: ArtworkUnavailableReason;
    };

export function availableOriginalArtwork(
  url: OriginalArtworkUrl,
): OriginalArtwork {
  const artwork: OriginalArtwork = {
    kind: "available",
    url,
  };
  return artwork;
}

export function unavailableOriginalArtwork(
  reason: ArtworkUnavailableReason,
): OriginalArtwork {
  const artwork: OriginalArtwork = {
    kind: "unavailable",
    reason,
  };
  return artwork;
}

export type Creator = {
  readonly name: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type Collection = {
  readonly id: ProviderCollectionId;
  readonly title: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type Show = {
  readonly id: ProviderCollectionId;
  readonly title: DisplayText;
  readonly publisher: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type TrackItemInput = {
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly artists: ReadonlyArray<Creator>;
  readonly collection: Collection;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type TrackItem = {
  readonly kind: "track";
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly artists: ReadonlyArray<Creator>;
  readonly collection: Collection;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export function createTrackItem(
  input: TrackItemInput,
): Result<TrackItem, ItemConstructionError> {
  if (input.artists.length === 0) {
    return failed(invalidItem("track", "missing-creators"));
  }

  const linksError = providerLinksError(input.providerId, input.links, "track");
  if (linksError.kind === "failure") {
    return linksError;
  }

  return succeeded({ kind: "track", ...input });
}

export type EpisodeItemInput = {
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly show: Show;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type EpisodeItem = {
  readonly kind: "episode";
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly show: Show;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export function createEpisodeItem(
  input: EpisodeItemInput,
): Result<EpisodeItem, ItemConstructionError> {
  const linksError = providerLinksError(
    input.providerId,
    input.links,
    "episode",
  );
  if (linksError.kind === "failure") {
    return linksError;
  }

  return succeeded({ kind: "episode", ...input });
}

export type NowPlayingItem = EpisodeItem | TrackItem;

export type PlaybackSnapshotInput = {
  readonly item: NowPlayingItem;
  readonly position: PlaybackPositionMilliseconds;
  readonly duration: PlaybackDurationMilliseconds;
};

export type PlaybackSnapshot = {
  readonly item: NowPlayingItem;
  readonly position: PlaybackPositionMilliseconds;
  readonly duration: PlaybackDurationMilliseconds;
};

export function createPlaybackSnapshot(
  input: PlaybackSnapshotInput,
): Result<PlaybackSnapshot, PlaybackSnapshotError> {
  if (input.position > input.duration) {
    return failed({
      kind: "invalid-playback-snapshot",
      reason: "position-exceeds-duration",
    });
  }

  return succeeded({ ...input });
}

function providerLinksError(
  providerId: ProviderId,
  links: ReadonlyArray<ProviderLink>,
  item: ItemConstructionError["item"],
): Result<ReadonlyArray<ProviderLink>, ItemConstructionError> {
  if (links.length === 0) {
    return failed(invalidItem(item, "missing-provider-links"));
  }

  const allLinksMatchProvider = links.every(
    (link: ProviderLink): boolean => link.providerId === providerId,
  );
  if (!allLinksMatchProvider) {
    return failed(invalidItem(item, "provider-link-provider-mismatch"));
  }

  return succeeded(links);
}

function invalidItem(
  item: ItemConstructionError["item"],
  reason: ItemConstructionError["reason"],
): ItemConstructionError {
  const error: ItemConstructionError = {
    kind: "invalid-item",
    item,
    reason,
  };
  return error;
}
