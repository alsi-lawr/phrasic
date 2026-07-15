import type { SpotifyPublicConfiguration } from "../config.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import type { PkceVerifier, SpotifyAuthorizationCode } from "./pkce-values.ts";
import type {
  SpotifyAuthFetchPort,
  SpotifyAuthFetchRequest,
  SpotifyAuthFetchResult,
} from "./spotify-auth-fetch.ts";
import {
  SpotifyAccessToken,
  SpotifyAccessTokenLifetimeSeconds,
  SpotifyRefreshToken,
  type SpotifyAuthorizationCodeTokenResponse,
  type SpotifyRefreshTokenResponse,
  type SpotifyRefreshTokenRotation,
  type SpotifyTokenResponseParseFailure,
} from "./spotify-token-values.ts";

const spotifyTokenEndpoint = "https://accounts.spotify.com/api/token";
const formContentType = "application/x-www-form-urlencoded";

export type ExchangeSpotifyAuthorizationCodeOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly code: SpotifyAuthorizationCode;
  readonly verifier: PkceVerifier;
  readonly fetch: SpotifyAuthFetchPort;
  readonly signal: AbortSignal;
};

export type RefreshSpotifyAccessTokenOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly refreshToken: SpotifyRefreshToken;
  readonly fetch: SpotifyAuthFetchPort;
  readonly signal: AbortSignal;
};

export type SpotifyAuthorizationCodeExchangeResult =
  | {
      readonly kind: "success";
      readonly accessToken: SpotifyAccessToken;
      readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
      readonly refreshToken: SpotifyRefreshToken;
    }
  | SpotifyTokenRequestFailure;

export type SpotifyAccessTokenRefreshResult =
  | {
      readonly kind: "success";
      readonly accessToken: SpotifyAccessToken;
      readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
      readonly refreshToken: SpotifyRefreshTokenRotation;
    }
  | SpotifyTokenRequestFailure;

export type SpotifyTokenRequestFailure =
  | {
      readonly kind: "authorization-required";
    }
  | {
      readonly kind: "transient-failure";
    }
  | {
      readonly kind: "provider-failure";
      readonly code: "invalid-token-response" | "token-request-rejected";
    };

export function parseSpotifyAuthorizationCodeTokenResponse(
  input: unknown,
): Result<
  SpotifyAuthorizationCodeTokenResponse,
  SpotifyTokenResponseParseFailure
> {
  const source = parseTokenResponseObject(input, "authorization-code");
  if (source.kind === "failure") {
    return source;
  }

  const tokenFields = parseRequiredTokenFields(
    source.value,
    "authorization-code",
  );
  if (tokenFields.kind === "failure") {
    return tokenFields;
  }

  const refreshTokenValue = readRequiredTokenResponseField(
    source.value,
    "refresh_token",
    "authorization-code",
  );
  if (refreshTokenValue.kind === "failure") {
    return refreshTokenValue;
  }

  const refreshToken = SpotifyRefreshToken.parse(refreshTokenValue.value);
  if (refreshToken.kind === "failure") {
    return failed(
      tokenResponseFailure(
        "authorization-code",
        "$.refresh_token",
        "expected-non-empty-string",
      ),
    );
  }

  const response: SpotifyAuthorizationCodeTokenResponse = {
    accessToken: tokenFields.value.accessToken,
    expiresIn: tokenFields.value.expiresIn,
    refreshToken: refreshToken.value,
  };

  return succeeded(response);
}

export function parseSpotifyRefreshTokenResponse(
  input: unknown,
): Result<SpotifyRefreshTokenResponse, SpotifyTokenResponseParseFailure> {
  const source = parseTokenResponseObject(input, "refresh-token");
  if (source.kind === "failure") {
    return source;
  }

  const tokenFields = parseRequiredTokenFields(source.value, "refresh-token");
  if (tokenFields.kind === "failure") {
    return tokenFields;
  }

  const refreshTokenValue = readOptionalTokenResponseField(
    source.value,
    "refresh_token",
    "refresh-token",
  );
  if (refreshTokenValue.kind === "failure") {
    return refreshTokenValue;
  }

  const refreshToken = parseRefreshTokenRotation(refreshTokenValue.value);
  if (refreshToken.kind === "failure") {
    return refreshToken;
  }

  const response: SpotifyRefreshTokenResponse = {
    accessToken: tokenFields.value.accessToken,
    expiresIn: tokenFields.value.expiresIn,
    refreshToken: refreshToken.value,
  };

  return succeeded(response);
}

export async function exchangeSpotifyAuthorizationCode(
  options: ExchangeSpotifyAuthorizationCodeOptions,
): Promise<SpotifyAuthorizationCodeExchangeResult> {
  const parameters = new URLSearchParams();
  parameters.set(
    "client_id",
    options.configuration.spotify.clientId.toAuthorizationParameter(),
  );
  parameters.set("grant_type", "authorization_code");
  parameters.set("code", options.code.toTokenExchangeParameter());
  parameters.set(
    "redirect_uri",
    options.configuration.spotify.redirectUri.toAuthorizationParameter(),
  );
  parameters.set("code_verifier", options.verifier.toChallengeSource());

  const response = await requestSpotifyToken({
    fetch: options.fetch,
    body: parameters.toString(),
    signal: options.signal,
  });
  if (response.kind !== "token-response") {
    return response;
  }

  const parsed = parseSpotifyAuthorizationCodeTokenResponse(response.value);
  if (parsed.kind === "failure") {
    return providerFailure("invalid-token-response");
  }

  const result: SpotifyAuthorizationCodeExchangeResult = {
    kind: "success",
    accessToken: parsed.value.accessToken,
    expiresIn: parsed.value.expiresIn,
    refreshToken: parsed.value.refreshToken,
  };

  return result;
}

export async function refreshSpotifyAccessToken(
  options: RefreshSpotifyAccessTokenOptions,
): Promise<SpotifyAccessTokenRefreshResult> {
  const parameters = new URLSearchParams();
  parameters.set("grant_type", "refresh_token");
  parameters.set(
    "refresh_token",
    options.refreshToken.toTokenRequestParameter(),
  );
  parameters.set(
    "client_id",
    options.configuration.spotify.clientId.toAuthorizationParameter(),
  );

  const response = await requestSpotifyToken({
    fetch: options.fetch,
    body: parameters.toString(),
    signal: options.signal,
  });
  if (response.kind !== "token-response") {
    return response;
  }

  const parsed = parseSpotifyRefreshTokenResponse(response.value);
  if (parsed.kind === "failure") {
    return providerFailure("invalid-token-response");
  }

  const result: SpotifyAccessTokenRefreshResult = {
    kind: "success",
    accessToken: parsed.value.accessToken,
    expiresIn: parsed.value.expiresIn,
    refreshToken: parsed.value.refreshToken,
  };

  return result;
}

type SpotifyTokenResponseFields = {
  readonly accessToken: SpotifyAccessToken;
  readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
};

type OptionalTokenResponseField =
  | {
      readonly kind: "missing";
    }
  | {
      readonly kind: "present";
      readonly value: unknown;
    };

type SpotifyTokenHttpResponse =
  | {
      readonly kind: "token-response";
      readonly value: unknown;
    }
  | SpotifyTokenRequestFailure;

async function requestSpotifyToken(options: {
  readonly fetch: SpotifyAuthFetchPort;
  readonly body: string;
  readonly signal: AbortSignal;
}): Promise<SpotifyTokenHttpResponse> {
  const request: SpotifyAuthFetchRequest = {
    url: new URL(spotifyTokenEndpoint),
    method: "POST",
    contentType: formContentType,
    body: options.body,
    signal: options.signal,
  };

  let fetched: SpotifyAuthFetchResult;
  try {
    fetched = await options.fetch.fetch(request);
  } catch {
    return transientFailure();
  }

  if (fetched.kind === "network-failure") {
    return transientFailure();
  }

  const body = await fetched.response.readJson();
  if (body.kind === "network-failure") {
    return transientFailure();
  }

  if (isTransientHttpStatus(fetched.response.status)) {
    return transientFailure();
  }

  if (body.kind === "invalid-json") {
    return providerFailure("invalid-token-response");
  }

  if (!isSuccessfulHttpStatus(fetched.response.status)) {
    if (isInvalidGrant(body.value)) {
      return authorizationRequired();
    }

    return providerFailure("token-request-rejected");
  }

  const result: SpotifyTokenHttpResponse = {
    kind: "token-response",
    value: body.value,
  };

  return result;
}

function parseTokenResponseObject(
  input: unknown,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<object, SpotifyTokenResponseParseFailure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(tokenResponseFailure(exchange, "$", "expected-object"));
  }

  return succeeded(input);
}

function parseRequiredTokenFields(
  source: object,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<SpotifyTokenResponseFields, SpotifyTokenResponseParseFailure> {
  const accessTokenValue = readRequiredTokenResponseField(
    source,
    "access_token",
    exchange,
  );
  if (accessTokenValue.kind === "failure") {
    return accessTokenValue;
  }

  const accessToken = SpotifyAccessToken.parse(accessTokenValue.value);
  if (accessToken.kind === "failure") {
    return failed(
      tokenResponseFailure(
        exchange,
        "$.access_token",
        "expected-non-empty-string",
      ),
    );
  }

  const expiresInValue = readRequiredTokenResponseField(
    source,
    "expires_in",
    exchange,
  );
  if (expiresInValue.kind === "failure") {
    return expiresInValue;
  }

  const expiresIn = SpotifyAccessTokenLifetimeSeconds.parse(
    expiresInValue.value,
  );
  if (expiresIn.kind === "failure") {
    return failed(
      tokenResponseFailure(
        exchange,
        "$.expires_in",
        "expected-positive-safe-integer-seconds",
      ),
    );
  }

  const fields: SpotifyTokenResponseFields = {
    accessToken: accessToken.value,
    expiresIn: expiresIn.value,
  };

  return succeeded(fields);
}

function readRequiredTokenResponseField(
  source: object,
  fieldName: "access_token" | "expires_in" | "refresh_token",
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<unknown, SpotifyTokenResponseParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failed(
      tokenResponseFailure(
        exchange,
        tokenResponsePath(fieldName),
        "missing-value",
      ),
    );
  }

  if (!("value" in descriptor)) {
    return failed(
      tokenResponseFailure(
        exchange,
        tokenResponsePath(fieldName),
        "expected-data-property",
      ),
    );
  }

  return succeeded(descriptor.value);
}

function readOptionalTokenResponseField(
  source: object,
  fieldName: "refresh_token",
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<OptionalTokenResponseField, SpotifyTokenResponseParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    const missing: OptionalTokenResponseField = {
      kind: "missing",
    };

    return succeeded(missing);
  }

  if (!("value" in descriptor)) {
    return failed(
      tokenResponseFailure(
        exchange,
        tokenResponsePath(fieldName),
        "expected-data-property",
      ),
    );
  }

  const present: OptionalTokenResponseField = {
    kind: "present",
    value: descriptor.value,
  };

  return succeeded(present);
}

function parseRefreshTokenRotation(
  field: OptionalTokenResponseField,
): Result<SpotifyRefreshTokenRotation, SpotifyTokenResponseParseFailure> {
  if (field.kind === "missing") {
    const retained: SpotifyRefreshTokenRotation = {
      kind: "refresh-token-retained",
    };

    return succeeded(retained);
  }

  const refreshToken = SpotifyRefreshToken.parse(field.value);
  if (refreshToken.kind === "failure") {
    return failed(
      tokenResponseFailure(
        "refresh-token",
        "$.refresh_token",
        "expected-non-empty-string",
      ),
    );
  }

  const rotated: SpotifyRefreshTokenRotation = {
    kind: "refresh-token-rotated",
    refreshToken: refreshToken.value,
  };

  return succeeded(rotated);
}

function isInvalidGrant(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const descriptor = Object.getOwnPropertyDescriptor(input, "error");
  if (descriptor === undefined || !("value" in descriptor)) {
    return false;
  }

  return descriptor.value === "invalid_grant";
}

function isSuccessfulHttpStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function tokenResponsePath(
  fieldName: "access_token" | "expires_in" | "refresh_token",
): "$.access_token" | "$.expires_in" | "$.refresh_token" {
  switch (fieldName) {
    case "access_token":
      return "$.access_token";
    case "expires_in":
      return "$.expires_in";
    case "refresh_token":
      return "$.refresh_token";
  }

  const unhandledField: never = fieldName;
  throw new Error(`Unhandled Spotify token response field: ${unhandledField}`);
}

function tokenResponseFailure(
  exchange: SpotifyTokenResponseParseFailure["exchange"],
  path: SpotifyTokenResponseParseFailure["path"],
  code: SpotifyTokenResponseParseFailure["code"],
): SpotifyTokenResponseParseFailure {
  const failure: SpotifyTokenResponseParseFailure = {
    kind: "invalid-spotify-token-response",
    exchange,
    path,
    code,
  };

  return failure;
}

function authorizationRequired(): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "authorization-required",
  };

  return result;
}

function transientFailure(): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "transient-failure",
  };

  return result;
}

function providerFailure(
  code: Extract<
    SpotifyTokenRequestFailure,
    { readonly kind: "provider-failure" }
  >["code"],
): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "provider-failure",
    code,
  };

  return result;
}
