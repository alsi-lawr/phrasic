import {
  createPlaybackSnapshot,
  type NowPlayingItem,
  type PlaybackSnapshot,
  type PlaybackSnapshotError,
} from "../../domain/playback-item.ts";
import {
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  type PlaybackDurationMilliseconds,
  type PlaybackPositionMilliseconds,
} from "../../domain/playback-values.ts";
import type { PlaybackState } from "../../domain/playback.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import { spotifyProviderId } from "./provider-identifiers.ts";
import type {
  SpotifyArtworkSize,
  SpotifyPlaybackParseFailure,
} from "./spotify-payload-contract.ts";
import { parseEpisodeItem, parseTrackItem } from "./spotify-payload-item.ts";
import {
  mapValueValidation,
  parseBoolean,
  parseFailure,
  parseNonEmptyString,
  parseObject,
  readRequired,
  type UnknownJsonObject,
} from "./spotify-payload-validation.ts";

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

  const itemResult = parseTrackItem(item.value, spotifyProviderId, artworkSize);
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

  const itemResult = parseEpisodeItem(
    item.value,
    spotifyProviderId,
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
  const snapshot = createPlaybackSnapshot({
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

function snapshotFailure(
  error: PlaybackSnapshotError,
): SpotifyPlaybackParseFailure {
  switch (error.reason) {
    case "position-exceeds-duration":
      return parseFailure("$.progress_ms", "position-exceeds-duration");
  }

  return assertNever(error.reason);
}

function emptyPlaybackState(): PlaybackState {
  const state = {
    kind: "empty",
  } satisfies PlaybackState;
  return state;
}

function playingPlaybackState(snapshot: PlaybackSnapshot): PlaybackState {
  const state = {
    kind: "playing",
    snapshot,
  } satisfies PlaybackState;
  return state;
}

function pausedPlaybackState(snapshot: PlaybackSnapshot): PlaybackState {
  const state = {
    kind: "paused",
    snapshot,
  } satisfies PlaybackState;
  return state;
}

function unsupportedPlaybackState(
  reason: "advertisement" | "local-item" | "unknown-item-type",
): PlaybackState {
  const state = {
    kind: "unsupported",
    reason,
  } satisfies PlaybackState;
  return state;
}

function assertNever(value: never): never {
  throw new Error(
    `Unexpected Spotify playback parser variant: ${String(value)}`,
  );
}
