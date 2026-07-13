import type { SpotifyPublicConfiguration } from "../config.ts";
import type {
  BrowserRequestDeadline,
  BrowserRequestDeadlinePort,
} from "../request-deadline.ts";
import type { PkceVerifier, SpotifyAuthorizationCode } from "./pkce.ts";

type ParseSuccess<Value> = {
  readonly kind: "success";
  readonly value: Value;
};

type ParseFailure<Failure> = {
  readonly kind: "failure";
  readonly error: Failure;
};

type ParseResult<Value, Failure> = ParseSuccess<Value> | ParseFailure<Failure>;

const spotifyTokenEndpoint = "https://accounts.spotify.com/api/token";
const formContentType = "application/x-www-form-urlencoded";
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

export class SpotifyAccessToken {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static parse(
    input: unknown,
  ): ParseResult<SpotifyAccessToken, SpotifyTokenValueParseFailure> {
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
    Object.freeze(this);
  }

  static parse(
    input: unknown,
  ): ParseResult<SpotifyRefreshToken, SpotifyTokenValueParseFailure> {
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
    Object.freeze(this);
  }

  static parse(
    input: unknown,
  ): ParseResult<
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
            return frozenNetworkFailure();
          }

          const parsedResponse: SpotifyAuthFetchResponse = Object.freeze({
            status: response.status,
            async readJson(): Promise<SpotifyAuthJsonReadResult> {
              try {
                const value: unknown = await response.json();
                if (!hasActiveRequestDeadline(deadline)) {
                  return frozenJsonNetworkFailure();
                }

                return frozenJson(value);
              } catch {
                if (!hasActiveRequestDeadline(deadline)) {
                  return frozenJsonNetworkFailure();
                }

                return frozenInvalidJson();
              } finally {
                deadline.dispose();
              }
            },
          });

          return frozenFetchResponse(parsedResponse);
        } catch {
          deadline.dispose();
          return frozenNetworkFailure();
        }
      } catch {
        return frozenNetworkFailure();
      }
    },
  };

  return Object.freeze(port);
}

export function parseSpotifyAuthorizationCodeTokenResponse(
  input: unknown,
): ParseResult<
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

  return succeeded(Object.freeze(response));
}

export function parseSpotifyRefreshTokenResponse(
  input: unknown,
): ParseResult<SpotifyRefreshTokenResponse, SpotifyTokenResponseParseFailure> {
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

  return succeeded(Object.freeze(response));
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
    return frozenProviderFailure("invalid-token-response");
  }

  const result: SpotifyAuthorizationCodeExchangeResult = {
    kind: "success",
    accessToken: parsed.value.accessToken,
    expiresIn: parsed.value.expiresIn,
    refreshToken: parsed.value.refreshToken,
  };

  return Object.freeze(result);
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
    return frozenProviderFailure("invalid-token-response");
  }

  const result: SpotifyAccessTokenRefreshResult = {
    kind: "success",
    accessToken: parsed.value.accessToken,
    expiresIn: parsed.value.expiresIn,
    refreshToken: parsed.value.refreshToken,
  };

  return Object.freeze(result);
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
  const request: SpotifyAuthFetchRequest = Object.freeze({
    url: new URL(spotifyTokenEndpoint),
    method: "POST",
    contentType: formContentType,
    body: options.body,
    signal: options.signal,
  });

  let fetched: SpotifyAuthFetchResult;
  try {
    fetched = await options.fetch.fetch(request);
  } catch {
    return frozenTransientFailure();
  }

  if (fetched.kind === "network-failure") {
    return frozenTransientFailure();
  }

  const body = await fetched.response.readJson();
  if (body.kind === "network-failure") {
    return frozenTransientFailure();
  }

  if (isTransientHttpStatus(fetched.response.status)) {
    return frozenTransientFailure();
  }

  if (body.kind === "invalid-json") {
    return frozenProviderFailure("invalid-token-response");
  }

  if (!isSuccessfulHttpStatus(fetched.response.status)) {
    if (isInvalidGrant(body.value)) {
      return frozenAuthorizationRequired();
    }

    return frozenProviderFailure("token-request-rejected");
  }

  const result: SpotifyTokenHttpResponse = {
    kind: "token-response",
    value: body.value,
  };

  return Object.freeze(result);
}

function parseTokenResponseObject(
  input: unknown,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): ParseResult<object, SpotifyTokenResponseParseFailure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(tokenResponseFailure(exchange, "$", "expected-object"));
  }

  return succeeded(input);
}

function parseRequiredTokenFields(
  source: object,
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): ParseResult<SpotifyTokenResponseFields, SpotifyTokenResponseParseFailure> {
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

  return succeeded(Object.freeze(fields));
}

function readRequiredTokenResponseField(
  source: object,
  fieldName: "access_token" | "expires_in" | "refresh_token",
  exchange: SpotifyTokenResponseParseFailure["exchange"],
): ParseResult<unknown, SpotifyTokenResponseParseFailure> {
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
): ParseResult<OptionalTokenResponseField, SpotifyTokenResponseParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    const missing: OptionalTokenResponseField = {
      kind: "missing",
    };

    return succeeded(Object.freeze(missing));
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

  return succeeded(Object.freeze(present));
}

function parseRefreshTokenRotation(
  field: OptionalTokenResponseField,
): ParseResult<SpotifyRefreshTokenRotation, SpotifyTokenResponseParseFailure> {
  if (field.kind === "missing") {
    const retained: SpotifyRefreshTokenRotation = {
      kind: "refresh-token-retained",
    };

    return succeeded(Object.freeze(retained));
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

  return succeeded(Object.freeze(rotated));
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

function isNonEmptyTokenString(input: unknown): input is string {
  return (
    typeof input === "string" &&
    input.length > 0 &&
    input.trim().length > 0 &&
    input === input.trim()
  );
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

function tokenValueFailure(
  value: SpotifyTokenValueParseFailure["value"],
): SpotifyTokenValueParseFailure {
  const failure: SpotifyTokenValueParseFailure = {
    kind: "invalid-spotify-token-value",
    value,
    code: "expected-non-empty-string",
  };

  return Object.freeze(failure);
}

function accessTokenLifetimeFailure(): SpotifyAccessTokenLifetimeParseFailure {
  const failure: SpotifyAccessTokenLifetimeParseFailure = {
    kind: "invalid-spotify-access-token-lifetime",
    code: "expected-positive-safe-integer-seconds",
  };

  return Object.freeze(failure);
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

  return Object.freeze(failure);
}

function frozenJson(value: unknown): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "json",
    value,
  };

  return Object.freeze(result);
}

function frozenInvalidJson(): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "invalid-json",
  };

  return Object.freeze(result);
}

function frozenJsonNetworkFailure(): SpotifyAuthJsonReadResult {
  const result: SpotifyAuthJsonReadResult = {
    kind: "network-failure",
  };

  return Object.freeze(result);
}

function hasActiveRequestDeadline(deadline: BrowserRequestDeadline): boolean {
  return deadline.outcome().kind === "active";
}

function frozenFetchResponse(
  response: SpotifyAuthFetchResponse,
): SpotifyAuthFetchResult {
  const result: SpotifyAuthFetchResult = {
    kind: "response",
    response,
  };

  return Object.freeze(result);
}

function frozenNetworkFailure(): SpotifyAuthFetchResult {
  const result: SpotifyAuthFetchResult = {
    kind: "network-failure",
  };

  return Object.freeze(result);
}

function frozenAuthorizationRequired(): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "authorization-required",
  };

  return Object.freeze(result);
}

function frozenTransientFailure(): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "transient-failure",
  };

  return Object.freeze(result);
}

function frozenProviderFailure(
  code: Extract<
    SpotifyTokenRequestFailure,
    { readonly kind: "provider-failure" }
  >["code"],
): SpotifyTokenRequestFailure {
  const result: SpotifyTokenRequestFailure = {
    kind: "provider-failure",
    code,
  };

  return Object.freeze(result);
}

function succeeded<Value>(value: Value): ParseSuccess<Value> {
  const result: ParseSuccess<Value> = {
    kind: "success",
    value,
  };

  return Object.freeze(result);
}

function failed<Failure>(error: Failure): ParseFailure<Failure> {
  const result: ParseFailure<Failure> = {
    kind: "failure",
    error,
  };

  return Object.freeze(result);
}
