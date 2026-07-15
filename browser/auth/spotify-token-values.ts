import { failed, succeeded, type Result } from "../../domain/result.ts";

const maximumAccessTokenLifetimeSeconds = Math.floor(
  Number.MAX_SAFE_INTEGER / 1_000,
);

export type SpotifyTokenValueParseFailure = {
  readonly kind: "invalid-spotify-token-value";
  readonly value: "access-token" | "refresh-token";
  readonly code: "expected-non-empty-string";
};

export type SpotifyAccessTokenLifetimeParseFailure = {
  readonly kind: "invalid-spotify-access-token-lifetime";
  readonly code: "expected-positive-safe-integer-seconds";
};

export type SpotifyTokenResponseParseFailure = {
  readonly kind: "invalid-spotify-token-response";
  readonly exchange: "authorization-code" | "refresh-token";
  readonly path: "$.access_token" | "$.expires_in" | "$.refresh_token" | "$";
  readonly code:
    | "expected-data-property"
    | "expected-non-empty-string"
    | "expected-object"
    | "expected-positive-safe-integer-seconds"
    | "missing-value";
};

export class SpotifyAccessToken {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): Result<SpotifyAccessToken, SpotifyTokenValueParseFailure> {
    if (!isNonEmptyTokenString(input)) {
      return failed(tokenValueFailure("access-token"));
    }

    return succeeded(new SpotifyAccessToken(input));
  }

  toMemoryValue(): string {
    return this.value;
  }
}

export class SpotifyRefreshToken {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): Result<SpotifyRefreshToken, SpotifyTokenValueParseFailure> {
    if (!isNonEmptyTokenString(input)) {
      return failed(tokenValueFailure("refresh-token"));
    }

    return succeeded(new SpotifyRefreshToken(input));
  }

  toStorageValue(): string {
    return this.value;
  }

  toTokenRequestParameter(): string {
    return this.value;
  }
}

export class SpotifyAccessTokenLifetimeSeconds {
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): Result<
    SpotifyAccessTokenLifetimeSeconds,
    SpotifyAccessTokenLifetimeParseFailure
  > {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input <= 0 ||
      input > maximumAccessTokenLifetimeSeconds
    ) {
      return failed(accessTokenLifetimeFailure());
    }

    return succeeded(new SpotifyAccessTokenLifetimeSeconds(input));
  }

  toSeconds(): number {
    return this.value;
  }

  toMilliseconds(): number {
    return this.value * 1_000;
  }
}

export type SpotifyAuthorizationCodeTokenResponse = {
  readonly accessToken: SpotifyAccessToken;
  readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
  readonly refreshToken: SpotifyRefreshToken;
};

export type SpotifyRefreshTokenRotation =
  | {
      readonly kind: "refresh-token-retained";
    }
  | {
      readonly kind: "refresh-token-rotated";
      readonly refreshToken: SpotifyRefreshToken;
    };

export type SpotifyRefreshTokenResponse = {
  readonly accessToken: SpotifyAccessToken;
  readonly expiresIn: SpotifyAccessTokenLifetimeSeconds;
  readonly refreshToken: SpotifyRefreshTokenRotation;
};

function isNonEmptyTokenString(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    input.trim().length > 0 &&
    input === input.trim()
  );
}

function tokenValueFailure(
  value: SpotifyTokenValueParseFailure["value"],
): SpotifyTokenValueParseFailure {
  const failure: SpotifyTokenValueParseFailure = {
    kind: "invalid-spotify-token-value",
    value,
    code: "expected-non-empty-string",
  };

  return failure;
}

function accessTokenLifetimeFailure(): SpotifyAccessTokenLifetimeParseFailure {
  const failure: SpotifyAccessTokenLifetimeParseFailure = {
    kind: "invalid-spotify-access-token-lifetime",
    code: "expected-positive-safe-integer-seconds",
  };

  return failure;
}
