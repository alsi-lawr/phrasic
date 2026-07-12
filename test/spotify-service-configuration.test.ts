import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyServiceConfiguration,
  type SpotifyServiceConfigurationParseFailure,
} from "../services/SpotifyClient/SpotifyServiceConfiguration.ts";
import type { Result } from "../domain/playback.ts";

const validConfiguration = {
  authorization: {
    authorizationAddress: "https://accounts.spotify.com/authorize",
    scopes:
      "user-read-playback-state user-read-currently-playing user-modify-playback-state",
    responseType: "code",
    callbackAddress: "http://localhost:3000/nowplaying",
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
    authTokenRefreshIntervalMs: 30_000,
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
  assert.equal(configuration.trackAgent.spotifyTrackRefreshIntervalMs, 5_000);
  assert.equal(configuration.trackAgent.artworkSize, "large");
  assert.equal(
    configuration.refresh.authTokenRefreshAddress,
    "https://accounts.spotify.com/api/token",
  );
  assert.equal(configuration.refresh.authTokenRefreshIntervalMs, 30_000);
});

test("Spotify service configuration rejects malformed objects and values", () => {
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
        refresh: {
          ...validConfiguration.refresh,
          authTokenRefreshIntervalMs: 0,
        },
      },
      expected: configurationFailure(
        "$.refresh.authTokenRefreshIntervalMs",
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
