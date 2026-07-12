import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyAccessTokenRefreshResponse,
  parseSpotifyAuthorizationCodeTokenResponse,
  type SpotifyTokenResponseParseFailure,
} from "../services/SpotifyClient/SpotifyTokenResponse.ts";
import type { Result } from "../domain/playback.ts";

test("Spotify authorization-code token responses parse access and refresh tokens", () => {
  const response = expectSuccess(
    parseSpotifyAuthorizationCodeTokenResponse({
      access_token: "initial-access-token",
      expires_in: 3_600,
      refresh_token: "initial-refresh-token",
    }),
  );

  assert.equal(response.accessToken, "initial-access-token");
  assert.equal(response.expiresIn, 3_600);
  assert.equal(response.refreshToken.value, "initial-refresh-token");
});

test("Spotify authorization-code token responses reject malformed refresh tokens", () => {
  const response = parseSpotifyAuthorizationCodeTokenResponse({
    access_token: "initial-access-token",
    expires_in: 3_600,
    refresh_token: "",
  });

  assert.deepEqual(expectFailure(response), {
    kind: "invalid-spotify-token-response",
    exchange: "authorization-code",
    path: "$.refresh_token",
    code: "expected-non-empty-string",
  });
});

test("Spotify refresh token responses parse access-token refreshes", () => {
  const response = expectSuccess(
    parseSpotifyAccessTokenRefreshResponse({
      access_token: "refreshed-access-token",
      expires_in: 1_800,
    }),
  );

  assert.equal(response.accessToken, "refreshed-access-token");
  assert.equal(response.expiresIn, 1_800);
});

test("Spotify refresh token responses reject malformed expiry values", () => {
  const response = parseSpotifyAccessTokenRefreshResponse({
    access_token: "refreshed-access-token",
    expires_in: 0,
  });

  assert.deepEqual(expectFailure(response), {
    kind: "invalid-spotify-token-response",
    exchange: "refresh-token",
    path: "$.expires_in",
    code: "expected-positive-integer",
  });
});

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Spotify token response parse");
}

function expectFailure<Value>(
  result: Result<Value, SpotifyTokenResponseParseFailure>,
): SpotifyTokenResponseParseFailure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed Spotify token response parse");
}
