import {
  AccessToken,
  PlaybackPollDelayMilliseconds,
  type Result,
} from "../../domain/playback.ts";
import { SpotifyTrackAgent } from "../../services/SpotifyClient/SpotifyTrackAgent.ts";
import type { SpotifyTrackAgentConfiguration } from "../../services/SpotifyClient/SpotifyServiceConfiguration.ts";

const configuration: SpotifyTrackAgentConfiguration = Object.freeze({
  currentlyPlayingAddress:
    "https://api.spotify.com/v1/me/player/currently-playing",
  playbackPollDelay: expectSuccess(PlaybackPollDelayMilliseconds.create(5_000)),
  artworkSize: "large",
});
const agent = new SpotifyTrackAgent(configuration);
const accessToken = expectSuccess(AccessToken.create("access-token"));
const trustedTokenPoll = agent.pollPlayback(accessToken);

void trustedTokenPoll;

type AssertFalse<Value extends false> = Value;

const plainStringAccessTokensAreRejected: AssertFalse<
  string extends Parameters<SpotifyTrackAgent["pollPlayback"]>[0] ? true : false
> = false;

void plainStringAccessTokensAreRejected;

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}
