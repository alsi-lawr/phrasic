import { maximumPlatformTimerDelayMilliseconds } from "../../domain/playback-values.ts";
import type {
  BrowserRequestDeadline,
  BrowserRequestDeadlinePort,
} from "../request-deadline.ts";
import type {
  PlaybackProviderPort,
  PlaybackProviderRequest,
  PlaybackProviderResult,
  PlaybackRetryAfter,
} from "./provider.ts";
import { spotifyProviderId } from "./provider-identifiers.ts";
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
    providerId: spotifyProviderId,
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
            return networkFailure();
          }

          switch (response.status) {
            case 200:
              return await parseSuccessfulPlaybackResponse(response, deadline);
            case 204:
              return emptyPlayback();
            case 401:
              return unauthorized();
            case 403:
              return permissionDenied();
            case 429:
              return rateLimited(
                parseRetryAfter(response.headers.get("Retry-After")),
              );
            default:
              if (response.status >= 500 && response.status <= 599) {
                return serverFailure(response.status);
              }

              return unexpectedResponse(response.status);
          }
        } finally {
          deadline.dispose();
        }
      } catch {
        return networkFailure();
      }
    },
  };

  return provider;
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
      return networkFailure();
    }

    return malformedResponse();
  }

  if (!hasActiveRequestDeadline(deadline)) {
    return networkFailure();
  }

  const parsed = parseSpotifyPlaybackPayload(payload);
  if (parsed.kind === "failure") {
    return malformedResponse();
  }

  const result: PlaybackProviderResult = {
    kind: "playback",
    state: parsed.value,
  };

  return result;
}

function hasActiveRequestDeadline(deadline: BrowserRequestDeadline): boolean {
  return deadline.outcome().kind === "active";
}

function parseRetryAfter(header: string | null): PlaybackRetryAfter {
  if (header === null || !retryAfterSecondsPattern.test(header)) {
    return invalidOrMissingRetryAfter();
  }

  const seconds = Number(header);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 0 ||
    seconds > maximumRetryAfterSeconds
  ) {
    return invalidOrMissingRetryAfter();
  }

  const retryAfter: PlaybackRetryAfter = {
    kind: "valid",
    delayMilliseconds: seconds * 1_000,
  };

  return retryAfter;
}

function emptyPlayback(): PlaybackProviderResult {
  return { kind: "empty" };
}

function malformedResponse(): PlaybackProviderResult {
  return { kind: "malformed-response" };
}

function networkFailure(): PlaybackProviderResult {
  return { kind: "network-failure" };
}

function invalidOrMissingRetryAfter(): PlaybackRetryAfter {
  return { kind: "invalid-or-missing" };
}

function permissionDenied(): PlaybackProviderResult {
  return { kind: "permission-denied", status: 403 };
}

function rateLimited(retryAfter: PlaybackRetryAfter): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "rate-limited",
    status: 429,
    retryAfter,
  };

  return result;
}

function serverFailure(status: number): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "server-failure",
    status,
  };

  return result;
}

function unauthorized(): PlaybackProviderResult {
  return { kind: "unauthorized", status: 401 };
}

function unexpectedResponse(status: number): PlaybackProviderResult {
  const result: PlaybackProviderResult = {
    kind: "unexpected-response",
    status,
  };

  return result;
}
