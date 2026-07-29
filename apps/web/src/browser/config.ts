type ConfigurationParseSuccess<Value> = {
  readonly kind: "success";
  readonly value: Value;
};

type ConfigurationParseFailure = {
  readonly kind: "failure";
  readonly error: SpotifyPublicConfigurationParseFailure;
};

type ConfigurationParseResult<Value> =
  ConfigurationParseSuccess<Value> | ConfigurationParseFailure;

type ConfigurationPath =
  "$" | "$.spotify" | "$.spotify.clientId" | "$.spotify.redirectUri";

export type SpotifyPublicConfigurationParseFailure = {
  readonly kind: "invalid-spotify-public-configuration";
  readonly path: ConfigurationPath;
  readonly code:
    | "expected-data-property"
    | "expected-https-spotify-callback"
    | "expected-non-empty-string"
    | "expected-object"
    | "expected-same-origin-callback"
    | "missing-value"
    | "secret-shaped-field"
    | "unexpected-field";
};

export type SpotifyPublicConfigurationParseOptions = {
  readonly applicationUrl: URL;
};

export type SpotifyPublicConfiguration = {
  readonly spotify: {
    readonly clientId: SpotifyClientId;
    readonly redirectUri: SpotifyRedirectUri;
  };
};

export class SpotifyClientId {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(input: unknown): ConfigurationParseResult<SpotifyClientId> {
    if (typeof input !== "string" || input.trim().length === 0) {
      return failed(
        configurationFailure("$.spotify.clientId", "expected-non-empty-string"),
      );
    }

    return succeeded(new SpotifyClientId(input));
  }

  toAuthorizationParameter(): string {
    return this.value;
  }
}

export class SpotifyRedirectUri {
  private readonly value: string;
  private readonly origin: string;

  private constructor(value: string, origin: string) {
    this.value = value;
    this.origin = origin;
  }

  static parse(
    input: unknown,
    options: SpotifyPublicConfigurationParseOptions,
  ): ConfigurationParseResult<SpotifyRedirectUri> {
    if (typeof input !== "string" || input.trim().length === 0) {
      return failed(
        configurationFailure(
          "$.spotify.redirectUri",
          "expected-https-spotify-callback",
        ),
      );
    }

    if (input !== input.trim()) {
      return failed(
        configurationFailure(
          "$.spotify.redirectUri",
          "expected-https-spotify-callback",
        ),
      );
    }

    const parsedRedirectUri = parseUrl(input);
    if (parsedRedirectUri.kind === "failure") {
      return parsedRedirectUri;
    }

    const redirectUri = parsedRedirectUri.value;
    const hasExactCallbackPath = redirectUri.pathname === "/spotify/";
    const hasNoCredentials =
      redirectUri.username === "" && redirectUri.password === "";
    const hasNoQuery = redirectUri.search === "";
    const hasNoFragment = redirectUri.hash === "";

    if (
      redirectUri.protocol !== "https:" ||
      !hasExactCallbackPath ||
      !hasNoCredentials ||
      !hasNoQuery ||
      !hasNoFragment
    ) {
      return failed(
        configurationFailure(
          "$.spotify.redirectUri",
          "expected-https-spotify-callback",
        ),
      );
    }

    if (redirectUri.origin !== options.applicationUrl.origin) {
      return failed(
        configurationFailure(
          "$.spotify.redirectUri",
          "expected-same-origin-callback",
        ),
      );
    }

    return succeeded(new SpotifyRedirectUri(input, redirectUri.origin));
  }

  toAuthorizationParameter(): string {
    return this.value;
  }

  matchesCallbackUrl(callbackUrl: URL): boolean {
    return (
      callbackUrl.origin === this.origin &&
      callbackUrl.pathname === "/spotify/" &&
      callbackUrl.username === "" &&
      callbackUrl.password === "" &&
      callbackUrl.hash === ""
    );
  }
}

export function parseSpotifyPublicConfiguration(
  input: unknown,
  options: SpotifyPublicConfigurationParseOptions,
): ConfigurationParseResult<SpotifyPublicConfiguration> {
  const source = parseObject(input, "$");
  if (source.kind === "failure") {
    return source;
  }

  const rootFields = rejectUnexpectedOwnFields(source.value, ["spotify"], "$");
  if (rootFields.kind === "failure") {
    return rootFields;
  }

  const spotifyValue = readOwnDataProperty(
    source.value,
    "spotify",
    "$.spotify",
  );
  if (spotifyValue.kind === "failure") {
    return spotifyValue;
  }

  const spotify = parseObject(spotifyValue.value, "$.spotify");
  if (spotify.kind === "failure") {
    return spotify;
  }

  const spotifyFields = rejectUnexpectedOwnFields(
    spotify.value,
    ["clientId", "redirectUri"],
    "$.spotify",
  );
  if (spotifyFields.kind === "failure") {
    return spotifyFields;
  }

  const clientIdValue = readOwnDataProperty(
    spotify.value,
    "clientId",
    "$.spotify.clientId",
  );
  if (clientIdValue.kind === "failure") {
    return clientIdValue;
  }

  const clientId = SpotifyClientId.parse(clientIdValue.value);
  if (clientId.kind === "failure") {
    return clientId;
  }

  const redirectUriValue = readOwnDataProperty(
    spotify.value,
    "redirectUri",
    "$.spotify.redirectUri",
  );
  if (redirectUriValue.kind === "failure") {
    return redirectUriValue;
  }

  const redirectUri = SpotifyRedirectUri.parse(redirectUriValue.value, options);
  if (redirectUri.kind === "failure") {
    return redirectUri;
  }

  const configuration: SpotifyPublicConfiguration = {
    spotify: {
      clientId: clientId.value,
      redirectUri: redirectUri.value,
    },
  };

  return succeeded(configuration);
}

function parseObject(
  input: unknown,
  path: ConfigurationPath,
): ConfigurationParseResult<object> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(configurationFailure(path, "expected-object"));
  }

  return succeeded(input);
}

function rejectUnexpectedOwnFields(
  source: object,
  allowedFields: ReadonlyArray<string>,
  path: "$" | "$.spotify",
): ConfigurationParseResult<object> {
  const fieldNames = Object.getOwnPropertyNames(source);
  for (const fieldName of fieldNames) {
    if (allowedFields.includes(fieldName)) {
      continue;
    }

    const code = isSecretShapedField(fieldName)
      ? "secret-shaped-field"
      : "unexpected-field";
    return failed(configurationFailure(path, code));
  }

  if (Object.getOwnPropertySymbols(source).length > 0) {
    return failed(configurationFailure(path, "unexpected-field"));
  }

  return succeeded(source);
}

function readOwnDataProperty(
  source: object,
  fieldName: string,
  path: ConfigurationPath,
): ConfigurationParseResult<unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failed(configurationFailure(path, "missing-value"));
  }

  if (!("value" in descriptor)) {
    return failed(configurationFailure(path, "expected-data-property"));
  }

  return succeeded(descriptor.value);
}

function parseUrl(input: string): ConfigurationParseResult<URL> {
  try {
    return succeeded(new URL(input));
  } catch {
    return failed(
      configurationFailure(
        "$.spotify.redirectUri",
        "expected-https-spotify-callback",
      ),
    );
  }
}

function isSecretShapedField(fieldName: string): boolean {
  const normalizedFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const secretFragments: ReadonlyArray<string> = [
    "apikey",
    "credential",
    "password",
    "privatekey",
    "secret",
    "token",
  ];

  return secretFragments.some((fragment) =>
    normalizedFieldName.includes(fragment),
  );
}

function succeeded<Value>(value: Value): ConfigurationParseSuccess<Value> {
  const result: ConfigurationParseSuccess<Value> = {
    kind: "success",
    value,
  };

  return result;
}

function failed(
  error: SpotifyPublicConfigurationParseFailure,
): ConfigurationParseFailure {
  const result: ConfigurationParseFailure = {
    kind: "failure",
    error,
  };

  return result;
}

function configurationFailure(
  path: ConfigurationPath,
  code: SpotifyPublicConfigurationParseFailure["code"],
): SpotifyPublicConfigurationParseFailure {
  const failure: SpotifyPublicConfigurationParseFailure = {
    kind: "invalid-spotify-public-configuration",
    path,
    code,
  };

  return failure;
}
