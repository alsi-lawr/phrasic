import {
  maximumPlatformTimerDelayMilliseconds,
  type PlaybackState,
} from "../../domain/playback.ts";
import { parseSpotifyPlaybackPayload } from "./spotify-payload.ts";
import type { SpotifyAccessToken } from "../auth/token.ts";

const spotifyCurrentlyPlayingEndpoint =
  "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode";
const retryAfterSecondsPattern = /^(0|[1-9][0-9]*)$/;
const maximumRetryAfterSeconds = Math.floor(
  maximumPlatformTimerDelayMilliseconds / 1_000,
);

export type SpotifyRetryAfter =
  | {
      readonly kind: "valid";
      readonly delayMilliseconds: number;
    }
  | {
      readonly kind: "invalid-or-missing";
    };

export type SpotifyCurrentlyPlayingResult =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "malformed-response";
    }
  | {
      readonly kind: "network-failure";
    }
  | {
      readonly kind: "playback";
      readonly state: PlaybackState;
    }
  | {
      readonly kind: "permission-denied";
      readonly status: 403;
    }
  | {
      readonly kind: "rate-limited";
      readonly status: 429;
      readonly retryAfter: SpotifyRetryAfter;
    }
  | {
      readonly kind: "server-failure";
      readonly status: number;
    }
  | {
      readonly kind: "unauthorized";
      readonly status: 401;
    }
  | {
      readonly kind: "unexpected-response";
      readonly status: number;
    };

export type SpotifyCurrentlyPlayingRequest = {
  readonly accessToken: SpotifyAccessToken;
  readonly signal: AbortSignal;
};

export type SpotifyCurrentlyPlayingPort = {
  readonly fetchCurrentlyPlaying: (
    request: SpotifyCurrentlyPlayingRequest,
  ) => Promise<SpotifyCurrentlyPlayingResult>;
};

export function createSpotifyCurrentlyPlayingPort(
  fetchImplementation: typeof globalThis.fetch,
): SpotifyCurrentlyPlayingPort {
  const port: SpotifyCurrentlyPlayingPort = {
    async fetchCurrentlyPlaying(
      request: SpotifyCurrentlyPlayingRequest,
    ): Promise<SpotifyCurrentlyPlayingResult> {
      let response: Response;
      try {
        response = await fetchImplementation(spotifyCurrentlyPlayingEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${request.accessToken.toMemoryValue()}`,
          },
          signal: request.signal,
        });
      } catch {
        return frozenNetworkFailure();
      }

      switch (response.status) {
        case 200:
          return parseSuccessfulPlaybackResponse(response);
        case 204:
          return frozenEmptyPlayback();
        case 401:
          return frozenUnauthorized();
        case 403:
          return frozenPermissionDenied();
        case 429:
          return frozenRateLimited(
            parseSpotifyRetryAfter(response.headers.get("Retry-After")),
          );
        default:
          if (response.status >= 500 && response.status <= 599) {
            return frozenServerFailure(response.status);
          }

          return frozenUnexpectedResponse(response.status);
      }
    },
  };

  return Object.freeze(port);
}

async function parseSuccessfulPlaybackResponse(
  response: Response,
): Promise<SpotifyCurrentlyPlayingResult> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return frozenMalformedResponse();
  }

  const parsed = parseSpotifyPlaybackPayload(payload);
  if (parsed.kind === "failure") {
    return frozenMalformedResponse();
  }

  const result: SpotifyCurrentlyPlayingResult = {
    kind: "playback",
    state: parsed.value,
  };

  return Object.freeze(result);
}

function parseSpotifyRetryAfter(header: string | null): SpotifyRetryAfter {
  if (header === null || !retryAfterSecondsPattern.test(header)) {
    return frozenInvalidOrMissingRetryAfter();
  }

  const seconds = Number(header);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > maximumRetryAfterSeconds
  ) {
    return frozenInvalidOrMissingRetryAfter();
  }

  const retryAfter: SpotifyRetryAfter = {
    kind: "valid",
    delayMilliseconds: seconds * 1_000,
  };

  return Object.freeze(retryAfter);
}

function frozenEmptyPlayback(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "empty" });
}

function frozenMalformedResponse(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "malformed-response" });
}

function frozenNetworkFailure(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "network-failure" });
}

function frozenInvalidOrMissingRetryAfter(): SpotifyRetryAfter {
  return Object.freeze({ kind: "invalid-or-missing" });
}

function frozenPermissionDenied(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "permission-denied", status: 403 });
}

function frozenRateLimited(
  retryAfter: SpotifyRetryAfter,
): SpotifyCurrentlyPlayingResult {
  const result: SpotifyCurrentlyPlayingResult = {
    kind: "rate-limited",
    status: 429,
    retryAfter,
  };

  return Object.freeze(result);
}

function frozenServerFailure(status: number): SpotifyCurrentlyPlayingResult {
  const result: SpotifyCurrentlyPlayingResult = {
    kind: "server-failure",
    status,
  };

  return Object.freeze(result);
}

function frozenUnauthorized(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "unauthorized", status: 401 });
}

function frozenUnexpectedResponse(
  status: number,
): SpotifyCurrentlyPlayingResult {
  const result: SpotifyCurrentlyPlayingResult = {
    kind: "unexpected-response",
    status,
  };

  return Object.freeze(result);
}
