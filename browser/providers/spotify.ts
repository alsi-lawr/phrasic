import {
  maximumPlatformTimerDelayMilliseconds,
  ProviderId,
} from "../../domain/playback.ts";
import type {
  BrowserRequestDeadline,
  BrowserRequestDeadlinePort,
} from "../request-deadline.ts";
import type {
  PlaybackProviderPort,
  PlaybackProviderRequest,
  PlaybackProviderResult,
  PlaybackRetryAfter,
} from "./registry.ts";
import { parseSpotifyPlaybackPayload } from "./spotify-payload.ts";

const spotifyCurrentlyPlayingEndpoint =
  "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode";
const retryAfterSecondsPattern = /^(0|[1-9][0-9]*)$/;
const maximumRetryAfterSeconds = Math.floor(
  maximumPlatformTimerDelayMilliseconds / 1_000,
);

export type CreateSpotifyPlaybackProviderOptions = {
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly requestDeadline: BrowserRequestDeadlinePort;
  readonly timeoutMilliseconds: number;
};

export function createSpotifyPlaybackProvider(
  options: CreateSpotifyPlaybackProviderOptions,
): PlaybackProviderPort {
  const provider: PlaybackProviderPort = {
    providerId: createSpotifyProviderId(),
    async fetchCurrentlyPlaying(
      request: PlaybackProviderRequest,
    ): Promise<PlaybackProviderResult> {
      try {
        const deadline = options.requestDeadline.create({
          signal: request.signal,
          timeoutMilliseconds: options.timeoutMilliseconds,
        });
        try {
          const response = await options.fetchImplementation(
            spotifyCurrentlyPlayingEndpoint,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${request.accessToken.toMemoryValue()}`,
              },
              signal: deadline.signal,
            },
          );
          if (!hasActiveRequestDeadline(deadline)) {
            return frozenNetworkFailure();
          }

          switch (response.status) {
            case 200:
              return await parseSuccessfulPlaybackResponse(response, deadline);
            case 204:
              return frozenEmptyPlayback();
            case 401:
              return frozenUnauthorized();
            case 403:
              return frozenPermissionDenied();
            case 429:
              return frozenRateLimited(
                parseRetryAfter(response.headers.get("Retry-After")),
              );
            default:
              if (response.status >= 500 && response.status <= 599) {
                return frozenServerFailure(response.status);
              }

              return frozenUnexpectedResponse(response.status);
          }
        } finally {
          deadline.dispose();
        }
      } catch {
        return frozenNetworkFailure();
      }
    },
  };

  return Object.freeze(provider);
}

async function parseSuccessfulPlaybackResponse(
  response: Response,
  deadline: BrowserRequestDeadline,
): Promise<PlaybackProviderResult> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    if (!hasActiveRequestDeadline(deadline)) {
      return frozenNetworkFailure();
    }

    return frozenMalformedResponse();
  }

  if (!hasActiveRequestDeadline(deadline)) {
    return frozenNetworkFailure();
  }

  const parsed = parseSpotifyPlaybackPayload(payload);
  if (parsed.kind === "failure") {
    return frozenMalformedResponse();
  }

  const result: PlaybackProviderResult = {
    kind: "playback",
    state: parsed.value,
  };

  return Object.freeze(result);
}

function hasActiveRequestDeadline(deadline: BrowserRequestDeadline): boolean {
  return deadline.outcome().kind === "active";
}

function parseRetryAfter(header: string | null): PlaybackRetryAfter {
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

  const retryAfter: PlaybackRetryAfter = {
    kind: "valid",
    delayMilliseconds: seconds * 1_000,
  };

  return Object.freeze(retryAfter);
}

function frozenEmptyPlayback(): PlaybackProviderResult {
  return Object.freeze({ kind: "empty" });
}

function frozenMalformedResponse(): PlaybackProviderResult {
  return Object.freeze({ kind: "malformed-response" });
}

function frozenNetworkFailure(): PlaybackProviderResult {
  return Object.freeze({ kind: "network-failure" });
}

function frozenInvalidOrMissingRetryAfter(): PlaybackRetryAfter {
  return Object.freeze({ kind: "invalid-or-missing" });
}

function frozenPermissionDenied(): PlaybackProviderResult {
  return Object.freeze({ kind: "permission-denied", status: 403 });
}

function frozenRateLimited(
  retryAfter: PlaybackRetryAfter,
): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "rate-limited",
    status: 429,
    retryAfter,
  };

  return Object.freeze(result);
}

function frozenServerFailure(status: number): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "server-failure",
    status,
  };

  return Object.freeze(result);
}

function frozenUnauthorized(): PlaybackProviderResult {
  return Object.freeze({ kind: "unauthorized", status: 401 });
}

function frozenUnexpectedResponse(status: number): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "unexpected-response",
    status,
  };

  return Object.freeze(result);
}

function createSpotifyProviderId(): ProviderId {
  const providerId = ProviderId.create("spotify");
  if (providerId.kind === "success") {
    return providerId.value;
  }

  throw new Error("The static Spotify provider identifier is invalid.");
}
