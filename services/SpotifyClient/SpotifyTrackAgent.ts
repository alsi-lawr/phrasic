import axios from "axios";
import {
  authorizationRequiredPlaybackWireState,
  emptyPlaybackWireState,
  failurePlaybackWireState,
  serializePlaybackState,
  type PlaybackWireState,
} from "../../domain/playback-stream.ts";
import { providerFailure, type AccessToken } from "../../domain/playback.ts";
import { parseSpotifyPlaybackPayload } from "../../providers/spotify/playback.ts";
import type { SpotifyTrackAgentConfiguration } from "./SpotifyServiceConfiguration.ts";

export type SpotifyCurrentlyPlayingResponse = {
  readonly status: number;
  readonly data: unknown;
};

export type SpotifyCurrentlyPlayingTransport = {
  readonly fetchCurrentlyPlaying: (
    currentlyPlayingAddress: string,
    accessToken: AccessToken,
  ) => Promise<SpotifyCurrentlyPlayingResponse>;
};

const defaultSpotifyCurrentlyPlayingTransport: SpotifyCurrentlyPlayingTransport =
  Object.freeze({
    fetchCurrentlyPlaying: async (
      currentlyPlayingAddress: string,
      accessToken: AccessToken,
    ): Promise<SpotifyCurrentlyPlayingResponse> => {
      const response = await axios.get<unknown>(currentlyPlayingAddress, {
        headers: {
          "Content-Type": "application/json",
          Authorization: bearerAuthorization(accessToken),
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Expires: "0",
        },
        validateStatus: (): boolean => true,
      });
      const currentlyPlayingResponse: SpotifyCurrentlyPlayingResponse = {
        status: response.status,
        data: response.data,
      };

      return Object.freeze(currentlyPlayingResponse);
    },
  });

export class SpotifyTrackAgent {
  private readonly config: SpotifyTrackAgentConfiguration;
  private readonly transport: SpotifyCurrentlyPlayingTransport;

  public constructor(
    config: SpotifyTrackAgentConfiguration,
    transport: SpotifyCurrentlyPlayingTransport = defaultSpotifyCurrentlyPlayingTransport,
  ) {
    this.config = config;
    this.transport = transport;
  }

  public async pollPlayback(
    accessToken: AccessToken,
  ): Promise<PlaybackWireState> {
    try {
      const response = await this.transport.fetchCurrentlyPlaying(
        this.config.currentlyPlayingAddress,
        accessToken,
      );

      return playbackWireStateFromResponse(response, this.config);
    } catch (error: unknown) {
      return playbackWireStateFromTransportError(error);
    }
  }
}

function bearerAuthorization(accessToken: AccessToken): string {
  return `Bearer ${accessToken.value}`;
}

function playbackWireStateFromResponse(
  response: SpotifyCurrentlyPlayingResponse,
  configuration: SpotifyTrackAgentConfiguration,
): PlaybackWireState {
  if (response.status === 204) {
    return emptyPlaybackWireState();
  }

  if (response.status < 200 || response.status >= 300) {
    return playbackWireStateFromProviderStatus(response.status);
  }

  const playback = parseSpotifyPlaybackPayload(
    response.data,
    configuration.artworkSize,
  );
  if (playback.kind === "failure") {
    return failurePlaybackWireState(providerFailure("malformed-response"));
  }

  return serializePlaybackState(playback.value);
}

function playbackWireStateFromTransportError(
  error: unknown,
): PlaybackWireState {
  if (axios.isAxiosError(error) && typeof error.response?.status === "number") {
    return playbackWireStateFromProviderStatus(error.response.status);
  }

  return failurePlaybackWireState(providerFailure("network"));
}

function playbackWireStateFromProviderStatus(
  status: number,
): PlaybackWireState {
  if (status === 401) {
    return authorizationRequiredPlaybackWireState("not-authorized");
  }

  if (status === 403) {
    return authorizationRequiredPlaybackWireState("permission-required");
  }

  if (status === 429) {
    return failurePlaybackWireState(providerFailure("rate-limited"));
  }

  if (status >= 500) {
    return failurePlaybackWireState(providerFailure("server-error"));
  }

  return failurePlaybackWireState(providerFailure("network"));
}
