import assert from "node:assert/strict";
import test from "node:test";
import { createSpotifyCurrentlyPlayingPort } from "../../../browser/providers/spotify.ts";
import { SpotifyAccessToken } from "../../../browser/auth/token.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./spotify-payload.fixture.ts";

test("the Spotify worker transport normalizes 200 track and episode playback through the episode-capable endpoint", async () => {
  const requests: CapturedFetchRequest[] = [];
  const transport = createSpotifyCurrentlyPlayingPort(
    queuedFetch(
      [
        new Response(JSON.stringify(playingTrackPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        new Response(JSON.stringify(pausedEpisodePayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ],
      requests,
    ),
  );

  const track = await transport.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });
  const episode = await transport.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });

  assert.equal(track.kind, "playback");
  if (track.kind === "playback") {
    assert.equal(track.state.kind, "playing");
    if (track.state.kind === "playing") {
      assert.equal(track.state.snapshot.item.kind, "track");
    }
  }
  assert.equal(episode.kind, "playback");
  if (episode.kind === "playback") {
    assert.equal(episode.state.kind, "paused");
    if (episode.state.kind === "paused") {
      assert.equal(episode.state.snapshot.item.kind, "episode");
    }
  }
  assert.deepEqual(requests, [
    {
      url: "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode",
      method: "GET",
      authorization: "Bearer worker-access-token",
    },
    {
      url: "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode",
      method: "GET",
      authorization: "Bearer worker-access-token",
    },
  ]);
});

test("the Spotify worker transport keeps non-playback HTTP outcomes provider-safe", async () => {
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
      new Response(null, { status: 401 }),
      new Response(null, { status: 403 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 418 }),
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
  const unauthorized = await transport.fetchCurrentlyPlaying(request);
  const forbidden = await transport.fetchCurrentlyPlaying(request);
  const serverFailure = await transport.fetchCurrentlyPlaying(request);
  const unexpected = await transport.fetchCurrentlyPlaying(request);

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
  assert.deepEqual(unauthorized, { kind: "unauthorized", status: 401 });
  assert.deepEqual(forbidden, { kind: "permission-denied", status: 403 });
  assert.deepEqual(serverFailure, { kind: "server-failure", status: 503 });
  assert.deepEqual(unexpected, {
    kind: "unexpected-response",
    status: 418,
  });
});

test("the Spotify worker transport maps a rejected fetch to a provider-safe network failure", async () => {
  const transport = createSpotifyCurrentlyPlayingPort(
    async (): Promise<Response> => {
      throw new Error("network failure sentinel");
    },
  );

  const result = await transport.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, { kind: "network-failure" });
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
