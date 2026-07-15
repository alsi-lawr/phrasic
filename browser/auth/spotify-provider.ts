import {
  buildQueryStrippedDisplayReturnUrl,
  parseDisplayReturnConfiguration,
  type BrowserPkceCryptoPort,
  type DisplayReturnConfiguration,
} from "./pkce.ts";
import type {
  AuthorizationConnectionResult,
  AuthorizationProviderPort,
  AuthorizationReturnTarget,
  AuthorizationSessionPort,
  BeginAuthorizationResult,
  ConsumeAuthorizationCallbackResult,
} from "./provider.ts";
import {
  beginSpotifyAuthorization,
  consumeSpotifyAuthorizationCallback,
  createBrowserAuthClockPort,
  logoutSpotifyAuthorization,
  refreshSpotifyConnection,
  type RefreshSpotifyConnectionResult,
} from "./session.ts";
import type {
  SpotifyAuthStoragePort,
  SpotifyPendingAuthorizationAttemptConsumeOptions,
  SpotifyPendingAuthorizationAttemptConsumeResult,
  SpotifyRefreshTokenReadResult,
} from "./storage.ts";
import type { SpotifyAuthFetchPort, SpotifyRefreshToken } from "./token.ts";
import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "../config.ts";

export type CreateSpotifyAuthorizationProviderOptions = {
  readonly crypto: BrowserPkceCryptoPort;
  readonly fetch: SpotifyAuthFetchPort;
  readonly storage: SpotifyAuthStoragePort;
};

export function createSpotifyAuthorizationProvider(
  options: CreateSpotifyAuthorizationProviderOptions,
): AuthorizationProviderPort {
  const provider: AuthorizationProviderPort = {
    initialize(initialization) {
      const configuration = parseSpotifyPublicConfiguration(
        initialization.configuration,
        { applicationUrl: initialization.applicationUrl },
      );
      if (configuration.kind === "failure") {
        return {
          kind: "failure",
          error: {
            kind: "invalid-provider-configuration",
          },
        };
      }

      return {
        kind: "success",
        value: spotifyAuthorizationSession(configuration.value, options),
      };
    },
  };

  return provider;
}

function spotifyAuthorizationSession(
  configuration: SpotifyPublicConfiguration,
  ports: CreateSpotifyAuthorizationProviderOptions,
): AuthorizationSessionPort {
  const session: AuthorizationSessionPort = {
    async beginAuthorization(options): Promise<BeginAuthorizationResult> {
      const returnTo = validatedReturnTarget(options.returnTo);
      if (returnTo.kind === "failure") {
        return { kind: "provider-failure" };
      }

      const redirect = await beginSpotifyAuthorization({
        configuration,
        crypto: ports.crypto,
        clock: createBrowserAuthClockPort(
          (): number => options.nowEpochMilliseconds,
        ),
        storage: cancellationAwareStorage(ports.storage, options.signal),
        returnTo: returnTo.value,
      });

      return {
        kind: "authorization-redirect",
        url: redirect.url,
      };
    },

    cancelPendingWork(): void {},

    async consumeCallback(
      options,
    ): Promise<ConsumeAuthorizationCallbackResult> {
      const result = await consumeSpotifyAuthorizationCallback({
        configuration,
        callbackUrl: options.callbackUrl,
        clock: createBrowserAuthClockPort(
          (): number => options.nowEpochMilliseconds,
        ),
        fetch: ports.fetch,
        signal: options.signal,
        storage: cancellationAwareStorage(ports.storage, options.signal),
      });

      switch (result.kind) {
        case "connected":
          return {
            kind: "connected",
            credential: result.accessToken,
            lifetime: result.expiresIn,
            returnUrl: returnUrl(configuration, result.returnTo),
          };
        case "authorization-denied":
          return {
            kind: "authorization-denied",
            returnUrl: returnUrl(configuration, result.returnTo),
          };
        case "malformed-callback":
          return { kind: "malformed-callback" };
        case "authorization-required":
          return "returnTo" in result
            ? {
                kind: "authorization-required",
                returnUrl: {
                  kind: "available",
                  value: returnUrl(configuration, result.returnTo),
                },
              }
            : {
                kind: "authorization-required",
                returnUrl: { kind: "unavailable" },
              };
        case "transient-failure":
          return {
            kind: "transient-failure",
            returnUrl: returnUrl(configuration, result.returnTo),
          };
        case "provider-failure":
          return {
            kind: "provider-failure",
            returnUrl: returnUrl(configuration, result.returnTo),
          };
      }

      return unreachable(result);
    },

    logout(): Promise<void> {
      return logoutSpotifyAuthorization(ports.storage).then((): void => {});
    },

    recoverConnection(options): Promise<AuthorizationConnectionResult> {
      return refreshConnection(configuration, ports, options.signal);
    },

    refreshCredential(options): Promise<AuthorizationConnectionResult> {
      return refreshConnection(configuration, ports, options.signal);
    },
  };

  return session;
}

async function refreshConnection(
  configuration: SpotifyPublicConfiguration,
  ports: CreateSpotifyAuthorizationProviderOptions,
  signal: AbortSignal,
): Promise<AuthorizationConnectionResult> {
  const result = await refreshSpotifyConnection({
    configuration,
    fetch: ports.fetch,
    signal,
    storage: cancellationAwareStorage(ports.storage, signal),
  });

  return mapRefreshResult(result);
}

function mapRefreshResult(
  result: RefreshSpotifyConnectionResult,
): AuthorizationConnectionResult {
  switch (result.kind) {
    case "success":
      return {
        kind: "success",
        credential: result.accessToken,
        lifetime: result.expiresIn,
      };
    case "authorization-required":
      return {
        kind: "authorization-required",
        reason: result.reason,
      };
    case "transient-failure":
      return { kind: "transient-failure" };
    case "provider-failure":
      return { kind: "provider-failure" };
  }

  return unreachable(result);
}

function validatedReturnTarget(
  target: AuthorizationReturnTarget,
): ReturnType<typeof parseDisplayReturnConfiguration> {
  return parseDisplayReturnConfiguration(target);
}

function returnUrl(
  configuration: SpotifyPublicConfiguration,
  returnTo: DisplayReturnConfiguration,
): string {
  return buildQueryStrippedDisplayReturnUrl({ configuration, returnTo });
}

function cancellationAwareStorage(
  storage: SpotifyAuthStoragePort,
  signal: AbortSignal,
): SpotifyAuthStoragePort {
  const guarded: SpotifyAuthStoragePort = {
    async savePendingAuthorizationAttempt(attempt): Promise<void> {
      if (!signal.aborted) {
        await storage.savePendingAuthorizationAttempt(attempt);
      }
    },

    async consumePendingAuthorizationAttempt(
      options: SpotifyPendingAuthorizationAttemptConsumeOptions,
    ): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
      if (signal.aborted) {
        return rejectedPendingAuthorizationAttempt();
      }

      const result = await storage.consumePendingAuthorizationAttempt(options);
      return signal.aborted ? rejectedPendingAuthorizationAttempt() : result;
    },

    async readSpotifyRefreshToken(): Promise<SpotifyRefreshTokenReadResult> {
      if (signal.aborted) {
        return missingRefreshToken();
      }

      const result = await storage.readSpotifyRefreshToken();
      return signal.aborted ? missingRefreshToken() : result;
    },

    async saveSpotifyRefreshToken(
      refreshToken: SpotifyRefreshToken,
    ): Promise<void> {
      if (!signal.aborted) {
        await storage.saveSpotifyRefreshToken(refreshToken);
      }
    },

    async deleteSpotifyRefreshToken(): Promise<void> {
      if (!signal.aborted) {
        await storage.deleteSpotifyRefreshToken();
      }
    },

    async clearSpotifyAuthorization(): Promise<void> {
      if (!signal.aborted) {
        await storage.clearSpotifyAuthorization();
      }
    },
  };

  return guarded;
}

function rejectedPendingAuthorizationAttempt(): SpotifyPendingAuthorizationAttemptConsumeResult {
  return { kind: "rejected", reason: "missing-attempt" };
}

function missingRefreshToken(): SpotifyRefreshTokenReadResult {
  return { kind: "missing" };
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Spotify authorization result: ${String(value)}`);
}
