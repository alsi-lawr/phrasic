import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyAccessTokenRefreshResponse,
  parseSpotifyAuthorizationCodeTokenResponse,
  type SpotifyTokenResponseParseFailure,
} from "../services/SpotifyClient/SpotifyTokenResponse.ts";
import {
  maximumPlatformTimerDelayMilliseconds,
  type Result,
} from "../domain/playback.ts";

test("Spotify authorization-code token responses parse access and refresh tokens", () => {
  const response = expectSuccess(
    parseSpotifyAuthorizationCodeTokenResponse({
      access_token: "initial-access-token",
      expires_in: 3_600,
      refresh_token: "initial-refresh-token",
    }),
  );

  assert.equal(response.accessToken.value, "initial-access-token");
  assert.equal(response.expiresInSeconds.value, 3_600);
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

  assert.equal(response.accessToken.value, "refreshed-access-token");
  assert.equal(response.expiresInSeconds.value, 1_800);
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

test("Spotify token responses reject lifetimes beyond the timer-safe boundary", () => {
  const maximumExpiresInSeconds = Math.floor(
    maximumPlatformTimerDelayMilliseconds / 1_000,
  );
  const validResponse = expectSuccess(
    parseSpotifyAccessTokenRefreshResponse({
      access_token: "refreshed-access-token",
      expires_in: maximumExpiresInSeconds,
    }),
  );
  const invalidResponse = parseSpotifyAccessTokenRefreshResponse({
    access_token: "refreshed-access-token",
    expires_in: maximumExpiresInSeconds + 1,
  });

  assert.equal(validResponse.expiresInSeconds.value, maximumExpiresInSeconds);
  assert.deepEqual(expectFailure(invalidResponse), {
    kind: "invalid-spotify-token-response",
    exchange: "refresh-token",
    path: "$.expires_in",
    code: "expected-positive-integer",
  });
});

test("Spotify token responses reject inherited required fields", () => {
  const inheritedAccessToken: object = Object.create({
    access_token: "inherited-access-token",
  });
  const authorizationCodeWithInheritedAccessToken = {
    expires_in: 3_600,
    refresh_token: "refresh-token",
  };
  Object.setPrototypeOf(
    authorizationCodeWithInheritedAccessToken,
    inheritedAccessToken,
  );

  const inheritedExpiry: object = Object.create({ expires_in: 3_600 });
  const authorizationCodeWithInheritedExpiry = {
    access_token: "access-token",
    refresh_token: "refresh-token",
  };
  Object.setPrototypeOf(authorizationCodeWithInheritedExpiry, inheritedExpiry);

  const inheritedRefreshToken: object = Object.create({
    refresh_token: "inherited-refresh-token",
  });
  const authorizationCodeWithInheritedRefreshToken = {
    access_token: "access-token",
    expires_in: 3_600,
  };
  Object.setPrototypeOf(
    authorizationCodeWithInheritedRefreshToken,
    inheritedRefreshToken,
  );

  const refreshWithInheritedAccessToken: unknown = Object.create({
    access_token: "inherited-access-token",
    expires_in: 1_800,
  });

  assert.deepEqual(
    expectFailure(
      parseSpotifyAuthorizationCodeTokenResponse(
        authorizationCodeWithInheritedAccessToken,
      ),
    ),
    tokenFailure("authorization-code", "$.access_token", "missing-value"),
  );
  assert.deepEqual(
    expectFailure(
      parseSpotifyAuthorizationCodeTokenResponse(
        authorizationCodeWithInheritedExpiry,
      ),
    ),
    tokenFailure("authorization-code", "$.expires_in", "missing-value"),
  );
  assert.deepEqual(
    expectFailure(
      parseSpotifyAuthorizationCodeTokenResponse(
        authorizationCodeWithInheritedRefreshToken,
      ),
    ),
    tokenFailure("authorization-code", "$.refresh_token", "missing-value"),
  );
  assert.deepEqual(
    expectFailure(
      parseSpotifyAccessTokenRefreshResponse(refreshWithInheritedAccessToken),
    ),
    tokenFailure("refresh-token", "$.access_token", "missing-value"),
  );
});

function tokenFailure(
  exchange: SpotifyTokenResponseParseFailure["exchange"],
  path: SpotifyTokenResponseParseFailure["path"],
  code: SpotifyTokenResponseParseFailure["code"],
): SpotifyTokenResponseParseFailure {
  return {
    kind: "invalid-spotify-token-response",
    exchange,
    path,
    code,
  };
}

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
