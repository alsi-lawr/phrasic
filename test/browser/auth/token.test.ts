import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  createSpotifyAuthFetchPort,
  type SpotifyAuthFetchRequest,
} from "../../../browser/auth/spotify-auth-fetch.ts";
import type { BrowserFetch } from "../../../browser/fetch.ts";
import { parseSpotifyRefreshTokenResponse } from "../../../browser/auth/token.ts";
import { createBrowserRequestDeadlinePort } from "../../../browser/request-deadline.ts";
import { ManualRequestDeadlineScheduler } from "../request-deadline.fixture.ts";

const testRequestDeadlineMilliseconds = 25;

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

type AbortableFetchCapture = {
  latestSignal: AbortSignal | undefined;
  requestCount: number;
};

test("browser token fetch uses a form POST without an authorization header", async () => {
  const capture: FetchCapture = {
    current: Object.freeze({ kind: "not-called" }),
  };
  const scheduler = new ManualRequestDeadlineScheduler();
  const authFetch = createSpotifyAuthFetchPort({
    fetchImplementation: async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
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
    requestDeadline: createBrowserRequestDeadlinePort(scheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });
  const request = tokenRequest(new AbortController().signal);

  const result = await authFetch.fetch(request);

  assert.equal(result.kind, "response");
  if (result.kind === "response") {
    assert.deepEqual(await result.response.readJson(), {
      kind: "json",
      value: { access_token: "not-used" },
    });
  }
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
  assert.deepEqual(scheduler.activeDelays(), []);
  assert.equal(scheduler.cancelledDeadlineCount, 1);
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

test("browser token fetch aborts a non-settling request at its injected deadline and cleans it up", async () => {
  const capture: AbortableFetchCapture = {
    latestSignal: undefined,
    requestCount: 0,
  };
  const scheduler = new ManualRequestDeadlineScheduler();
  const authFetch = createSpotifyAuthFetchPort({
    fetchImplementation: abortableNeverSettlingFetch(capture),
    requestDeadline: createBrowserRequestDeadlinePort(scheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });

  const request = authFetch.fetch(tokenRequest(new AbortController().signal));

  assert.equal(capture.requestCount, 1);
  assert.deepEqual(scheduler.activeDelays(), [testRequestDeadlineMilliseconds]);

  scheduler.runNextWithDelay(testRequestDeadlineMilliseconds);

  assert.deepEqual(await request, { kind: "network-failure" });
  assert.equal(capture.latestSignal?.aborted, true);
  assert.deepEqual(scheduler.activeDelays(), []);
  assert.equal(scheduler.cancelledDeadlineCount, 1);
});

test("browser token fetch immediately forwards caller abort and cancels its deadline", async () => {
  const capture: AbortableFetchCapture = {
    latestSignal: undefined,
    requestCount: 0,
  };
  const scheduler = new ManualRequestDeadlineScheduler();
  const authFetch = createSpotifyAuthFetchPort({
    fetchImplementation: abortableNeverSettlingFetch(capture),
    requestDeadline: createBrowserRequestDeadlinePort(scheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });
  const caller = new AbortController();

  const request = authFetch.fetch(tokenRequest(caller.signal));
  caller.abort();

  assert.deepEqual(await request, { kind: "network-failure" });
  assert.equal(capture.latestSignal?.aborted, true);
  assert.deepEqual(scheduler.activeDelays(), []);
  assert.equal(scheduler.cancelledDeadlineCount, 1);
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

function tokenRequest(signal: AbortSignal): SpotifyAuthFetchRequest {
  return Object.freeze({
    url: new URL("https://accounts.spotify.com/api/token"),
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: "grant_type=refresh_token&client_id=browser-client-id",
    signal,
  });
}

function abortableNeverSettlingFetch(
  capture: AbortableFetchCapture,
): BrowserFetch {
  const fetch: BrowserFetch = (_input, init): Promise<Response> => {
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

function expectFailure(
  result: ReturnType<typeof parseSpotifyRefreshTokenResponse>,
) {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a token response parse failure.");
}
