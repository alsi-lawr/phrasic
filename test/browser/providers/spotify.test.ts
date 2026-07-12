import assert from "node:assert/strict";
import test from "node:test";
import { createSpotifyCurrentlyPlayingPort } from "../../../browser/providers/spotify.ts";
import { SpotifyAccessToken } from "../../../browser/auth/token.ts";
import { playingTrackPayload } from "../../spotify-playback.fixture.ts";

test("the Spotify worker transport requests the episode-capable playback endpoint without exposing its payload", async () => {
  const requests: CapturedFetchRequest[] = [];
  const transport = createSpotifyCurrentlyPlayingPort(
    queuedFetch(
      [
        new Response(JSON.stringify(playingTrackPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ],
      requests,
    ),
  );

  const result = await transport.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });

  assert.equal(result.kind, "playback");
  if (result.kind === "playback") {
    assert.equal(result.state.kind, "playing");
  }
  assert.deepEqual(requests, [
    {
      url: "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode",
      method: "GET",
      authorization: "Bearer worker-access-token",
    },
  ]);
});

test("the Spotify worker transport keeps 204, rate-limit, and malformed JSON outcomes provider-safe", async () => {
  const transport = createSpotifyCurrentlyPlayingPort(
    queuedFetch([
      new Response(null, { status: 204 }),
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "7" },
      }),
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "not-a-delay" },
      }),
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]),
  );
  const request = {
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  };

  const empty = await transport.fetchCurrentlyPlaying(request);
  const limited = await transport.fetchCurrentlyPlaying(request);
  const invalidRetryAfter = await transport.fetchCurrentlyPlaying(request);
  const malformed = await transport.fetchCurrentlyPlaying(request);

  assert.deepEqual(empty, { kind: "empty" });
  assert.deepEqual(limited, {
    kind: "rate-limited",
    status: 429,
    retryAfter: { kind: "valid", delayMilliseconds: 7_000 },
  });
  assert.deepEqual(invalidRetryAfter, {
    kind: "rate-limited",
    status: 429,
    retryAfter: { kind: "invalid-or-missing" },
  });
  assert.deepEqual(malformed, { kind: "malformed-response" });
});

type CapturedFetchRequest = {
  readonly authorization: string | null;
  readonly method: string | undefined;
  readonly url: string;
};

function queuedFetch(
  responses: ReadonlyArray<Response>,
  capturedRequests: CapturedFetchRequest[] = [],
): typeof globalThis.fetch {
  const queue = [...responses];
  const fetch: typeof globalThis.fetch = async (
    input,
    init,
  ): Promise<Response> => {
    const response = queue.shift();
    if (response === undefined) {
      throw new Error("Unexpected Spotify worker fetch.");
    }

    const headers = new Headers(init?.headers);
    capturedRequests.push({
      url: fetchUrl(input),
      method: init?.method,
      authorization: headers.get("Authorization"),
    });
    return response;
  };

  return fetch;
}

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function accessToken(value: string): SpotifyAccessToken {
  const parsed = SpotifyAccessToken.parse(value);
  if (parsed.kind === "failure") {
    throw new Error("Expected a valid Spotify access token fixture.");
  }

  return parsed.value;
}
