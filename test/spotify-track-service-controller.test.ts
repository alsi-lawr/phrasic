import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpotifyAuthorizationUrl,
  parseSpotifyServiceConfiguration,
} from "../services/SpotifyClient/SpotifyServiceConfiguration.ts";
import type { Result } from "../domain/playback.ts";
import type {
  SpotifyServiceConfiguration,
  SpotifyServiceConfigurationParseFailure,
} from "../services/SpotifyClient/SpotifyServiceConfiguration.ts";

test("Spotify track service authorization URLs preserve redirect queries and multiple scopes", () => {
  const configuration = expectSuccess(
    parseSpotifyServiceConfiguration({
      authorization: {
        authorizationAddress:
          "https://accounts.spotify.com/authorize?show_dialog=true",
        scopes: "user-read-playback-state user-read-currently-playing",
        responseType: "code",
        callbackAddress:
          "http://localhost:3000/nowplaying?source=obs&display=main",
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
    }),
  );

  const authorizationUrl = new URL(
    buildSpotifyAuthorizationUrl(configuration.authorization),
  );

  assert.equal(authorizationUrl.searchParams.get("show_dialog"), "true");
  assert.equal(
    authorizationUrl.searchParams.get("client_id"),
    "spotify-client-id",
  );
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(
    authorizationUrl.searchParams.get("redirect_uri"),
    "http://localhost:3000/nowplaying?source=obs&display=main",
  );
  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    "user-read-playback-state user-read-currently-playing",
  );
});

function expectSuccess(
  result: Result<
    SpotifyServiceConfiguration,
    SpotifyServiceConfigurationParseFailure
  >,
): SpotifyServiceConfiguration {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Spotify service configuration parse");
}
