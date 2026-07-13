import {
  parseSpotifyPlaybackPayload,
  type SpotifyPlaybackParseFailure,
} from "../../browser/providers/spotify-payload.ts";
import type { SpotifyAccessToken } from "../../browser/auth/token.ts";
import type {
  PlaybackProviderRegistry,
  PlaybackProviderRequest,
  PlaybackProviderResult,
} from "../../browser/providers/registry.ts";
import type {
  PlaybackState,
  ProviderId,
  Result,
} from "../../domain/playback.ts";

const payload: unknown = {};
declare const playbackProviderId: ProviderId;
declare const playbackProviders: PlaybackProviderRegistry;
declare const playbackState: PlaybackState;
declare const spotifyAccessToken: SpotifyAccessToken;
const result: Result<PlaybackState, SpotifyPlaybackParseFailure> =
  parseSpotifyPlaybackPayload(payload);
const playbackRequest: PlaybackProviderRequest = Object.freeze({
  accessToken: spotifyAccessToken,
  signal: new AbortController().signal,
});
const providerResult: PlaybackProviderResult = Object.freeze({
  kind: "playback",
  state: playbackState,
});
const providerResolution = playbackProviders.resolve(playbackProviderId);

// @ts-expect-error Provider resolution accepts only validated provider identifiers.
playbackProviders.resolve("spotify");

if (result.kind === "success") {
  const state: PlaybackState = result.value;

  // @ts-expect-error Provider-neutral playback states do not expose Spotify wire fields.
  const spotifyPlaybackType: string = result.value.currently_playing_type;

  void state;
  void spotifyPlaybackType;
}

if (providerResult.kind === "playback") {
  const state: PlaybackState = providerResult.state;

  // @ts-expect-error Provider-neutral results do not expose Spotify wire fields.
  const spotifyPlaybackType: string = providerResult.currently_playing_type;

  void state;
  void spotifyPlaybackType;
}

void playbackRequest;
void providerResolution;
