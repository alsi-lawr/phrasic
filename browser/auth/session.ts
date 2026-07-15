import type { SpotifyPublicConfiguration } from "../config.ts";
import {
  AuthorizationAttemptTimestamp,
  type BrowserPkceCryptoPort,
  type DisplayReturnConfiguration,
} from "./pkce-values.ts";
import {
  buildSpotifyAuthorizationUrl,
  createPkceAuthorizationAttempt,
  parseSpotifyAuthorizationCallback,
  type SpotifyAuthorizationCallback,
} from "./pkce.ts";
import {
  type SpotifyAuthStoragePort,
  type SpotifyPendingAuthorizationAttemptConsumeResult,
} from "./spotify-auth-storage-contract.ts";
import {
  exchangeSpotifyAuthorizationCode,
  refreshSpotifyAccessToken,
  type SpotifyTokenRequestFailure,
} from "./token.ts";
import {
  type SpotifyAccessToken,
  type SpotifyAccessTokenLifetimeSeconds,
} from "./spotify-token-values.ts";
import { type SpotifyAuthFetchPort } from "./spotify-auth-fetch.ts";

export type BrowserAuthClockPort = {
  readonly now: () => AuthorizationAttemptTimestamp;
};

export type BeginSpotifyAuthorizationOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly crypto: BrowserPkceCryptoPort;
  readonly clock: BrowserAuthClockPort;
  readonly storage: SpotifyAuthStoragePort;
  readonly returnTo: DisplayReturnConfiguration;
};

export type SpotifyAuthorizationRedirect = {
  readonly kind: "authorization-redirect";
  readonly url: string;
};

export type ConsumeSpotifyAuthorizationCallbackOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly callbackUrl: URL;
  readonly clock: BrowserAuthClockPort;
  readonly fetch: SpotifyAuthFetchPort;
  readonly signal: AbortSignal;
  readonly storage: SpotifyAuthStoragePort;
};

export type ConsumeSpotifyAuthorizationCallbackResult =
  | {
      readonly kind: "connected";
      readonly accessToken: SpotifyAccessToken;
      readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
      readonly returnTo: DisplayReturnConfiguration;
    }
  | {
      readonly kind: "authorization-denied";
      readonly returnTo: DisplayReturnConfiguration;
    }
  | {
      readonly kind: "malformed-callback";
      readonly code: Extract<
        SpotifyAuthorizationCallback,
        { readonly kind: "malformed" }
      >["code"];
    }
  | {
      readonly kind: "authorization-required";
      readonly reason:
        "expired-pending-authorization" | "invalid-pending-authorization";
    }
  | {
      readonly kind: "authorization-required";
      readonly reason: "invalid-credentials";
      readonly returnTo: DisplayReturnConfiguration;
    }
  | {
      readonly kind: "transient-failure";
      readonly returnTo: DisplayReturnConfiguration;
    }
  | {
      readonly kind: "provider-failure";
      readonly code: "invalid-token-response" | "token-request-rejected";
      readonly returnTo: DisplayReturnConfiguration;
    };

export type RefreshSpotifyConnectionOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly fetch: SpotifyAuthFetchPort;
  readonly signal: AbortSignal;
  readonly storage: SpotifyAuthStoragePort;
};

export type RefreshSpotifyConnectionResult =
  | {
      readonly kind: "success";
      readonly accessToken: SpotifyAccessToken;
      readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
    }
  | {
      readonly kind: "authorization-required";
      readonly reason: "invalid-credentials" | "missing-connection";
    }
  | {
      readonly kind: "transient-failure";
    }
  | {
      readonly kind: "provider-failure";
      readonly code: "invalid-token-response" | "token-request-rejected";
    };

export type SpotifyAuthorizationLogoutResult = {
  readonly kind: "logged-out";
};

export function createBrowserAuthClockPort(
  readEpochMilliseconds: () => number,
): BrowserAuthClockPort {
  const clock: BrowserAuthClockPort = {
    now(): AuthorizationAttemptTimestamp {
      const timestamp = AuthorizationAttemptTimestamp.parse(
        readEpochMilliseconds(),
      );
      if (timestamp.kind === "failure") {
        throw new Error(
          "Browser authentication clock returned an invalid time.",
        );
      }

      return timestamp.value;
    },
  };

  return clock;
}

export async function beginSpotifyAuthorization(
  options: BeginSpotifyAuthorizationOptions,
): Promise<SpotifyAuthorizationRedirect> {
  const attempt = await createPkceAuthorizationAttempt({
    crypto: options.crypto,
    createdAt: options.clock.now(),
    returnTo: options.returnTo,
  });
  await options.storage.savePendingAuthorizationAttempt(attempt.pending);
  const redirect: SpotifyAuthorizationRedirect = {
    kind: "authorization-redirect",
    url: buildSpotifyAuthorizationUrl({
      configuration: options.configuration,
      attempt,
    }),
  };

  return redirect;
}

export async function consumeSpotifyAuthorizationCallback(
  options: ConsumeSpotifyAuthorizationCallbackOptions,
): Promise<ConsumeSpotifyAuthorizationCallbackResult> {
  const callback = parseSpotifyAuthorizationCallback({
    configuration: options.configuration,
    callbackUrl: options.callbackUrl,
  });

  switch (callback.kind) {
    case "malformed":
      return malformedCallback(callback.code);
    case "denied":
      return consumeDeniedSpotifyAuthorizationCallback(callback, options);
    case "success":
      return consumeSuccessfulSpotifyAuthorizationCallback(callback, options);
  }

  const unhandledCallback: never = callback;
  throw new Error(
    `Unhandled Spotify authorization callback: ${unhandledCallback}`,
  );
}

export async function refreshSpotifyConnection(
  options: RefreshSpotifyConnectionOptions,
): Promise<RefreshSpotifyConnectionResult> {
  const storedRefreshToken = await options.storage.readSpotifyRefreshToken();
  if (storedRefreshToken.kind === "missing") {
    return missingConnectionAuthorizationRequired();
  }

  const refreshed = await refreshSpotifyAccessToken({
    configuration: options.configuration,
    refreshToken: storedRefreshToken.refreshToken,
    fetch: options.fetch,
    signal: options.signal,
  });
  switch (refreshed.kind) {
    case "success": {
      if (refreshed.refreshToken.kind === "refresh-token-rotated") {
        await options.storage.saveSpotifyRefreshToken(
          refreshed.refreshToken.refreshToken,
        );
      }

      return refreshSuccess(refreshed.accessToken, refreshed.expiresIn);
    }
    case "authorization-required":
      await options.storage.deleteSpotifyRefreshToken();
      return invalidCredentialsAuthorizationRequired();
    case "transient-failure":
      return refreshTransientFailure();
    case "provider-failure":
      return refreshProviderFailure(refreshed.code);
  }

  const unhandledRefresh: never = refreshed;
  throw new Error(`Unhandled Spotify refresh result: ${unhandledRefresh}`);
}

export async function logoutSpotifyAuthorization(
  storage: SpotifyAuthStoragePort,
): Promise<SpotifyAuthorizationLogoutResult> {
  await storage.clearSpotifyAuthorization();
  const result: SpotifyAuthorizationLogoutResult = {
    kind: "logged-out",
  };

  return result;
}

async function consumeDeniedSpotifyAuthorizationCallback(
  callback: Extract<SpotifyAuthorizationCallback, { readonly kind: "denied" }>,
  options: ConsumeSpotifyAuthorizationCallbackOptions,
): Promise<ConsumeSpotifyAuthorizationCallbackResult> {
  if (callback.state.kind !== "state-candidate") {
    return invalidPendingAuthorizationRequired("invalid-pending-authorization");
  }

  const consumed = await options.storage.consumePendingAuthorizationAttempt({
    state: callback.state.value,
    observedAt: options.clock.now(),
  });
  if (consumed.kind === "rejected") {
    return authorizationRequiredForPendingRejection(consumed);
  }

  return authorizationDenied(consumed.attempt.returnTo);
}

async function consumeSuccessfulSpotifyAuthorizationCallback(
  callback: Extract<SpotifyAuthorizationCallback, { readonly kind: "success" }>,
  options: ConsumeSpotifyAuthorizationCallbackOptions,
): Promise<ConsumeSpotifyAuthorizationCallbackResult> {
  const consumed = await options.storage.consumePendingAuthorizationAttempt({
    state: callback.state,
    observedAt: options.clock.now(),
  });
  if (consumed.kind === "rejected") {
    return authorizationRequiredForPendingRejection(consumed);
  }

  const exchanged = await exchangeSpotifyAuthorizationCode({
    configuration: options.configuration,
    code: callback.code,
    verifier: consumed.attempt.verifier,
    fetch: options.fetch,
    signal: options.signal,
  });
  switch (exchanged.kind) {
    case "success":
      await options.storage.saveSpotifyRefreshToken(exchanged.refreshToken);
      return connected(
        exchanged.accessToken,
        exchanged.expiresIn,
        consumed.attempt.returnTo,
      );
    case "authorization-required":
      await options.storage.deleteSpotifyRefreshToken();
      return callbackInvalidCredentialsAuthorizationRequired(
        consumed.attempt.returnTo,
      );
    case "transient-failure":
      return callbackTransientFailure(consumed.attempt.returnTo);
    case "provider-failure":
      return callbackProviderFailure(exchanged.code, consumed.attempt.returnTo);
  }

  const unhandledExchange: never = exchanged;
  throw new Error(
    `Unhandled Spotify authorization exchange result: ${unhandledExchange}`,
  );
}

function authorizationRequiredForPendingRejection(
  consumed: Extract<
    SpotifyPendingAuthorizationAttemptConsumeResult,
    { readonly kind: "rejected" }
  >,
): ConsumeSpotifyAuthorizationCallbackResult {
  if (consumed.reason === "expired") {
    return invalidPendingAuthorizationRequired("expired-pending-authorization");
  }

  return invalidPendingAuthorizationRequired("invalid-pending-authorization");
}

function malformedCallback(
  code: Extract<
    SpotifyAuthorizationCallback,
    { readonly kind: "malformed" }
  >["code"],
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "malformed-callback",
    code,
  };

  return result;
}

function authorizationDenied(
  returnTo: DisplayReturnConfiguration,
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "authorization-denied",
    returnTo,
  };

  return result;
}

function invalidPendingAuthorizationRequired(
  reason: Extract<
    ConsumeSpotifyAuthorizationCallbackResult,
    {
      readonly kind: "authorization-required";
      readonly reason:
        "expired-pending-authorization" | "invalid-pending-authorization";
    }
  >["reason"],
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "authorization-required",
    reason,
  };

  return result;
}

function callbackInvalidCredentialsAuthorizationRequired(
  returnTo: DisplayReturnConfiguration,
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "authorization-required",
    reason: "invalid-credentials",
    returnTo,
  };

  return result;
}

function connected(
  accessToken: SpotifyAccessToken,
  expiresIn: SpotifyAccessTokenLifetimeSeconds,
  returnTo: DisplayReturnConfiguration,
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "connected",
    accessToken,
    expiresIn,
    returnTo,
  };

  return result;
}

function callbackTransientFailure(
  returnTo: DisplayReturnConfiguration,
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "transient-failure",
    returnTo,
  };

  return result;
}

function callbackProviderFailure(
  code: Extract<
    SpotifyTokenRequestFailure,
    { readonly kind: "provider-failure" }
  >["code"],
  returnTo: DisplayReturnConfiguration,
): ConsumeSpotifyAuthorizationCallbackResult {
  const result: ConsumeSpotifyAuthorizationCallbackResult = {
    kind: "provider-failure",
    code,
    returnTo,
  };

  return result;
}

function refreshSuccess(
  accessToken: SpotifyAccessToken,
  expiresIn: SpotifyAccessTokenLifetimeSeconds,
): RefreshSpotifyConnectionResult {
  const result: RefreshSpotifyConnectionResult = {
    kind: "success",
    accessToken,
    expiresIn,
  };

  return result;
}

function missingConnectionAuthorizationRequired(): RefreshSpotifyConnectionResult {
  const result: RefreshSpotifyConnectionResult = {
    kind: "authorization-required",
    reason: "missing-connection",
  };

  return result;
}

function invalidCredentialsAuthorizationRequired(): RefreshSpotifyConnectionResult {
  const result: RefreshSpotifyConnectionResult = {
    kind: "authorization-required",
    reason: "invalid-credentials",
  };

  return result;
}

function refreshTransientFailure(): RefreshSpotifyConnectionResult {
  const result: RefreshSpotifyConnectionResult = {
    kind: "transient-failure",
  };

  return result;
}

function refreshProviderFailure(
  code: Extract<
    SpotifyTokenRequestFailure,
    { readonly kind: "provider-failure" }
  >["code"],
): RefreshSpotifyConnectionResult {
  const result: RefreshSpotifyConnectionResult = {
    kind: "provider-failure",
    code,
  };

  return result;
}
