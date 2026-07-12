import {
  AccessToken,
  AccessTokenExpiresInSeconds,
  RefreshToken,
  type Result,
} from "../../domain/playback.ts";

type UnknownJsonObject = {
  readonly [key: string]: unknown;
};

export type SpotifyAuthorizationCodeTokenResponse = {
  readonly accessToken: AccessToken;
  readonly expiresInSeconds: AccessTokenExpiresInSeconds;
  readonly refreshToken: RefreshToken;
};

export type SpotifyAccessTokenRefreshResponse = {
  readonly accessToken: AccessToken;
  readonly expiresInSeconds: AccessTokenExpiresInSeconds;
};

export type SpotifyTokenResponseParseFailure = {
  readonly kind: "invalid-spotify-token-response";
  readonly exchange: "authorization-code" | "refresh-token";
  readonly path: "$" | "$.access_token" | "$.expires_in" | "$.refresh_token";
  readonly code:
    | "expected-non-empty-string"
    | "expected-object"
    | "expected-positive-integer"
    | "missing-value";
};

export function parseSpotifyAuthorizationCodeTokenResponse(
  input: unknown,
): Result<
  SpotifyAuthorizationCodeTokenResponse,
  SpotifyTokenResponseParseFailure
> {
  const source = parseObject(input, "authorization-code");
  if (source.kind === "failure") {
    return source;
  }

  const tokenFields = parseTokenFields(source.value, "authorization-code");
  if (tokenFields.kind === "failure") {
    return tokenFields;
  }

  const refreshTokenValue = readRequired(
    source.value,
    "refresh_token",
    "authorization-code",
  );
  if (refreshTokenValue.kind === "failure") {
    return refreshTokenValue;
  }

  const refreshToken = RefreshToken.create(refreshTokenValue.value);
  if (refreshToken.kind === "failure") {
    return failed(
      tokenFailure(
        "authorization-code",
        "$.refresh_token",
        "expected-non-empty-string",
      ),
    );
  }

  const response: SpotifyAuthorizationCodeTokenResponse = {
    accessToken: tokenFields.value.accessToken,
    expiresInSeconds: tokenFields.value.expiresInSeconds,
    refreshToken: refreshToken.value,
  };

  return succeeded(Object.freeze(response));
}

export function parseSpotifyAccessTokenRefreshResponse(
  input: unknown,
): Result<SpotifyAccessTokenRefreshResponse, SpotifyTokenResponseParseFailure> {
  const source = parseObject(input, "refresh-token");
  if (source.kind === "failure") {
    return source;
  }

  const tokenFields = parseTokenFields(source.value, "refresh-token");
  if (tokenFields.kind === "failure") {
    return tokenFields;
  }

  const response: SpotifyAccessTokenRefreshResponse = {
    accessToken: tokenFields.value.accessToken,
    expiresInSeconds: tokenFields.value.expiresInSeconds,
  };

  return succeeded(Object.freeze(response));
}

type SpotifyTokenFields = {
  readonly accessToken: AccessToken;
  readonly expiresInSeconds: AccessTokenExpiresInSeconds;
};

function parseTokenFields(
  source: UnknownJsonObject,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<SpotifyTokenFields, SpotifyTokenResponseParseFailure> {
  const accessToken = readRequired(source, "access_token", exchange);
  if (accessToken.kind === "failure") {
    return accessToken;
  }

  const parsedAccessToken = AccessToken.create(accessToken.value);
  if (parsedAccessToken.kind === "failure") {
    return failed(
      tokenFailure(exchange, "$.access_token", "expected-non-empty-string"),
    );
  }

  const expiresIn = readRequired(source, "expires_in", exchange);
  if (expiresIn.kind === "failure") {
    return expiresIn;
  }

  const parsedExpiresIn = AccessTokenExpiresInSeconds.create(expiresIn.value);
  if (parsedExpiresIn.kind === "failure") {
    return failed(
      tokenFailure(exchange, "$.expires_in", "expected-positive-integer"),
    );
  }

  const fields: SpotifyTokenFields = {
    accessToken: parsedAccessToken.value,
    expiresInSeconds: parsedExpiresIn.value,
  };

  return succeeded(Object.freeze(fields));
}

function parseObject(
  input: unknown,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<UnknownJsonObject, SpotifyTokenResponseParseFailure> {
  if (!isUnknownJsonObject(input)) {
    return failed(tokenFailure(exchange, "$", "expected-object"));
  }

  return succeeded(input);
}

function readRequired(
  source: UnknownJsonObject,
  key: "access_token" | "expires_in" | "refresh_token",
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): Result<unknown, SpotifyTokenResponseParseFailure> {
  const path = tokenPathForKey(key);
  if (!(key in source)) {
    return failed(tokenFailure(exchange, path, "missing-value"));
  }

  return succeeded(source[key]);
}

function tokenPathForKey(
  key: "access_token" | "expires_in" | "refresh_token",
): "$.access_token" | "$.expires_in" | "$.refresh_token" {
  switch (key) {
    case "access_token":
      return "$.access_token";
    case "expires_in":
      return "$.expires_in";
    case "refresh_token":
      return "$.refresh_token";
  }

  return assertNever(key);
}

function tokenFailure(
  exchange: SpotifyTokenResponseParseFailure["exchange"],
  path: SpotifyTokenResponseParseFailure["path"],
  code: SpotifyTokenResponseParseFailure["code"],
): SpotifyTokenResponseParseFailure {
  return Object.freeze({
    kind: "invalid-spotify-token-response",
    exchange,
    path,
    code,
  });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Spotify token field: ${String(value)}`);
}

function isUnknownJsonObject(input: unknown): input is UnknownJsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function succeeded<Value, Failure>(value: Value): Result<Value, Failure> {
  return Object.freeze({ kind: "success", value });
}

function failed<Value, Failure>(error: Failure): Result<Value, Failure> {
  return Object.freeze({ kind: "failure", error });
}
