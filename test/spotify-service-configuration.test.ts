import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyServiceConfiguration,
  type SpotifyServiceConfigurationParseFailure,
} from "../services/SpotifyClient/SpotifyServiceConfiguration.ts";
import {
  maximumPlatformTimerDelayMilliseconds,
  type Result,
} from "../domain/playback.ts";

const validConfiguration = {
  authorization: {
    authorizationAddress: "https://accounts.spotify.com/authorize",
    scopes:
      "user-read-playback-state user-read-currently-playing user-modify-playback-state",
    responseType: "code",
    callbackAddress: "http://127.0.0.1:3000/nowplaying",
    spotifyClientId: "spotify-client-id",
    spotifyClientSecret: "spotify-client-secret",
  },
  trackAgent: {
    currentlyPlayingAddress:
      "https://api.spotify.com/v1/me/player/currently-playing",
    spotifyTrackRefreshIntervalMs: 5_000,
    artworkSize: "large",
  },
  refresh: {
    authTokenRefreshAddress: "https://accounts.spotify.com/api/token",
  },
};

test("Spotify service configuration parses complete authorization, track, and refresh settings", () => {
  const configuration = expectSuccess(
    parseSpotifyServiceConfiguration(validConfiguration),
  );

  assert.equal(
    configuration.authorization.authorizationAddress,
    "https://accounts.spotify.com/authorize",
  );
  assert.deepEqual(configuration.authorization.scopes, [
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
  ]);
  assert.equal(configuration.authorization.responseType, "code");
  assert.equal(
    configuration.trackAgent.currentlyPlayingAddress,
    "https://api.spotify.com/v1/me/player/currently-playing",
  );
  assert.equal(configuration.trackAgent.playbackPollDelay.value, 5_000);
  assert.equal(configuration.trackAgent.artworkSize, "large");
  assert.equal(
    configuration.refresh.authTokenRefreshAddress,
    "https://accounts.spotify.com/api/token",
  );
});

test("Spotify service configuration permits HTTPS callbacks and IP-loopback HTTP callbacks", () => {
  const httpsCallbackConfiguration = expectSuccess(
    parseSpotifyServiceConfiguration({
      ...validConfiguration,
      authorization: {
        ...validConfiguration.authorization,
        callbackAddress: "https://nowplaying.example/callback",
      },
    }),
  );
  const ipv6LoopbackCallbackConfiguration = expectSuccess(
    parseSpotifyServiceConfiguration({
      ...validConfiguration,
      authorization: {
        ...validConfiguration.authorization,
        callbackAddress: "http://[::1]:3000/nowplaying",
      },
    }),
  );

  assert.equal(
    httpsCallbackConfiguration.authorization.callbackAddress,
    "https://nowplaying.example/callback",
  );
  assert.equal(
    ipv6LoopbackCallbackConfiguration.authorization.callbackAddress,
    "http://[::1]:3000/nowplaying",
  );
});

test("Spotify service configuration rejects insecure endpoint and callback schemes", () => {
  const cases: ReadonlyArray<{
    readonly source: unknown;
    readonly expected: SpotifyServiceConfigurationParseFailure;
  }> = [
    {
      source: null,
      expected: configurationFailure("$", "expected-object"),
    },
    {
      source: {
        ...validConfiguration,
        unexpected: true,
      },
      expected: configurationFailure("$.unexpected", "unexpected-key"),
    },
    {
      source: {
        ...validConfiguration,
        authorization: {
          ...validConfiguration.authorization,
          authorizationAddress: "http://accounts.spotify.com/authorize",
        },
      },
      expected: configurationFailure(
        "$.authorization.authorizationAddress",
        "expected-https-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        trackAgent: {
          ...validConfiguration.trackAgent,
          currentlyPlayingAddress:
            "http://api.spotify.com/v1/me/player/currently-playing",
        },
      },
      expected: configurationFailure(
        "$.trackAgent.currentlyPlayingAddress",
        "expected-https-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        refresh: {
          authTokenRefreshAddress: "http://accounts.spotify.com/api/token",
        },
      },
      expected: configurationFailure(
        "$.refresh.authTokenRefreshAddress",
        "expected-https-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        authorization: {
          ...validConfiguration.authorization,
          callbackAddress: "http://localhost:3000/nowplaying",
        },
      },
      expected: configurationFailure(
        "$.authorization.callbackAddress",
        "expected-https-or-loopback-http-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        authorization: {
          ...validConfiguration.authorization,
          callbackAddress: "http://192.168.1.20:3000/nowplaying",
        },
      },
      expected: configurationFailure(
        "$.authorization.callbackAddress",
        "expected-https-or-loopback-http-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        authorization: {
          ...validConfiguration.authorization,
          callbackAddress: "ftp://127.0.0.1/nowplaying",
        },
      },
      expected: configurationFailure(
        "$.authorization.callbackAddress",
        "expected-https-or-loopback-http-url",
      ),
    },
    {
      source: {
        ...validConfiguration,
        trackAgent: {
          ...validConfiguration.trackAgent,
          spotifyTrackRefreshIntervalMs:
            maximumPlatformTimerDelayMilliseconds + 1,
        },
      },
      expected: configurationFailure(
        "$.trackAgent.spotifyTrackRefreshIntervalMs",
        "expected-positive-integer",
      ),
    },
  ];

  for (const scenario of cases) {
    assert.deepEqual(
      expectFailure(parseSpotifyServiceConfiguration(scenario.source)),
      scenario.expected,
    );
  }
});

test("Spotify service configuration rejects inherited required fields", () => {
  const inheritedTopLevelConfiguration: unknown =
    Object.create(validConfiguration);
  const inheritedAuthorizationConfiguration: object = Object.create(
    validConfiguration.authorization,
  );
  const inheritedAuthorizationField: unknown = {
    ...validConfiguration,
    authorization: inheritedAuthorizationConfiguration,
  };

  assert.deepEqual(
    expectFailure(
      parseSpotifyServiceConfiguration(inheritedTopLevelConfiguration),
    ),
    configurationFailure("$.authorization", "missing-value"),
  );
  assert.deepEqual(
    expectFailure(
      parseSpotifyServiceConfiguration(inheritedAuthorizationField),
    ),
    configurationFailure(
      "$.authorization.authorizationAddress",
      "missing-value",
    ),
  );
});

function configurationFailure(
  path: string,
  code: SpotifyServiceConfigurationParseFailure["code"],
): SpotifyServiceConfigurationParseFailure {
  return {
    kind: "invalid-spotify-service-configuration",
    path,
    code,
  };
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Spotify service configuration parse");
}

function expectFailure<Value>(
  result: Result<Value, SpotifyServiceConfigurationParseFailure>,
): SpotifyServiceConfigurationParseFailure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed Spotify service configuration parse");
}
