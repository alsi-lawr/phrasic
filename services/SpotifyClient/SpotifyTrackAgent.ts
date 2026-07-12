import axios from "axios";
import {
  emptyPlaybackWireState,
  failurePlaybackWireState,
  serializePlaybackState,
} from "@/domain/playback-stream";
import type { PlaybackWireState } from "@/domain/playback-stream";
import { providerFailure } from "@/domain/playback";
import type { PlaybackFailure } from "@/domain/playback";
import { parseSpotifyPlaybackPayload } from "@/providers/spotify/playback";
import type { SpotifyTrackAgentConfiguration } from "./SpotifyServiceConfiguration";

export class SpotifyTrackAgent {
  private readonly config: SpotifyTrackAgentConfiguration;

  public constructor(config: SpotifyTrackAgentConfiguration) {
    this.config = config;
  }

  public async pollPlayback(accessToken: string): Promise<PlaybackWireState> {
    return this.fetchPlaybackState(accessToken);
  }

  private async fetchPlaybackState(
    accessToken: string,
  ): Promise<PlaybackWireState> {
    try {
      const response = await axios.get<unknown>(
        this.config.currentlyPlayingAddress,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      );

      if (response.status === 204) {
        return emptyPlaybackWireState();
      }

      const payload: unknown = response.data;
      const playback = parseSpotifyPlaybackPayload(payload);
      if (playback.kind === "failure") {
        return failurePlaybackWireState(providerFailure("malformed-response"));
      }

      return serializePlaybackState(playback.value);
    } catch (error: unknown) {
      return failurePlaybackWireState(playbackFailureFromUnknown(error));
    }
  }
}

function playbackFailureFromUnknown(error: unknown): PlaybackFailure {
  if (!axios.isAxiosError(error)) {
    return providerFailure("network");
  }

  const status = error.response?.status;
  if (status === 429) {
    return providerFailure("rate-limited");
  }

  if (status !== undefined && status >= 500) {
    return providerFailure("server-error");
  }

  return providerFailure("network");
}
