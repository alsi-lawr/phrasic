import assert from "node:assert/strict";
import { test } from "bun:test";
import { createSpotifyAuthFetchPort } from "../../../browser/auth/spotify-auth-fetch.ts";
import type {
  PlaybackProviderPort,
  PlaybackProviderResult,
} from "../../../browser/providers/provider.ts";
import { createSpotifyPlaybackProvider } from "../../../browser/providers/spotify.ts";
import { createBrowserRequestDeadlinePort } from "../../../browser/request-deadline.ts";
import type { PlaybackWorkerEvent } from "../../../browser/worker/protocol.ts";
import {
  emptyTrackPayload,
  playingTrackPayload,
} from "../providers/spotify-payload.fixture.ts";
import { ManualRequestDeadlineScheduler } from "../request-deadline.fixture.ts";

import {
  DeferredRefreshSpotifyAuthFetch,
  DeferredSpotifyTransport,
  FakeClock,
  FakeScheduler,
  MemorySpotifyAuthStorage,
  QueuedSpotifyAuthFetch,
  QueuedSpotifyTransport,
  SynchronousFirstScheduler,
  abortableNeverSettlingFetch,
  createRuntime,
  deferredResponseFetch,
  hasTokenShapedEventField,
  initializeCommand,
  invalidGrantResponse,
  lastPlaybackState,
  playbackResult,
  playbackStateKinds,
  playbackStates,
  runtimeFixture,
  spotifyProviderId,
  tokenResponse,
  waitFor,
} from "./runtime-fixture.ts";

const testRequestDeadlineMilliseconds = 25;

test("the worker consumes provider-neutral playback results through its registry and schedules from completion", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      playbackResult(playingTrackPayload),
      playbackResult(emptyTrackPayload),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  assert.deepEqual(playbackStateKinds(fixture.events), [
    "initializing",
    "reconnecting",
    "playing",
  ]);
  assert.equal(fixture.spotify.maximumConcurrentRequests, 1);
  assert.deepEqual(fixture.scheduler.activeDelays(), [5_000, 3_540_000]);

  await fixture.scheduler.runNextWithDelay(5_000);

  assert.deepEqual(playbackStateKinds(fixture.events), [
    "initializing",
    "reconnecting",
    "playing",
    "empty",
  ]);
  assert.equal(fixture.spotify.requestCount, 2);
  assert.equal(fixture.spotify.maximumConcurrentRequests, 1);
  assert.deepEqual(fixture.scheduler.activeDelays(), [5_000, 3_540_000]);
});

test("a 401 performs one token refresh and one retry of the playback request", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [
      tokenResponse("initial-access"),
      tokenResponse("refreshed-access"),
    ],
    spotifyResponses: [
      Object.freeze({ kind: "unauthorized", status: 401 }),
      playbackResult(playingTrackPayload),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  assert.equal(fixture.authFetch.requestCount, 2);
  assert.equal(fixture.spotify.requestCount, 2);
  assert.deepEqual(playbackStateKinds(fixture.events), [
    "initializing",
    "reconnecting",
    "playing",
  ]);
  assert.equal(
    playbackStates(fixture.events).some(
      (event) =>
        event.state.kind === "authorization-required" &&
        event.state.reason === "authorization-expired",
    ),
    false,
  );
});

test("a revoked refresh after 401 clears the connection and requires authorization", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access"), invalidGrantResponse()],
    spotifyResponses: [Object.freeze({ kind: "unauthorized", status: 401 })],
  });

  await fixture.runtime.receive(initializeCommand());

  const state = lastPlaybackState(fixture.events).state;
  assert.deepEqual(state, {
    kind: "authorization-required",
    reason: "authorization-revoked",
  });
  assert.equal(fixture.authFetch.requestCount, 2);
  assert.equal(fixture.spotify.requestCount, 1);
  assert.equal(fixture.storage.connectionKind, "missing");
});

test("network failures reconnect with the capped completion-driven retry sequence", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      Object.freeze({ kind: "network-failure" }),
      Object.freeze({ kind: "network-failure" }),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  assert.equal(lastPlaybackState(fixture.events).state.kind, "reconnecting");
  assert.deepEqual(fixture.scheduler.activeDelays(), [1_000]);

  await fixture.scheduler.runNextWithDelay(1_000);

  assert.equal(lastPlaybackState(fixture.events).state.kind, "reconnecting");
  assert.deepEqual(fixture.scheduler.activeDelays(), [2_000]);
});

test("a rate limit uses the validated Retry-After delay and emits only fixed metadata", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      Object.freeze({
        kind: "rate-limited",
        status: 429,
        retryAfter: Object.freeze({ kind: "valid", delayMilliseconds: 7_000 }),
      }),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  const diagnostic = fixture.events.find(
    (event) =>
      event.kind === "safe-diagnostic" &&
      event.code === "playback-rate-limited",
  );
  if (diagnostic === undefined || diagnostic.kind !== "safe-diagnostic") {
    throw new Error("Expected a fixed rate-limit diagnostic.");
  }

  assert.deepEqual(diagnostic.metadata, {
    kind: "http-status-and-retry-after",
    status: 429,
    retryAfterMilliseconds: 7_000,
  });
  assert.deepEqual(fixture.scheduler.activeDelays(), [7_000]);
});

test("malformed playback fails safely and stops automatic worker scheduling", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [Object.freeze({ kind: "malformed-response" })],
  });

  await fixture.runtime.receive(initializeCommand());

  const state = lastPlaybackState(fixture.events).state;
  assert.deepEqual(state, {
    kind: "failure",
    error: {
      kind: "provider-failed",
      reason: "malformed-response",
    },
  });
  assert.equal(
    fixture.events.some(
      (event) =>
        event.kind === "safe-diagnostic" &&
        event.code === "playback-payload-invalid",
    ),
    true,
  );
  assert.deepEqual(fixture.scheduler.activeDelays(), []);
});

test("a 403 stops polling and requires the missing playback permission", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      Object.freeze({ kind: "permission-denied", status: 403 }),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  assert.deepEqual(lastPlaybackState(fixture.events).state, {
    kind: "authorization-required",
    reason: "permission-required",
  });
  assert.deepEqual(fixture.scheduler.activeDelays(), []);
  assert.equal(
    fixture.events.some(
      (event) =>
        event.kind === "safe-diagnostic" &&
        event.code === "playback-permission-denied" &&
        event.metadata.kind === "http-status" &&
        event.metadata.status === 403,
    ),
    true,
  );
});

test("network and 5xx failures share the capped reconnect schedule", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      Object.freeze({ kind: "network-failure" }),
      Object.freeze({ kind: "server-failure", status: 503 }),
      Object.freeze({ kind: "network-failure" }),
      Object.freeze({ kind: "server-failure", status: 500 }),
      Object.freeze({ kind: "network-failure" }),
      Object.freeze({ kind: "server-failure", status: 599 }),
      Object.freeze({ kind: "network-failure" }),
    ],
  });

  await fixture.runtime.receive(initializeCommand());

  for (const delayMilliseconds of [
    1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
  ]) {
    assert.deepEqual(fixture.scheduler.activeDelays(), [delayMilliseconds]);
    await fixture.scheduler.runNextWithDelay(delayMilliseconds);
  }

  assert.equal(fixture.spotify.requestCount, 7);
  assert.deepEqual(fixture.scheduler.activeDelays(), [30_000]);
});

test("successful polls wait for completion before scheduling the next five-second poll", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const authFetch = new QueuedSpotifyAuthFetch([
    tokenResponse("initial-access"),
  ]);
  const spotify = new DeferredSpotifyTransport();
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => spotify.requestCount === 1);

  assert.deepEqual(scheduler.activeDelays(), [3_540_000]);
  spotify.resolve(playbackResult(playingTrackPayload));
  await initialization;
  assert.deepEqual(scheduler.activeDelays(), [5_000, 3_540_000]);

  const nextPoll = scheduler.runNextWithDelay(5_000);
  await waitFor(() => spotify.requestCount === 2);

  assert.deepEqual(scheduler.activeDelays(), [3_540_000]);
  assert.equal(spotify.maximumConcurrentRequests, 1);
  spotify.resolve(playbackResult(emptyTrackPayload));
  await nextPoll;

  assert.deepEqual(scheduler.activeDelays(), [5_000, 3_540_000]);
  assert.equal(spotify.maximumConcurrentRequests, 1);
});

test("a playback request deadline enters the capped serialized reconnect schedule", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const deadlineScheduler = new ManualRequestDeadlineScheduler();
  const events: PlaybackWorkerEvent[] = [];
  const playbackFetch = abortableNeverSettlingFetch();
  const spotify = createSpotifyPlaybackProvider({
    fetchImplementation: playbackFetch.fetchImplementation,
    requestDeadline: createBrowserRequestDeadlinePort(deadlineScheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch: new QueuedSpotifyAuthFetch([tokenResponse("initial-access")]),
    spotify,
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => playbackFetch.requestCount === 1);

  assert.deepEqual(deadlineScheduler.activeDelays(), [
    testRequestDeadlineMilliseconds,
  ]);
  deadlineScheduler.runNextWithDelay(testRequestDeadlineMilliseconds);
  await initialization;

  assert.equal(playbackFetch.latestSignal?.aborted, true);
  assert.equal(playbackFetch.maximumConcurrentRequests, 1);
  assert.deepEqual(scheduler.activeDelays(), [1_000]);

  const retry = scheduler.runNextWithDelay(1_000);
  await waitFor(() => playbackFetch.requestCount === 2);

  assert.equal(playbackFetch.maximumConcurrentRequests, 1);
  assert.deepEqual(deadlineScheduler.activeDelays(), [
    testRequestDeadlineMilliseconds,
  ]);
  deadlineScheduler.runNextWithDelay(testRequestDeadlineMilliseconds);
  await retry;

  assert.equal(playbackFetch.maximumConcurrentRequests, 1);
  assert.deepEqual(scheduler.activeDelays(), [2_000]);
  assert.equal(deadlineScheduler.cancelledDeadlineCount, 2);
});

test("a token request deadline enters the capped refresh retry schedule without polling", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const deadlineScheduler = new ManualRequestDeadlineScheduler();
  const events: PlaybackWorkerEvent[] = [];
  const tokenFetch = abortableNeverSettlingFetch();
  const authFetch = createSpotifyAuthFetchPort({
    fetchImplementation: tokenFetch.fetchImplementation,
    requestDeadline: createBrowserRequestDeadlinePort(deadlineScheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });
  const spotify = new QueuedSpotifyTransport([]);
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => tokenFetch.requestCount === 1);

  assert.deepEqual(deadlineScheduler.activeDelays(), [
    testRequestDeadlineMilliseconds,
  ]);
  deadlineScheduler.runNextWithDelay(testRequestDeadlineMilliseconds);
  await initialization;

  assert.equal(tokenFetch.latestSignal?.aborted, true);
  assert.equal(tokenFetch.maximumConcurrentRequests, 1);
  assert.equal(lastPlaybackState(events).state.kind, "failure");
  assert.equal(spotify.requestCount, 0);
  assert.deepEqual(scheduler.activeDelays(), [1_000]);

  const retry = scheduler.runNextWithDelay(1_000);
  await waitFor(() => tokenFetch.requestCount === 2);

  assert.equal(tokenFetch.maximumConcurrentRequests, 1);
  deadlineScheduler.runNextWithDelay(testRequestDeadlineMilliseconds);
  await retry;

  assert.equal(tokenFetch.maximumConcurrentRequests, 1);
  assert.deepEqual(scheduler.activeDelays(), [2_000]);
  assert.equal(deadlineScheduler.cancelledDeadlineCount, 2);
});

test("the worker refreshes exactly sixty seconds before expiry without starting a second refresh flight", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const authFetch = new DeferredRefreshSpotifyAuthFetch(
    tokenResponse("initial-access", undefined, 65),
  );
  const spotify = new QueuedSpotifyTransport([
    playbackResult(playingTrackPayload),
    playbackResult(emptyTrackPayload),
  ]);
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  await runtime.receive(initializeCommand());
  assert.deepEqual(scheduler.activeDelays(), [5_000, 5_000]);

  const refresh = scheduler.runNextWithDelay(5_000);
  await waitFor(() => authFetch.requestCount === 2);
  assert.equal(clock.now(), 1_005_000);

  const scheduledPoll = scheduler.runNextWithDelay(5_000);
  assert.equal(authFetch.requestCount, 2);
  authFetch.resolve(tokenResponse("refreshed-access"));
  await refresh;
  await scheduledPoll;

  assert.equal(authFetch.requestCount, 2);
  assert.equal(spotify.requestCount, 2);
});

test("invalid worker initialization produces a fatal event before later commands are rejected", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "missing" },
    authResponses: [],
    spotifyResponses: [],
  });

  await fixture.runtime.receive({
    kind: "initialize",
    applicationUrl: "https://nowplaying.example/nowplaying",
    configuration: {
      spotify: {
        clientId: "browser-client-id",
        redirectUri: "https://nowplaying.example/spotify/",
        clientSecret: "must-not-be-accepted",
      },
    },
  });
  await fixture.runtime.receive(initializeCommand());

  assert.deepEqual(fixture.events[0], {
    kind: "fatal-initialization-failure",
    code: "invalid-public-configuration",
  });
  assert.equal(fixture.authFetch.requestCount, 0);
  assert.equal(fixture.spotify.requestCount, 0);
  assert.equal(
    fixture.events.some(
      (event) =>
        event.kind === "safe-diagnostic" &&
        event.code === "command-not-allowed",
    ),
    true,
  );
});

test("a persisted PKCE attempt is consumed after reload and never exposes token data to events", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "missing" },
    authResponses: [tokenResponse("callback-access", "callback-refresh")],
    spotifyResponses: [playbackResult(playingTrackPayload)],
  });

  await fixture.runtime.receive(initializeCommand());
  await fixture.runtime.receive({
    kind: "begin-authorization",
    returnTo: { width: 1_280, setup: true },
  });

  const redirect = fixture.events.find(
    (event) => event.kind === "authorization-redirect",
  );
  if (redirect === undefined || redirect.kind !== "authorization-redirect") {
    throw new Error("Expected a Spotify authorization redirect.");
  }

  const state = new URL(redirect.url).searchParams.get("state");
  if (state === null) {
    throw new Error("Expected a PKCE state in the authorization redirect.");
  }

  await fixture.runtime.receive({
    kind: "consume-callback",
    callbackUrl: `https://nowplaying.example/spotify/?code=callback-code&state=${state}`,
  });

  assert.equal(lastPlaybackState(fixture.events).state.kind, "playing");
  assert.equal(
    fixture.events.some(
      (event) =>
        event.kind === "callback-url-restored" &&
        event.url === "https://nowplaying.example/spotify/?width=1280&setup=1",
    ),
    true,
  );
  assert.equal(fixture.authFetch.requestCount, 1);
  assert.equal(fixture.storage.connectionKind, "found");
  assert.equal(
    fixture.events.some((event) => hasTokenShapedEventField(event)),
    false,
  );
});

test("logout aborts a late token response before it can commit state or rotated storage", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const deadlineScheduler = new ManualRequestDeadlineScheduler();
  const events: PlaybackWorkerEvent[] = [];
  const tokenFetch = deferredResponseFetch();
  const authFetch = createSpotifyAuthFetchPort({
    fetchImplementation: tokenFetch.fetchImplementation,
    requestDeadline: createBrowserRequestDeadlinePort(deadlineScheduler),
    timeoutMilliseconds: testRequestDeadlineMilliseconds,
  });
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify: new QueuedSpotifyTransport([]),
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => tokenFetch.requestCount === 1);

  const logout = runtime.receive({ kind: "logout" });
  const eventCountAfterLogout = events.length;
  assert.equal(tokenFetch.latestSignal?.aborted, true);
  assert.deepEqual(deadlineScheduler.activeDelays(), []);

  tokenFetch.resolve(
    new Response(
      JSON.stringify({
        access_token: "late-access-token",
        expires_in: 3_600,
        refresh_token: "late-refresh-token",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
  await initialization;
  await logout;

  assert.equal(storage.refreshTokenSaveCount, 1);
  assert.equal(storage.connectionKind, "missing");
  assert.deepEqual(scheduler.activeDelays(), []);
  assert.equal(events.length, eventCountAfterLogout);
  assert.deepEqual(lastPlaybackState(events).state, {
    kind: "authorization-required",
    reason: "not-authorized",
  });
});

test("logout aborts an active request, clears memory, and rejects a late playback result", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const authFetch = new QueuedSpotifyAuthFetch([
    tokenResponse("initial-access"),
  ]);
  const spotify = new DeferredSpotifyTransport();
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => spotify.requestCount === 1);

  const logout = runtime.receive({ kind: "logout" });
  assert.equal(spotify.latestSignal?.aborted, true);
  const logoutEventPosition = events.length;

  spotify.resolve(playbackResult(playingTrackPayload));
  await initialization;
  await logout;

  assert.equal(lastPlaybackState(events).state.kind, "authorization-required");
  assert.equal(storage.connectionKind, "missing");
  assert.equal(
    playbackStates(events)
      .slice(logoutEventPosition)
      .some((event) => event.state.kind === "playing"),
    false,
  );
});

test("dispose aborts an active request without committing its late playback state", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const authFetch = new QueuedSpotifyAuthFetch([
    tokenResponse("initial-access"),
  ]);
  const spotify = new DeferredSpotifyTransport();
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  const initialization = runtime.receive(initializeCommand());
  await waitFor(() => spotify.requestCount === 1);

  await runtime.receive({ kind: "dispose" });
  assert.equal(spotify.latestSignal?.aborted, true);
  const eventCountAtDispose = events.length;

  spotify.resolve(playbackResult(playingTrackPayload));
  await initialization;

  assert.equal(events.length, eventCountAtDispose);
  assert.equal(storage.connectionKind, "found");
});

test("a reconnect exposes the last item only in memory, then logout and reinitialization erase it", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const firstClock = new FakeClock(1_000_000);
  const firstScheduler = new FakeScheduler(firstClock);
  const firstEvents: PlaybackWorkerEvent[] = [];
  const firstRuntime = createRuntime({
    storage,
    scheduler: firstScheduler,
    clock: firstClock,
    events: firstEvents,
    authFetch: new QueuedSpotifyAuthFetch([tokenResponse("initial-access")]),
    spotify: new QueuedSpotifyTransport([
      playbackResult(playingTrackPayload),
      Object.freeze({ kind: "network-failure" }),
    ]),
  });

  await firstRuntime.receive(initializeCommand());
  await firstScheduler.runNextWithDelay(5_000);

  const reconnecting = lastPlaybackState(firstEvents).state;
  assert.equal(reconnecting.kind, "reconnecting");
  if (reconnecting.kind === "reconnecting") {
    assert.equal(reconnecting.lastItem.kind, "available");
    if (reconnecting.lastItem.kind === "available") {
      assert.equal(reconnecting.lastItem.item.kind, "track");
    }
  }

  const reinitializedClock = new FakeClock(1_000_000);
  const reinitializedScheduler = new FakeScheduler(reinitializedClock);
  const reinitializedEvents: PlaybackWorkerEvent[] = [];
  const reinitializedRuntime = createRuntime({
    storage,
    scheduler: reinitializedScheduler,
    clock: reinitializedClock,
    events: reinitializedEvents,
    authFetch: new QueuedSpotifyAuthFetch([tokenResponse("reloaded-access")]),
    spotify: new QueuedSpotifyTransport([
      Object.freeze({ kind: "network-failure" }),
    ]),
  });

  await reinitializedRuntime.receive(initializeCommand());

  const afterReinitialization = lastPlaybackState(reinitializedEvents).state;
  assert.equal(afterReinitialization.kind, "reconnecting");
  if (afterReinitialization.kind === "reconnecting") {
    assert.deepEqual(afterReinitialization.lastItem, { kind: "unavailable" });
  }

  await firstRuntime.receive({ kind: "logout" });

  assert.deepEqual(lastPlaybackState(firstEvents).state, {
    kind: "authorization-required",
    reason: "not-authorized",
  });
});

test("safe diagnostics omit credential, callback, request, raw-error, and payload sentinels", async () => {
  const sentinels = Object.freeze({
    accessToken: "access-token-sentinel",
    refreshToken: "refresh-token-sentinel",
    callbackValue: "callback-value-sentinel",
    header: "header-sentinel",
    body: "body-sentinel",
    rawError: "raw-error-sentinel",
    payload: "payload-sentinel",
  });
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken(sentinels.refreshToken);
  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const spotify: PlaybackProviderPort = Object.freeze({
    providerId: spotifyProviderId(),
    async fetchCurrentlyPlaying(): Promise<PlaybackProviderResult> {
      throw new Error(
        `${sentinels.header} ${sentinels.body} ${sentinels.rawError} ${sentinels.payload}`,
      );
    },
  });
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch: new QueuedSpotifyAuthFetch([
      tokenResponse(sentinels.accessToken),
    ]),
    spotify,
  });

  await runtime.receive(initializeCommand());
  await runtime.receive({ kind: "retry" });
  await runtime.receive({ kind: "logout" });
  await runtime.receive({
    kind: "consume-callback",
    callbackUrl: `https://nowplaying.example/spotify/?code=${sentinels.callbackValue}&state=${"A".repeat(43)}`,
  });

  const serializedEvents = JSON.stringify(events);
  for (const sentinel of Object.values(sentinels)) {
    assert.equal(serializedEvents.includes(sentinel), false);
  }
  assert.equal(
    events.some(
      (event) =>
        event.kind === "safe-diagnostic" &&
        event.code === "playback-network-failure",
    ),
    true,
  );
  assert.equal(
    events.some(
      (event) =>
        event.kind === "safe-diagnostic" &&
        event.code === "authorization-required",
    ),
    true,
  );
});

test("visibility suspension cancels scheduled work and resumes with one deliberate poll", async () => {
  const fixture = await runtimeFixture({
    storedRefreshToken: { kind: "available", refreshToken: "stored-refresh" },
    authResponses: [tokenResponse("initial-access")],
    spotifyResponses: [
      playbackResult(playingTrackPayload),
      playbackResult(emptyTrackPayload),
    ],
  });

  await fixture.runtime.receive(initializeCommand());
  await fixture.runtime.receive({
    kind: "visibility-change",
    visibility: "hidden",
  });
  await fixture.runtime.receive({
    kind: "visibility-change",
    visibility: "hidden",
  });

  assert.deepEqual(fixture.scheduler.activeDelays(), []);

  await fixture.runtime.receive({
    kind: "visibility-change",
    visibility: "visible",
  });

  assert.equal(fixture.spotify.requestCount, 2);
  assert.equal(lastPlaybackState(fixture.events).state.kind, "empty");
  assert.deepEqual(fixture.scheduler.activeDelays(), [5_000, 3_540_000]);
});

test("a synchronous scheduler callback does not leave a phantom scheduled task", async () => {
  const storage = new MemorySpotifyAuthStorage();
  await storage.seedRefreshToken("stored-refresh");
  const clock = new FakeClock(1_000_000);
  const scheduler = new SynchronousFirstScheduler();
  const events: PlaybackWorkerEvent[] = [];
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch: new QueuedSpotifyAuthFetch([tokenResponse("initial-access")]),
    spotify: new QueuedSpotifyTransport([playbackResult(playingTrackPayload)]),
  });

  await runtime.receive(initializeCommand());
  await scheduler.waitForSynchronousCallback();
  await runtime.receive({ kind: "visibility-change", visibility: "hidden" });

  assert.equal(
    events.some(
      (event) =>
        event.kind === "safe-diagnostic" && event.code === "scheduler-failure",
    ),
    false,
  );
});
