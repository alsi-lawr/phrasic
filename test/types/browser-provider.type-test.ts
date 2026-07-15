import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { type SpotifyPlaybackParseFailure } from "../../browser/providers/spotify-payload-contract.ts";
import type { SpotifyAccessToken } from "../../browser/auth/spotify-token-values.ts";
import type {
  PlaybackProviderRequest,
  PlaybackProviderResult,
} from "../../browser/providers/provider.ts";
import type { PlaybackState } from "../../domain/playback.ts";
import type { Result } from "../../domain/result.ts";

const payload: unknown = {};
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
