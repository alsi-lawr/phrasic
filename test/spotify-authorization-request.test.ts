import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyAuthorizationRequest,
  type SpotifyAuthorizationRequestParseFailure,
} from "../app/api/spotify/authorization-request.ts";
import type { Result } from "../domain/playback.ts";

test("Spotify authorization requests accept non-empty authorization codes", () => {
  const authorizationCode = expectSuccess(
    parseSpotifyAuthorizationRequest("spotify-authorization-code"),
  );

  assert.equal(authorizationCode.value, "spotify-authorization-code");
});

test("Spotify authorization requests reject malformed authorization codes", () => {
  const malformedRequests: ReadonlyArray<unknown> = ["", null, 42];
  const expectedFailure: SpotifyAuthorizationRequestParseFailure = {
    kind: "invalid-spotify-authorization-request",
    reason: "expected-non-empty-string",
  };

  for (const malformedRequest of malformedRequests) {
    assert.deepEqual(
      expectFailure(parseSpotifyAuthorizationRequest(malformedRequest)),
      expectedFailure,
    );
  }
});

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Spotify authorization request parse");
}

function expectFailure<Value>(
  result: Result<Value, SpotifyAuthorizationRequestParseFailure>,
): SpotifyAuthorizationRequestParseFailure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed Spotify authorization request parse");
}
