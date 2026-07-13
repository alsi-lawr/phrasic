import assert from "node:assert/strict";
import test from "node:test";
import { SpotifyAccessToken } from "../../../browser/auth/token.ts";
import type { PlaybackProviderPort } from "../../../browser/providers/registry.ts";
import { createSpotifyPlaybackProvider } from "../../../browser/providers/spotify.ts";
import { createBrowserRequestDeadlinePort } from "../../../browser/request-deadline.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./spotify-payload.fixture.ts";
import { ManualRequestDeadlineScheduler } from "../request-deadline.fixture.ts";

const testRequestDeadlineMilliseconds = 25;

test("the Spotify playback provider normalizes 200 track and episode playback through the episode-capable endpoint", async () => {
  const requests: CapturedFetchRequest[] = [];
  const fixture = playbackProviderFixture(
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
  const provider = fixture.provider;

  const track = await provider.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });
  const episode = await provider.fetchCurrentlyPlaying({
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
  assert.equal(fixture.scheduler.cancelledDeadlineCount, 2);
  assert.equal(provider.providerId.value, "spotify");
});

test("the Spotify playback provider keeps non-playback HTTP outcomes provider-safe", async () => {
  const fixture = playbackProviderFixture(
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
  const provider = fixture.provider;
  const request = {
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  };

  const empty = await provider.fetchCurrentlyPlaying(request);
  const limited = await provider.fetchCurrentlyPlaying(request);
  const invalidRetryAfter = await provider.fetchCurrentlyPlaying(request);
  const malformed = await provider.fetchCurrentlyPlaying(request);
  const unauthorized = await provider.fetchCurrentlyPlaying(request);
  const forbidden = await provider.fetchCurrentlyPlaying(request);
  const serverFailure = await provider.fetchCurrentlyPlaying(request);
  const unexpected = await provider.fetchCurrentlyPlaying(request);

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

test("the Spotify playback provider maps a rejected fetch to a provider-safe network failure", async () => {
  const fixture = playbackProviderFixture(async (): Promise<Response> => {
    throw new Error("network failure sentinel");
  });
  const provider = fixture.provider;

  const result = await provider.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, { kind: "network-failure" });
});

test("the Spotify playback provider aborts a non-settling request at its injected deadline and cleans it up", async () => {
  const capture: AbortableFetchCapture = {
    latestSignal: undefined,
    requestCount: 0,
  };
  const fixture = playbackProviderFixture(abortableNeverSettlingFetch(capture));

  const request = fixture.provider.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: new AbortController().signal,
  });

  assert.equal(capture.requestCount, 1);
  assert.deepEqual(fixture.scheduler.activeDelays(), [
    testRequestDeadlineMilliseconds,
  ]);

  fixture.scheduler.runNextWithDelay(testRequestDeadlineMilliseconds);

  assert.deepEqual(await request, { kind: "network-failure" });
  assert.equal(capture.latestSignal?.aborted, true);
  assert.deepEqual(fixture.scheduler.activeDelays(), []);
  assert.equal(fixture.scheduler.cancelledDeadlineCount, 1);
});

test("the Spotify playback provider immediately forwards caller abort and cancels its deadline", async () => {
  const capture: AbortableFetchCapture = {
    latestSignal: undefined,
    requestCount: 0,
  };
  const fixture = playbackProviderFixture(abortableNeverSettlingFetch(capture));
  const caller = new AbortController();

  const request = fixture.provider.fetchCurrentlyPlaying({
    accessToken: accessToken("worker-access-token"),
    signal: caller.signal,
  });
  caller.abort();

  assert.deepEqual(await request, { kind: "network-failure" });
  assert.equal(capture.latestSignal?.aborted, true);
  assert.deepEqual(fixture.scheduler.activeDelays(), []);
  assert.equal(fixture.scheduler.cancelledDeadlineCount, 1);
});

type CapturedFetchRequest = {
  readonly authorization: string | null;
  readonly method: string | undefined;
  readonly url: string;
};

type AbortableFetchCapture = {
  latestSignal: AbortSignal | undefined;
  requestCount: number;
};

type SpotifyPlaybackProviderFixture = {
  readonly scheduler: ManualRequestDeadlineScheduler;
  readonly provider: PlaybackProviderPort;
};

function playbackProviderFixture(
  fetchImplementation: typeof globalThis.fetch,
): SpotifyPlaybackProviderFixture {
  const scheduler = new ManualRequestDeadlineScheduler();
  const provider = createSpotifyPlaybackProvider({
    fetchImplementation,
    requestDeadline: createBrowserRequestDeadlinePort(scheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });

  return Object.freeze({ scheduler, provider });
}

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

function abortableNeverSettlingFetch(
  capture: AbortableFetchCapture,
): typeof globalThis.fetch {
  const fetch: typeof globalThis.fetch = (_input, init): Promise<Response> => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      return Promise.reject(new Error("Expected a request deadline signal."));
    }

    capture.latestSignal = signal;
    capture.requestCount += 1;
    return rejectedWhenAborted(signal);
  };

  return fetch;
}

function rejectedWhenAborted(signal: AbortSignal): Promise<Response> {
  return new Promise<void>((resolve): void => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener(
      "abort",
      (): void => {
        resolve();
      },
      { once: true },
    );
  }).then((): never => {
    throw new Error("Request aborted.");
  });
}

function accessToken(value: string): SpotifyAccessToken {
  const parsed = SpotifyAccessToken.parse(value);
  if (parsed.kind === "failure") {
    throw new Error("Expected a valid Spotify access token fixture.");
  }

  return parsed.value;
}
