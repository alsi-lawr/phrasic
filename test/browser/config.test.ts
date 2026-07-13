import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfigurationParseFailure,
} from "../../browser/config.ts";

type Result<Value, Failure> =
  | {
      readonly kind: "success";
      readonly value: Value;
    }
  | {
      readonly kind: "failure";
      readonly error: Failure;
    };

const applicationUrl = new URL("https://nowplaying.example/nowplaying");
const validConfiguration = Object.freeze({
  spotify: Object.freeze({
    clientId: "browser-client-id",
    redirectUri: "https://nowplaying.example/spotify/",
  }),
});

test("browser configuration accepts only the public Spotify client settings", () => {
  const configuration = expectSuccess(
    parseSpotifyPublicConfiguration(validConfiguration, { applicationUrl }),
  );

  assert.equal(
    configuration.spotify.clientId.toAuthorizationParameter(),
    "browser-client-id",
  );
  assert.equal(
    configuration.spotify.redirectUri.toAuthorizationParameter(),
    "https://nowplaying.example/spotify/",
  );
  assert.equal(
    configuration.spotify.redirectUri.matchesCallbackUrl(
      new URL(
        "https://nowplaying.example/spotify/?code=authorization-code&state=state",
      ),
    ),
    true,
  );
  assert.equal(
    configuration.spotify.redirectUri.matchesCallbackUrl(
      new URL(
        "https://nowplaying.example/not-spotify/?code=authorization-code",
      ),
    ),
    false,
  );
});

test("browser configuration rejects extra and secret-shaped settings", () => {
  const scenarios: ReadonlyArray<{
    readonly source: unknown;
    readonly expected: SpotifyPublicConfigurationParseFailure;
  }> = [
    {
      source: {
        ...validConfiguration,
        diagnostics: true,
      },
      expected: configurationFailure("$", "unexpected-field"),
    },
    {
      source: {
        spotify: {
          ...validConfiguration.spotify,
          authorizationScope: "user-read-email",
        },
      },
      expected: configurationFailure("$.spotify", "unexpected-field"),
    },
    {
      source: {
        spotify: {
          ...validConfiguration.spotify,
          clientSecret: "must-not-reach-browser-code",
        },
      },
      expected: configurationFailure("$.spotify", "secret-shaped-field"),
    },
    {
      source: {
        spotify: {
          ...validConfiguration.spotify,
          client_secret: "must-not-reach-browser-code",
        },
      },
      expected: configurationFailure("$.spotify", "secret-shaped-field"),
    },
    {
      source: {
        spotify: {
          ...validConfiguration.spotify,
          authorizationCredential: "must-not-reach-browser-code",
        },
      },
      expected: configurationFailure("$.spotify", "secret-shaped-field"),
    },
    {
      source: {
        ...validConfiguration,
        refresh_token: "must-not-reach-browser-code",
      },
      expected: configurationFailure("$", "secret-shaped-field"),
    },
  ];

  for (const scenario of scenarios) {
    assert.deepEqual(
      expectFailure(
        parseSpotifyPublicConfiguration(scenario.source, { applicationUrl }),
      ),
      scenario.expected,
    );
  }
});

test("browser configuration requires own data properties", () => {
  const accessorConfiguration = {
    spotify: validConfiguration.spotify,
  };
  Object.defineProperty(accessorConfiguration, "spotify", {
    get(): unknown {
      return validConfiguration.spotify;
    },
  });

  assert.deepEqual(
    expectFailure(
      parseSpotifyPublicConfiguration(accessorConfiguration, {
        applicationUrl,
      }),
    ),
    configurationFailure("$.spotify", "expected-data-property"),
  );
  assert.deepEqual(
    expectFailure(
      parseSpotifyPublicConfiguration(
        {
          spotify: {
            clientId: "browser-client-id",
          },
        },
        { applicationUrl },
      ),
    ),
    configurationFailure("$.spotify.redirectUri", "missing-value"),
  );
});

test("browser configuration requires an HTTPS same-origin Spotify callback", () => {
  const scenarios: ReadonlyArray<{
    readonly redirectUri: string;
    readonly expectedCode: SpotifyPublicConfigurationParseFailure["code"];
  }> = [
    {
      redirectUri: "http://nowplaying.example/spotify/",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://nowplaying.example/spotify",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://nowplaying.example/callback/",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://user:password@nowplaying.example/spotify/",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://nowplaying.example/spotify/?setup=1",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://nowplaying.example/spotify/#fragment",
      expectedCode: "expected-https-spotify-callback",
    },
    {
      redirectUri: "https://other.example/spotify/",
      expectedCode: "expected-same-origin-callback",
    },
  ];

  for (const scenario of scenarios) {
    assert.deepEqual(
      expectFailure(
        parseSpotifyPublicConfiguration(
          {
            spotify: {
              ...validConfiguration.spotify,
              redirectUri: scenario.redirectUri,
            },
          },
          { applicationUrl },
        ),
      ),
      configurationFailure("$.spotify.redirectUri", scenario.expectedCode),
    );
  }
});

function configurationFailure(
  path: SpotifyPublicConfigurationParseFailure["path"],
  code: SpotifyPublicConfigurationParseFailure["code"],
): SpotifyPublicConfigurationParseFailure {
  return {
    kind: "invalid-spotify-public-configuration",
    path,
    code,
  };
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful browser configuration parse");
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed browser configuration parse");
}
