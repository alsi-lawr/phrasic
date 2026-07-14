import {
  availableOriginalArtwork,
  Collection,
  Creator,
  EpisodeItem,
  PlaybackSnapshot,
  ProviderLink,
  Show,
  TrackItem,
  unavailableOriginalArtwork,
  parseDisplayText,
  parseOriginalArtworkUrl,
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  parseProviderCollectionId,
  parseProviderId,
  parseProviderItemId,
  type ArtworkUnavailableReason,
  type ItemConstructionError,
  type NowPlayingItem,
  type OriginalArtwork,
  type OriginalArtworkUrl,
  type PlaybackDurationMilliseconds,
  type PlaybackPositionMilliseconds,
  type PlaybackSnapshotError,
  type PlaybackState,
  type ProviderId,
  type Result,
  type ValueValidationError,
} from "../../domain/playback.ts";

export type SpotifyArtworkSize = "large" | "medium" | "small";

type UnknownJsonObject = {
  readonly [key: string]: unknown;
};

export type SpotifyPlaybackPayloadPath =
  | "$"
  | "$.currently_playing_type"
  | "$.is_playing"
  | "$.item"
  | "$.progress_ms"
  | "$.item.id"
  | "$.item.is_local"
  | "$.item.name"
  | "$.item.duration_ms"
  | "$.item.external_urls"
  | "$.item.external_urls.spotify"
  | "$.item.artists"
  | "$.item.artists[]"
  | "$.item.artists[].name"
  | "$.item.artists[].external_urls"
  | "$.item.artists[].external_urls.spotify"
  | "$.item.album"
  | "$.item.album.id"
  | "$.item.album.name"
  | "$.item.album.external_urls"
  | "$.item.album.external_urls.spotify"
  | "$.item.album.images"
  | "$.item.show"
  | "$.item.show.id"
  | "$.item.show.name"
  | "$.item.show.publisher"
  | "$.item.show.external_urls"
  | "$.item.show.external_urls.spotify"
  | "$.item.images";

export type SpotifyPlaybackParseFailureCode =
  | "expected-array"
  | "expected-boolean"
  | "expected-http-url"
  | "expected-non-empty-string"
  | "expected-non-negative-integer"
  | "expected-positive-integer"
  | "expected-object"
  | "expected-string"
  | "invalid-domain-value"
  | "missing-value"
  | "position-exceeds-duration";

export type SpotifyPlaybackParseFailure = {
  readonly kind: "invalid-spotify-playback-payload";
  readonly path: SpotifyPlaybackPayloadPath;
  readonly code: SpotifyPlaybackParseFailureCode;
};

export function parseSpotifyPlaybackPayload(
  input: unknown,
  artworkSize: SpotifyArtworkSize = "large",
): Result<PlaybackState, SpotifyPlaybackParseFailure> {
  const payload = parseObject(input, "$");
  if (payload.kind === "failure") {
    return payload;
  }

  const playbackTypeValue = readRequired(
    payload.value,
    "currently_playing_type",
    "$.currently_playing_type",
  );
  if (playbackTypeValue.kind === "failure") {
    return playbackTypeValue;
  }

  const playbackType = parseNonEmptyString(
    playbackTypeValue.value,
    "$.currently_playing_type",
  );
  if (playbackType.kind === "failure") {
    return playbackType;
  }

  const isPlayingValue = readRequired(
    payload.value,
    "is_playing",
    "$.is_playing",
  );
  if (isPlayingValue.kind === "failure") {
    return isPlayingValue;
  }

  const isPlaying = parseBoolean(isPlayingValue.value, "$.is_playing");
  if (isPlaying.kind === "failure") {
    return isPlaying;
  }

  const item = readRequired(payload.value, "item", "$.item");
  if (item.kind === "failure") {
    return item;
  }

  if (playbackType.value === "ad") {
    return succeeded(unsupportedPlaybackState("advertisement"));
  }

  if (playbackType.value !== "track" && playbackType.value !== "episode") {
    return succeeded(unsupportedPlaybackState("unknown-item-type"));
  }

  if (playbackType.value === "track") {
    return parseTrackPlayback(
      item.value,
      isPlaying.value,
      payload.value,
      artworkSize,
    );
  }

  return parseEpisodePlayback(
    item.value,
    isPlaying.value,
    payload.value,
    artworkSize,
  );
}

function parseTrackPlayback(
  itemValue: unknown,
  isPlaying: boolean,
  payload: UnknownJsonObject,
  artworkSize: SpotifyArtworkSize,
): Result<PlaybackState, SpotifyPlaybackParseFailure> {
  if (itemValue === null) {
    return succeeded(emptyPlaybackState());
  }

  const item = parseObject(itemValue, "$.item");
  if (item.kind === "failure") {
    return item;
  }

  const localValue = readRequired(item.value, "is_local", "$.item.is_local");
  if (localValue.kind === "failure") {
    return localValue;
  }

  const isLocal = parseBoolean(localValue.value, "$.item.is_local");
  if (isLocal.kind === "failure") {
    return isLocal;
  }

  if (isLocal.value) {
    return succeeded(unsupportedPlaybackState("local-item"));
  }

  const providerId = parseSpotifyProviderId();
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemResult = parseTrackItem(item.value, providerId.value, artworkSize);
  if (itemResult.kind === "failure") {
    return itemResult;
  }

  const positionResult = parsePlaybackPosition(payload);
  if (positionResult.kind === "failure") {
    return positionResult;
  }

  const durationResult = parsePlaybackDuration(item.value);
  if (durationResult.kind === "failure") {
    return durationResult;
  }

  return parseActivePlaybackState(
    itemResult.value,
    positionResult.value,
    durationResult.value,
    isPlaying,
  );
}

function parseEpisodePlayback(
  itemValue: unknown,
  isPlaying: boolean,
  payload: UnknownJsonObject,
  artworkSize: SpotifyArtworkSize,
): Result<PlaybackState, SpotifyPlaybackParseFailure> {
  if (itemValue === null) {
    return succeeded(emptyPlaybackState());
  }

  const item = parseObject(itemValue, "$.item");
  if (item.kind === "failure") {
    return item;
  }

  const providerId = parseSpotifyProviderId();
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemResult = parseEpisodeItem(
    item.value,
    providerId.value,
    artworkSize,
  );
  if (itemResult.kind === "failure") {
    return itemResult;
  }

  const positionResult = parsePlaybackPosition(payload);
  if (positionResult.kind === "failure") {
    return positionResult;
  }

  const durationResult = parsePlaybackDuration(item.value);
  if (durationResult.kind === "failure") {
    return durationResult;
  }

  return parseActivePlaybackState(
    itemResult.value,
    positionResult.value,
    durationResult.value,
    isPlaying,
  );
}

function parseTrackItem(
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
    TrackItem.create({
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

function parseEpisodeItem(
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
    EpisodeItem.create({
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

    creators.push(
      Creator.create({
        name: name.value,
        links: [link.value],
      }),
    );
  }

  return succeeded(Object.freeze(creators));
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

  return succeeded(
    Collection.create({
      id: collectionId.value,
      title: title.value,
      links: [link.value],
    }),
  );
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

  return succeeded(
    Show.create({
      id: showId.value,
      title: title.value,
      publisher: publisher.value,
      links: [link.value],
    }),
  );
}

function parseArtwork(
  source: UnknownJsonObject,
  imagesPath: SpotifyPlaybackPayloadPath,
  artworkSize: SpotifyArtworkSize,
): Result<OriginalArtwork, SpotifyPlaybackParseFailure> {
  const imagesValue = readRequired(source, "images", imagesPath);
  if (imagesValue.kind === "failure") {
    return imagesValue;
  }

  const images = parseArray(imagesValue.value, imagesPath);
  if (images.kind === "failure") {
    return images;
  }

  if (images.value.length === 0) {
    return succeeded(
      unavailableOriginalArtwork("provider-did-not-supply-artwork"),
    );
  }

  const preferredImagePosition = artworkPosition(artworkSize);
  let firstValidArtworkUrl: OriginalArtworkUrl | undefined;
  let preferredArtworkUrl: OriginalArtworkUrl | undefined;
  let validImagePosition = 0;

  for (const image of images.value) {
    const artworkUrl = parseArtworkUrl(image);
    if (artworkUrl.kind === "success") {
      if (firstValidArtworkUrl === undefined) {
        firstValidArtworkUrl = artworkUrl.value;
      }

      if (validImagePosition === preferredImagePosition) {
        preferredArtworkUrl = artworkUrl.value;
      }

      validImagePosition += 1;
    }
  }

  if (firstValidArtworkUrl === undefined) {
    return succeeded(unavailableOriginalArtwork("provider-artwork-is-invalid"));
  }

  // Spotify orders images from large to small. If the requested ordinal is absent,
  // retain the first valid provider URL as the deterministic original-artwork fallback.
  return succeeded(
    availableOriginalArtwork(preferredArtworkUrl ?? firstValidArtworkUrl),
  );
}

function artworkPosition(artworkSize: SpotifyArtworkSize): 0 | 1 | 2 {
  switch (artworkSize) {
    case "large":
      return 0;
    case "medium":
      return 1;
    case "small":
      return 2;
  }

  return assertNever(artworkSize);
}

function parseArtworkUrl(
  input: unknown,
): Result<OriginalArtworkUrl, ArtworkUnavailableReason> {
  if (!isUnknownJsonObject(input) || !Object.hasOwn(input, "url")) {
    return failed("provider-artwork-is-invalid");
  }

  const artworkUrl = parseOriginalArtworkUrl(input["url"]);
  if (artworkUrl.kind === "failure") {
    return failed("provider-artwork-is-invalid");
  }

  return succeeded(artworkUrl.value);
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
    ProviderLink.create({
      providerId,
      href: spotifyUrlValue.value,
    }),
    spotifyUrlPath,
  );
}

function parsePlaybackPosition(
  payload: UnknownJsonObject,
): Result<PlaybackPositionMilliseconds, SpotifyPlaybackParseFailure> {
  const positionValue = readRequired(payload, "progress_ms", "$.progress_ms");
  if (positionValue.kind === "failure") {
    return positionValue;
  }

  return mapValueValidation(
    parsePlaybackPositionMilliseconds(positionValue.value),
    "$.progress_ms",
  );
}

function parsePlaybackDuration(
  item: UnknownJsonObject,
): Result<PlaybackDurationMilliseconds, SpotifyPlaybackParseFailure> {
  const durationValue = readRequired(item, "duration_ms", "$.item.duration_ms");
  if (durationValue.kind === "failure") {
    return durationValue;
  }

  return mapValueValidation(
    parsePlaybackDurationMilliseconds(durationValue.value),
    "$.item.duration_ms",
  );
}

function parseActivePlaybackState(
  item: NowPlayingItem,
  position: PlaybackPositionMilliseconds,
  duration: PlaybackDurationMilliseconds,
  isPlaying: boolean,
): Result<PlaybackState, SpotifyPlaybackParseFailure> {
  const snapshot = PlaybackSnapshot.create({
    item,
    position,
    duration,
  });
  if (snapshot.kind === "failure") {
    return failed(snapshotFailure(snapshot.error));
  }

  if (isPlaying) {
    return succeeded(playingPlaybackState(snapshot.value));
  }

  return succeeded(pausedPlaybackState(snapshot.value));
}

function parseSpotifyProviderId(): Result<
  ProviderId,
  SpotifyPlaybackParseFailure
> {
  return mapValueValidation(parseProviderId("spotify"), "$");
}

function parseObject(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<UnknownJsonObject, SpotifyPlaybackParseFailure> {
  if (!isUnknownJsonObject(input)) {
    return failed(parseFailure(path, "expected-object"));
  }

  return succeeded(input);
}

function parseArray(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<ReadonlyArray<unknown>, SpotifyPlaybackParseFailure> {
  if (!isUnknownArray(input)) {
    return failed(parseFailure(path, "expected-array"));
  }

  return succeeded(input);
}

function parseBoolean(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<boolean, SpotifyPlaybackParseFailure> {
  if (typeof input !== "boolean") {
    return failed(parseFailure(path, "expected-boolean"));
  }

  return succeeded(input);
}

function parseNonEmptyString(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<string, SpotifyPlaybackParseFailure> {
  if (typeof input !== "string") {
    return failed(parseFailure(path, "expected-string"));
  }

  if (input.trim().length === 0) {
    return failed(parseFailure(path, "expected-non-empty-string"));
  }

  return succeeded(input);
}

function readRequired(
  source: UnknownJsonObject,
  key: string,
  path: SpotifyPlaybackPayloadPath,
): Result<unknown, SpotifyPlaybackParseFailure> {
  if (!Object.hasOwn(source, key)) {
    return failed(parseFailure(path, "missing-value"));
  }

  return succeeded(source[key]);
}

function mapValueValidation<Value>(
  result: Result<Value, ValueValidationError>,
  path: SpotifyPlaybackPayloadPath,
): Result<Value, SpotifyPlaybackParseFailure> {
  if (result.kind === "failure") {
    return failed(parseFailure(path, validationFailureCode(result.error)));
  }

  return succeeded(result.value);
}

function mapItemConstruction<Value>(
  result: Result<Value, ItemConstructionError>,
  path: SpotifyPlaybackPayloadPath,
): Result<Value, SpotifyPlaybackParseFailure> {
  if (result.kind === "failure") {
    return failed(parseFailure(path, "invalid-domain-value"));
  }

  return succeeded(result.value);
}

function snapshotFailure(
  error: PlaybackSnapshotError,
): SpotifyPlaybackParseFailure {
  switch (error.reason) {
    case "position-exceeds-duration":
      return parseFailure("$.progress_ms", "position-exceeds-duration");
  }

  return assertNever(error.reason);
}

function validationFailureCode(
  error: ValueValidationError,
): SpotifyPlaybackParseFailureCode {
  switch (error.reason) {
    case "empty-string":
      return "expected-non-empty-string";
    case "expected-non-negative-integer":
      return "expected-non-negative-integer";
    case "expected-string":
      return "expected-string";
    case "invalid-url":
      return "expected-http-url";
  }

  return assertNever(error.reason);
}

function emptyPlaybackState(): PlaybackState {
  const state = {
    kind: "empty",
  } satisfies PlaybackState;
  return Object.freeze(state);
}

function playingPlaybackState(snapshot: PlaybackSnapshot): PlaybackState {
  const state = {
    kind: "playing",
    snapshot,
  } satisfies PlaybackState;
  return Object.freeze(state);
}

function pausedPlaybackState(snapshot: PlaybackSnapshot): PlaybackState {
  const state = {
    kind: "paused",
    snapshot,
  } satisfies PlaybackState;
  return Object.freeze(state);
}

function unsupportedPlaybackState(
  reason: "advertisement" | "local-item" | "unknown-item-type",
): PlaybackState {
  const state = {
    kind: "unsupported",
    reason,
  } satisfies PlaybackState;
  return Object.freeze(state);
}

function parseFailure(
  path: SpotifyPlaybackPayloadPath,
  code: SpotifyPlaybackParseFailureCode,
): SpotifyPlaybackParseFailure {
  const failure: SpotifyPlaybackParseFailure = {
    kind: "invalid-spotify-playback-payload",
    path,
    code,
  };
  return Object.freeze(failure);
}

function isUnknownJsonObject(input: unknown): input is UnknownJsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isUnknownArray(input: unknown): input is ReadonlyArray<unknown> {
  return Array.isArray(input);
}

function succeeded<Value>(value: Value): {
  readonly kind: "success";
  readonly value: Value;
} {
  return Object.freeze({
    kind: "success",
    value,
  });
}

function failed<Failure>(error: Failure): {
  readonly kind: "failure";
  readonly error: Failure;
} {
  return Object.freeze({
    kind: "failure",
    error,
  });
}

function assertNever(value: never): never {
  throw new Error(
    `Unexpected Spotify playback parser variant: ${String(value)}`,
  );
}
