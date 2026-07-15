import type {
  BrowserRequestDeadline,
  BrowserRequestDeadlinePort,
} from "../request-deadline.ts";

export type SpotifyAuthFetchRequest = {
  readonly url: URL;
  readonly method: "POST";
  readonly contentType: "application/x-www-form-urlencoded";
  readonly body: string;
  readonly signal: AbortSignal;
};

export type SpotifyAuthJsonReadResult =
  | {
      readonly kind: "json";
      readonly value: unknown;
    }
  | {
      readonly kind: "invalid-json";
    }
  | {
      readonly kind: "network-failure";
    };

export type SpotifyAuthFetchResponse = {
  readonly status: number;
  readonly readJson: () => Promise<SpotifyAuthJsonReadResult>;
};

export type SpotifyAuthFetchResult =
  | {
      readonly kind: "response";
      readonly response: SpotifyAuthFetchResponse;
    }
  | {
      readonly kind: "network-failure";
    };

export type SpotifyAuthFetchPort = {
  readonly fetch: (
    request: SpotifyAuthFetchRequest,
  ) => Promise<SpotifyAuthFetchResult>;
};

export type CreateSpotifyAuthFetchPortOptions = {
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly requestDeadline: BrowserRequestDeadlinePort;
  readonly timeoutMilliseconds: number;
};

export function createSpotifyAuthFetchPort(
  options: CreateSpotifyAuthFetchPortOptions,
): SpotifyAuthFetchPort {
  const port: SpotifyAuthFetchPort = {
    async fetch(
      request: SpotifyAuthFetchRequest,
    ): Promise<SpotifyAuthFetchResult> {
      try {
        const deadline = options.requestDeadline.create({
          signal: request.signal,
          timeoutMilliseconds: options.timeoutMilliseconds,
        });
        try {
          const response = await options.fetchImplementation(request.url, {
            method: request.method,
            headers: {
              "Content-Type": request.contentType,
            },
            body: request.body,
            signal: deadline.signal,
          });
          if (!hasActiveRequestDeadline(deadline)) {
            deadline.dispose();
            return networkFailure();
          }

          const parsedResponse: SpotifyAuthFetchResponse = {
            status: response.status,
            async readJson(): Promise<SpotifyAuthJsonReadResult> {
              try {
                const value: unknown = await response.json();
                if (!hasActiveRequestDeadline(deadline)) {
                  return jsonNetworkFailure();
                }

                return json(value);
              } catch {
                if (!hasActiveRequestDeadline(deadline)) {
                  return jsonNetworkFailure();
                }

                return invalidJson();
              } finally {
                deadline.dispose();
              }
            },
          };

          return fetchResponse(parsedResponse);
        } catch {
          deadline.dispose();
          return networkFailure();
        }
      } catch {
        return networkFailure();
      }
    },
  };

  return port;
}

function json(value: unknown): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "json",
    value,
  };

  return result;
}

function invalidJson(): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "invalid-json",
  };

  return result;
}

function jsonNetworkFailure(): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "network-failure",
  };

  return result;
}

function hasActiveRequestDeadline(deadline: BrowserRequestDeadline): boolean {
  return deadline.outcome().kind === "active";
}

function fetchResponse(
  response: SpotifyAuthFetchResponse,
): SpotifyAuthFetchResult {
  const result: SpotifyAuthFetchResult = {
    kind: "response",
    response,
  };

  return result;
}

function networkFailure(): SpotifyAuthFetchResult {
  const result: SpotifyAuthFetchResult = {
    kind: "network-failure",
  };

  return result;
}
