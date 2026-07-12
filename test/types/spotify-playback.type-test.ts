import {
  parseSpotifyPlaybackPayload,
  type SpotifyPlaybackParseFailure,
} from "../../providers/spotify/playback.ts";
import type { PlaybackState, Result } from "../../domain/playback.ts";

const payload: unknown = {};
const result: Result<PlaybackState, SpotifyPlaybackParseFailure> =
  parseSpotifyPlaybackPayload(payload);

if (result.kind === "success") {
  const state: PlaybackState = result.value;

  // @ts-expect-error Provider-neutral playback states do not expose Spotify wire fields.
  const spotifyPlaybackType: string = result.value.currently_playing_type;

  void state;
  void spotifyPlaybackType;
}
