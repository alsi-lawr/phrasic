import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpotifyAuthFetchPort,
  parseSpotifyRefreshTokenResponse,
  type SpotifyAuthFetchRequest,
} from "../../../browser/auth/token.ts";

type CapturedFetchState =
  | {
      readonly kind: "not-called";
    }
  | {
      readonly kind: "called";
      readonly url: string;
      readonly method: string | undefined;
      readonly contentType: string | null;
      readonly authorization: string | null;
      readonly body: string;
    };

type FetchCapture = {
  current: CapturedFetchState;
};

test("browser token fetch uses a form POST without an authorization header", async () => {
  const capture: FetchCapture = {
    current: Object.freeze({ kind: "not-called" }),
  };
  const fetch = createSpotifyAuthFetchPort(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const body = init?.body;
      if (typeof body !== "string") {
        throw new Error("Expected a string form body.");
      }

      const headers = new Headers(init?.headers);
      capture.current = Object.freeze({
        kind: "called",
        url: fetchUrl(input),
        method: init?.method,
        contentType: headers.get("Content-Type"),
        authorization: headers.get("Authorization"),
        body,
      });
      return new Response(JSON.stringify({ access_token: "not-used" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
  );
  const request: SpotifyAuthFetchRequest = {
    url: new URL("https://accounts.spotify.com/api/token"),
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: "grant_type=refresh_token&client_id=browser-client-id",
    signal: new AbortController().signal,
  };

  const result = await fetch.fetch(request);

  assert.equal(result.kind, "response");
  assert.equal(capture.current.kind, "called");
  if (capture.current.kind === "called") {
    assert.equal(capture.current.url, "https://accounts.spotify.com/api/token");
    assert.equal(capture.current.method, "POST");
    assert.equal(
      capture.current.contentType,
      "application/x-www-form-urlencoded",
    );
    assert.equal(capture.current.authorization, null);
    assert.equal(capture.current.body, request.body);
  }
});

test("refresh token payloads keep seconds distinct from milliseconds and reject invalid lifetimes", () => {
  const parsed = parseSpotifyRefreshTokenResponse({
    access_token: "refreshed-access-token",
    expires_in: 3_600,
  });
  const invalid = parseSpotifyRefreshTokenResponse({
    access_token: "refreshed-access-token",
    expires_in: 0,
  });

  assert.equal(parsed.kind, "success");
  if (parsed.kind === "success") {
    assert.equal(parsed.value.expiresIn.toSeconds(), 3_600);
    assert.equal(parsed.value.expiresIn.toMilliseconds(), 3_600_000);
    assert.deepEqual(parsed.value.refreshToken, {
      kind: "refresh-token-retained",
    });
  }
  assert.deepEqual(expectFailure(invalid), {
    kind: "invalid-spotify-token-response",
    exchange: "refresh-token",
    path: "$.expires_in",
    code: "expected-positive-safe-integer-seconds",
  });
});

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function expectFailure(
  result: ReturnType<typeof parseSpotifyRefreshTokenResponse>,
) {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a token response parse failure.");
}
