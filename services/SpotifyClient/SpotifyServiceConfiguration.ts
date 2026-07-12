import {
  PlaybackPollDelayMilliseconds,
  type Result,
} from "../../domain/playback.ts";

type UnknownJsonObject = {
  readonly [key: string]: unknown;
};

export type SpotifyAuthorizationResponseType = "code";

export type SpotifyAuthorizationScope =
  | "user-modify-playback-state"
  | "user-read-currently-playing"
  | "user-read-playback-state";

export type SpotifyArtworkSize = "large" | "medium" | "small";

export type SpotifyAuthorizationConfiguration = {
  readonly authorizationAddress: string;
  readonly scopes: ReadonlyArray<SpotifyAuthorizationScope>;
  readonly responseType: SpotifyAuthorizationResponseType;
  readonly callbackAddress: string;
  readonly spotifyClientId: string;
  readonly spotifyClientSecret: string;
};

export type SpotifyTrackAgentConfiguration = {
  readonly currentlyPlayingAddress: string;
  readonly playbackPollDelay: PlaybackPollDelayMilliseconds;
  readonly artworkSize: SpotifyArtworkSize;
};

export type SpotifyRefreshConfiguration = {
  readonly authTokenRefreshAddress: string;
};

export type SpotifyServiceConfiguration = {
  readonly authorization: SpotifyAuthorizationConfiguration;
  readonly trackAgent: SpotifyTrackAgentConfiguration;
  readonly refresh: SpotifyRefreshConfiguration;
};

export type SpotifyServiceConfigurationParseFailure = {
  readonly kind: "invalid-spotify-service-configuration";
  readonly path: string;
  readonly code:
    | "expected-https-or-loopback-http-url"
    | "expected-https-url"
    | "expected-non-empty-string"
    | "expected-object"
    | "expected-positive-integer"
    | "invalid-artwork-size"
    | "invalid-response-type"
    | "invalid-scope"
    | "missing-value"
    | "unexpected-key";
};

export function buildSpotifyAuthorizationUrl(
  authorization: SpotifyAuthorizationConfiguration,
): string {
  const authorizationUrl = new URL(authorization.authorizationAddress);
  const parameters = authorizationUrl.searchParams;

  parameters.set("client_id", authorization.spotifyClientId);
  parameters.set("response_type", authorization.responseType);
  parameters.set("redirect_uri", authorization.callbackAddress);
  parameters.set("scope", authorization.scopes.join(" "));

  return authorizationUrl.toString();
}

export function parseSpotifyServiceConfiguration(
  input: unknown,
): Result<
  SpotifyServiceConfiguration,
  SpotifyServiceConfigurationParseFailure
> {
  const source = parseObject(input, "$");
  if (source.kind === "failure") {
    return source;
  }

  const expectedKeys = rejectUnexpectedKeys(
    source.value,
    ["authorization", "trackAgent", "refresh"],
    "$",
  );
  if (expectedKeys.kind === "failure") {
    return expectedKeys;
  }

  const authorization = readRequired(
    source.value,
    "authorization",
    "$.authorization",
  );
  if (authorization.kind === "failure") {
    return authorization;
  }

  const trackAgent = readRequired(source.value, "trackAgent", "$.trackAgent");
  if (trackAgent.kind === "failure") {
    return trackAgent;
  }

  const refresh = readRequired(source.value, "refresh", "$.refresh");
  if (refresh.kind === "failure") {
    return refresh;
  }

  const parsedAuthorization = parseAuthorizationConfiguration(
    authorization.value,
    "$.authorization",
  );
  if (parsedAuthorization.kind === "failure") {
    return parsedAuthorization;
  }

  const parsedTrackAgent = parseTrackAgentConfiguration(
    trackAgent.value,
    "$.trackAgent",
  );
  if (parsedTrackAgent.kind === "failure") {
    return parsedTrackAgent;
  }

  const parsedRefresh = parseRefreshConfiguration(refresh.value, "$.refresh");
  if (parsedRefresh.kind === "failure") {
    return parsedRefresh;
  }

  const configuration: SpotifyServiceConfiguration = {
    authorization: parsedAuthorization.value,
    trackAgent: parsedTrackAgent.value,
    refresh: parsedRefresh.value,
  };

  return succeeded(Object.freeze(configuration));
}

function parseAuthorizationConfiguration(
  input: unknown,
  path: string,
): Result<
  SpotifyAuthorizationConfiguration,
  SpotifyServiceConfigurationParseFailure
> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const expectedKeys = rejectUnexpectedKeys(
    source.value,
    [
      "authorizationAddress",
      "scopes",
      "responseType",
      "callbackAddress",
      "spotifyClientId",
      "spotifyClientSecret",
    ],
    path,
  );
  if (expectedKeys.kind === "failure") {
    return expectedKeys;
  }

  const authorizationAddress = readAndParse(
    source.value,
    "authorizationAddress",
    `${path}.authorizationAddress`,
    parseHttpsUrl,
  );
  if (authorizationAddress.kind === "failure") {
    return authorizationAddress;
  }

  const scopes = readAndParse(
    source.value,
    "scopes",
    `${path}.scopes`,
    parseScopes,
  );
  if (scopes.kind === "failure") {
    return scopes;
  }

  const responseType = readAndParse(
    source.value,
    "responseType",
    `${path}.responseType`,
    parseResponseType,
  );
  if (responseType.kind === "failure") {
    return responseType;
  }

  const callbackAddress = readAndParse(
    source.value,
    "callbackAddress",
    `${path}.callbackAddress`,
    parseCallbackAddress,
  );
  if (callbackAddress.kind === "failure") {
    return callbackAddress;
  }

  const spotifyClientId = readAndParse(
    source.value,
    "spotifyClientId",
    `${path}.spotifyClientId`,
    parseNonEmptyString,
  );
  if (spotifyClientId.kind === "failure") {
    return spotifyClientId;
  }

  const spotifyClientSecret = readAndParse(
    source.value,
    "spotifyClientSecret",
    `${path}.spotifyClientSecret`,
    parseNonEmptyString,
  );
  if (spotifyClientSecret.kind === "failure") {
    return spotifyClientSecret;
  }

  const configuration: SpotifyAuthorizationConfiguration = {
    authorizationAddress: authorizationAddress.value,
    scopes: scopes.value,
    responseType: responseType.value,
    callbackAddress: callbackAddress.value,
    spotifyClientId: spotifyClientId.value,
    spotifyClientSecret: spotifyClientSecret.value,
  };

  return succeeded(Object.freeze(configuration));
}

function parseTrackAgentConfiguration(
  input: unknown,
  path: string,
): Result<
  SpotifyTrackAgentConfiguration,
  SpotifyServiceConfigurationParseFailure
> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const expectedKeys = rejectUnexpectedKeys(
    source.value,
    ["currentlyPlayingAddress", "spotifyTrackRefreshIntervalMs", "artworkSize"],
    path,
  );
  if (expectedKeys.kind === "failure") {
    return expectedKeys;
  }

  const currentlyPlayingAddress = readAndParse(
    source.value,
    "currentlyPlayingAddress",
    `${path}.currentlyPlayingAddress`,
    parseHttpsUrl,
  );
  if (currentlyPlayingAddress.kind === "failure") {
    return currentlyPlayingAddress;
  }

  const playbackPollDelay = readAndParse(
    source.value,
    "spotifyTrackRefreshIntervalMs",
    `${path}.spotifyTrackRefreshIntervalMs`,
    parsePlaybackPollDelay,
  );
  if (playbackPollDelay.kind === "failure") {
    return playbackPollDelay;
  }

  const artworkSize = readAndParse(
    source.value,
    "artworkSize",
    `${path}.artworkSize`,
    parseArtworkSize,
  );
  if (artworkSize.kind === "failure") {
    return artworkSize;
  }

  const configuration: SpotifyTrackAgentConfiguration = {
    currentlyPlayingAddress: currentlyPlayingAddress.value,
    playbackPollDelay: playbackPollDelay.value,
    artworkSize: artworkSize.value,
  };

  return succeeded(Object.freeze(configuration));
}

function parseRefreshConfiguration(
  input: unknown,
  path: string,
): Result<
  SpotifyRefreshConfiguration,
  SpotifyServiceConfigurationParseFailure
> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const expectedKeys = rejectUnexpectedKeys(
    source.value,
    ["authTokenRefreshAddress"],
    path,
  );
  if (expectedKeys.kind === "failure") {
    return expectedKeys;
  }

  const authTokenRefreshAddress = readAndParse(
    source.value,
    "authTokenRefreshAddress",
    `${path}.authTokenRefreshAddress`,
    parseHttpsUrl,
  );
  if (authTokenRefreshAddress.kind === "failure") {
    return authTokenRefreshAddress;
  }

  const configuration: SpotifyRefreshConfiguration = {
    authTokenRefreshAddress: authTokenRefreshAddress.value,
  };

  return succeeded(Object.freeze(configuration));
}

function readAndParse<Value>(
  source: UnknownJsonObject,
  key: string,
  path: string,
  parser: (
    input: unknown,
    valuePath: string,
  ) => Result<Value, SpotifyServiceConfigurationParseFailure>,
): Result<Value, SpotifyServiceConfigurationParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parser(value.value, path);
}

function readRequired(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<unknown, SpotifyServiceConfigurationParseFailure> {
  if (!Object.hasOwn(source, key)) {
    return failed(configurationFailure(path, "missing-value"));
  }

  return succeeded(source[key]);
}

function rejectUnexpectedKeys(
  source: UnknownJsonObject,
  expectedKeys: ReadonlyArray<string>,
  path: string,
): Result<void, SpotifyServiceConfigurationParseFailure> {
  for (const key of Object.keys(source)) {
    if (!expectedKeys.includes(key)) {
      return failed(configurationFailure(`${path}.${key}`, "unexpected-key"));
    }
  }

  return succeeded(undefined);
}

function parseObject(
  input: unknown,
  path: string,
): Result<UnknownJsonObject, SpotifyServiceConfigurationParseFailure> {
  if (!isUnknownJsonObject(input)) {
    return failed(configurationFailure(path, "expected-object"));
  }

  return succeeded(input);
}

function parseHttpsUrl(
  input: unknown,
  path: string,
): Result<string, SpotifyServiceConfigurationParseFailure> {
  const value = parseNonEmptyString(input, path);
  if (value.kind === "failure") {
    return value;
  }

  try {
    const url = new URL(value.value);
    if (url.protocol === "https:") {
      return value;
    }
  } catch {
    return failed(configurationFailure(path, "expected-https-url"));
  }

  return failed(configurationFailure(path, "expected-https-url"));
}

function parseCallbackAddress(
  input: unknown,
  path: string,
): Result<string, SpotifyServiceConfigurationParseFailure> {
  const value = parseNonEmptyString(input, path);
  if (value.kind === "failure") {
    return value;
  }

  try {
    const url = new URL(value.value);
    if (url.protocol === "https:") {
      return value;
    }

    if (url.protocol === "http:" && isIpLoopbackHostname(url.hostname)) {
      return value;
    }
  } catch {
    return failed(
      configurationFailure(path, "expected-https-or-loopback-http-url"),
    );
  }

  return failed(
    configurationFailure(path, "expected-https-or-loopback-http-url"),
  );
}

function parseNonEmptyString(
  input: unknown,
  path: string,
): Result<string, SpotifyServiceConfigurationParseFailure> {
  if (typeof input !== "string" || input.length === 0) {
    return failed(configurationFailure(path, "expected-non-empty-string"));
  }

  return succeeded(input);
}

function parsePlaybackPollDelay(
  input: unknown,
  path: string,
): Result<
  PlaybackPollDelayMilliseconds,
  SpotifyServiceConfigurationParseFailure
> {
  const delay = PlaybackPollDelayMilliseconds.create(input);
  if (delay.kind === "failure") {
    return failed(configurationFailure(path, "expected-positive-integer"));
  }

  return succeeded(delay.value);
}

function parseResponseType(
  input: unknown,
  path: string,
): Result<
  SpotifyAuthorizationResponseType,
  SpotifyServiceConfigurationParseFailure
> {
  if (input !== "code") {
    return failed(configurationFailure(path, "invalid-response-type"));
  }

  return succeeded(input);
}

function parseScopes(
  input: unknown,
  path: string,
): Result<
  ReadonlyArray<SpotifyAuthorizationScope>,
  SpotifyServiceConfigurationParseFailure
> {
  const rawScopes = parseNonEmptyString(input, path);
  if (rawScopes.kind === "failure") {
    return rawScopes;
  }

  const scopes: SpotifyAuthorizationScope[] = [];
  for (const rawScope of rawScopes.value.trim().split(/\s+/)) {
    const scope = parseScope(rawScope, path);
    if (scope.kind === "failure") {
      return scope;
    }

    scopes.push(scope.value);
  }

  return succeeded(Object.freeze(scopes));
}

function parseScope(
  input: string,
  path: string,
): Result<SpotifyAuthorizationScope, SpotifyServiceConfigurationParseFailure> {
  switch (input) {
    case "user-modify-playback-state":
    case "user-read-currently-playing":
    case "user-read-playback-state":
      return succeeded(input);
  }

  return failed(configurationFailure(path, "invalid-scope"));
}

function parseArtworkSize(
  input: unknown,
  path: string,
): Result<SpotifyArtworkSize, SpotifyServiceConfigurationParseFailure> {
  switch (input) {
    case "large":
    case "medium":
    case "small":
      return succeeded(input);
  }

  return failed(configurationFailure(path, "invalid-artwork-size"));
}

function configurationFailure(
  path: string,
  code: SpotifyServiceConfigurationParseFailure["code"],
): SpotifyServiceConfigurationParseFailure {
  return Object.freeze({
    kind: "invalid-spotify-service-configuration",
    path,
    code,
  });
}

function isUnknownJsonObject(input: unknown): input is UnknownJsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isIpLoopbackHostname(hostname: string): boolean {
  if (hostname === "[::1]") {
    return true;
  }

  const octets = hostname.split(".");
  return octets.length === 4 && octets[0] === "127";
}

function succeeded<Value, Failure>(value: Value): Result<Value, Failure> {
  return Object.freeze({ kind: "success", value });
}

function failed<Value, Failure>(error: Failure): Result<Value, Failure> {
  return Object.freeze({ kind: "failure", error });
}
