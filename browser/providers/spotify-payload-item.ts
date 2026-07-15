import {
  createEpisodeItem,
  createProviderLink,
  createTrackItem,
  type Collection,
  type Creator,
  type EpisodeItem,
  type ProviderLink,
  type Show,
  type TrackItem,
} from "../../domain/playback-item.ts";
import {
  parseDisplayText,
  parseProviderCollectionId,
  parseProviderItemId,
  type ProviderId,
} from "../../domain/playback-values.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import { parseArtwork } from "./spotify-payload-artwork.ts";
import type {
  SpotifyArtworkSize,
  SpotifyPlaybackParseFailure,
  SpotifyPlaybackPayloadPath,
} from "./spotify-payload-contract.ts";
import {
  mapItemConstruction,
  mapValueValidation,
  parseFailure,
  parseArray,
  parseObject,
  readRequired,
  type UnknownJsonObject,
} from "./spotify-payload-validation.ts";

export function parseTrackItem(
  item: UnknownJsonObject,
  providerId: ProviderId,
  artworkSize: SpotifyArtworkSize,
): Result<TrackItem, SpotifyPlaybackParseFailure> {
  const itemIdValue = readRequired(item, "id", "$.item.id");
  if (itemIdValue.kind === "failure") {
    return itemIdValue;
  }

  const itemId = mapValueValidation(
    parseProviderItemId(itemIdValue.value),
    "$.item.id",
  );
  if (itemId.kind === "failure") {
    return itemId;
  }

  const titleValue = readRequired(item, "name", "$.item.name");
  if (titleValue.kind === "failure") {
    return titleValue;
  }

  const title = mapValueValidation(
    parseDisplayText(titleValue.value),
    "$.item.name",
  );
  if (title.kind === "failure") {
    return title;
  }

  const artistsValue = readRequired(item, "artists", "$.item.artists");
  if (artistsValue.kind === "failure") {
    return artistsValue;
  }

  const artists = parseCreators(artistsValue.value, providerId);
  if (artists.kind === "failure") {
    return artists;
  }

  const albumValue = readRequired(item, "album", "$.item.album");
  if (albumValue.kind === "failure") {
    return albumValue;
  }

  const album = parseObject(albumValue.value, "$.item.album");
  if (album.kind === "failure") {
    return album;
  }

  const collection = parseCollection(album.value, providerId);
  if (collection.kind === "failure") {
    return collection;
  }

  const artwork = parseArtwork(album.value, "$.item.album.images", artworkSize);
  if (artwork.kind === "failure") {
    return artwork;
  }

  const link = parseSpotifyLink(
    item,
    "$.item.external_urls",
    "$.item.external_urls.spotify",
    providerId,
  );
  if (link.kind === "failure") {
    return link;
  }

  return mapItemConstruction(
    createTrackItem({
      providerId,
      itemId: itemId.value,
      title: title.value,
      artists: artists.value,
      collection: collection.value,
      artwork: artwork.value,
      links: [link.value],
    }),
    "$.item",
  );
}

export function parseEpisodeItem(
  item: UnknownJsonObject,
  providerId: ProviderId,
  artworkSize: SpotifyArtworkSize,
): Result<EpisodeItem, SpotifyPlaybackParseFailure> {
  const itemIdValue = readRequired(item, "id", "$.item.id");
  if (itemIdValue.kind === "failure") {
    return itemIdValue;
  }

  const itemId = mapValueValidation(
    parseProviderItemId(itemIdValue.value),
    "$.item.id",
  );
  if (itemId.kind === "failure") {
    return itemId;
  }

  const titleValue = readRequired(item, "name", "$.item.name");
  if (titleValue.kind === "failure") {
    return titleValue;
  }

  const title = mapValueValidation(
    parseDisplayText(titleValue.value),
    "$.item.name",
  );
  if (title.kind === "failure") {
    return title;
  }

  const showValue = readRequired(item, "show", "$.item.show");
  if (showValue.kind === "failure") {
    return showValue;
  }

  const show = parseShow(showValue.value, providerId);
  if (show.kind === "failure") {
    return show;
  }

  const artwork = parseArtwork(item, "$.item.images", artworkSize);
  if (artwork.kind === "failure") {
    return artwork;
  }

  const link = parseSpotifyLink(
    item,
    "$.item.external_urls",
    "$.item.external_urls.spotify",
    providerId,
  );
  if (link.kind === "failure") {
    return link;
  }

  return mapItemConstruction(
    createEpisodeItem({
      providerId,
      itemId: itemId.value,
      title: title.value,
      show: show.value,
      artwork: artwork.value,
      links: [link.value],
    }),
    "$.item",
  );
}

function parseCreators(
  input: unknown,
  providerId: ProviderId,
): Result<ReadonlyArray<Creator>, SpotifyPlaybackParseFailure> {
  const values = parseArray(input, "$.item.artists");
  if (values.kind === "failure") {
    return values;
  }

  if (values.value.length === 0) {
    return failed(parseFailure("$.item.artists", "invalid-domain-value"));
  }

  const creators: Creator[] = [];
  for (const value of values.value) {
    const creator = parseObject(value, "$.item.artists[]");
    if (creator.kind === "failure") {
      return creator;
    }

    const nameValue = readRequired(
      creator.value,
      "name",
      "$.item.artists[].name",
    );
    if (nameValue.kind === "failure") {
      return nameValue;
    }

    const name = mapValueValidation(
      parseDisplayText(nameValue.value),
      "$.item.artists[].name",
    );
    if (name.kind === "failure") {
      return name;
    }

    const link = parseSpotifyLink(
      creator.value,
      "$.item.artists[].external_urls",
      "$.item.artists[].external_urls.spotify",
      providerId,
    );
    if (link.kind === "failure") {
      return link;
    }

    creators.push({
      name: name.value,
      links: [link.value],
    } satisfies Creator);
  }

  return succeeded(creators);
}

function parseCollection(
  input: UnknownJsonObject,
  providerId: ProviderId,
): Result<Collection, SpotifyPlaybackParseFailure> {
  const collectionIdValue = readRequired(input, "id", "$.item.album.id");
  if (collectionIdValue.kind === "failure") {
    return collectionIdValue;
  }

  const collectionId = mapValueValidation(
    parseProviderCollectionId(collectionIdValue.value),
    "$.item.album.id",
  );
  if (collectionId.kind === "failure") {
    return collectionId;
  }

  const titleValue = readRequired(input, "name", "$.item.album.name");
  if (titleValue.kind === "failure") {
    return titleValue;
  }

  const title = mapValueValidation(
    parseDisplayText(titleValue.value),
    "$.item.album.name",
  );
  if (title.kind === "failure") {
    return title;
  }

  const link = parseSpotifyLink(
    input,
    "$.item.album.external_urls",
    "$.item.album.external_urls.spotify",
    providerId,
  );
  if (link.kind === "failure") {
    return link;
  }

  return succeeded({
    id: collectionId.value,
    title: title.value,
    links: [link.value],
  } satisfies Collection);
}

function parseShow(
  input: unknown,
  providerId: ProviderId,
): Result<Show, SpotifyPlaybackParseFailure> {
  const show = parseObject(input, "$.item.show");
  if (show.kind === "failure") {
    return show;
  }

  const showIdValue = readRequired(show.value, "id", "$.item.show.id");
  if (showIdValue.kind === "failure") {
    return showIdValue;
  }

  const showId = mapValueValidation(
    parseProviderCollectionId(showIdValue.value),
    "$.item.show.id",
  );
  if (showId.kind === "failure") {
    return showId;
  }

  const titleValue = readRequired(show.value, "name", "$.item.show.name");
  if (titleValue.kind === "failure") {
    return titleValue;
  }

  const title = mapValueValidation(
    parseDisplayText(titleValue.value),
    "$.item.show.name",
  );
  if (title.kind === "failure") {
    return title;
  }

  const publisherValue = readRequired(
    show.value,
    "publisher",
    "$.item.show.publisher",
  );
  if (publisherValue.kind === "failure") {
    return publisherValue;
  }

  const publisher = mapValueValidation(
    parseDisplayText(publisherValue.value),
    "$.item.show.publisher",
  );
  if (publisher.kind === "failure") {
    return publisher;
  }

  const link = parseSpotifyLink(
    show.value,
    "$.item.show.external_urls",
    "$.item.show.external_urls.spotify",
    providerId,
  );
  if (link.kind === "failure") {
    return link;
  }

  return succeeded({
    id: showId.value,
    title: title.value,
    publisher: publisher.value,
    links: [link.value],
  } satisfies Show);
}

function parseSpotifyLink(
  source: UnknownJsonObject,
  externalUrlsPath: SpotifyPlaybackPayloadPath,
  spotifyUrlPath: SpotifyPlaybackPayloadPath,
  providerId: ProviderId,
): Result<ProviderLink, SpotifyPlaybackParseFailure> {
  const externalUrlsValue = readRequired(
    source,
    "external_urls",
    externalUrlsPath,
  );
  if (externalUrlsValue.kind === "failure") {
    return externalUrlsValue;
  }

  const externalUrls = parseObject(externalUrlsValue.value, externalUrlsPath);
  if (externalUrls.kind === "failure") {
    return externalUrls;
  }

  const spotifyUrlValue = readRequired(
    externalUrls.value,
    "spotify",
    spotifyUrlPath,
  );
  if (spotifyUrlValue.kind === "failure") {
    return spotifyUrlValue;
  }

  return mapValueValidation(
    createProviderLink({
      providerId,
      href: spotifyUrlValue.value,
    }),
    spotifyUrlPath,
  );
}
