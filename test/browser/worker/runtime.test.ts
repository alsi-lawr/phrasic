import assert from "node:assert/strict";
import test from "node:test";
import {
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
  type BrowserPkceCryptoPort,
  type PendingAuthorizationAttempt,
} from "../../../browser/auth/pkce.ts";
import {
  SpotifyRefreshTokenConnection,
  type SpotifyAuthStoragePort,
  type SpotifyPendingAuthorizationAttemptConsumeOptions,
  type SpotifyPendingAuthorizationAttemptConsumeResult,
  type SpotifyRefreshTokenConnectionReadResult,
} from "../../../browser/auth/storage.ts";
import {
  createSpotifyAuthFetchPort,
  SpotifyRefreshToken,
  type SpotifyAuthFetchPort,
  type SpotifyAuthFetchRequest,
  type SpotifyAuthFetchResponse,
  type SpotifyAuthFetchResult,
  type SpotifyAuthJsonReadResult,
} from "../../../browser/auth/token.ts";
import { parseSpotifyPlaybackPayload } from "../../../browser/providers/spotify-payload.ts";
import {
  createPlaybackProviderRegistry,
  type PlaybackProviderPort,
  type PlaybackProviderRegistry,
  type PlaybackProviderRequest,
  type PlaybackProviderResult,
} from "../../../browser/providers/registry.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerEventSink,
  type PlaybackWorkerRuntime,
  type PlaybackWorkerSchedulerPort,
} from "../../../browser/worker/runtime.ts";
import { createSpotifyPlaybackProvider } from "../../../browser/providers/spotify.ts";
import { createBrowserRequestDeadlinePort } from "../../../browser/request-deadline.ts";
import type { PlaybackWorkerEvent } from "../../../browser/worker/protocol.ts";
import { ProviderId } from "../../../domain/playback.ts";
import {
  emptyTrackPayload,
  playingTrackPayload,
} from "../providers/spotify-payload.fixture.ts";
import { ManualRequestDeadlineScheduler } from "../request-deadline.fixture.ts";

const testRequestDeadlineMilliseconds = 25;

test("the worker consumes provider-neutral playback results through its registry and schedules from completion", async () => {
  const fixture = await runtimeFixture({
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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
    storedConnection: { kind: "missing" },
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
    storedConnection: { kind: "missing" },
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

  assert.equal(storage.refreshConnectionSaveCount, 1);
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
  await runtime.receive({
    kind: "retry",
    callbackValue: sentinels.callbackValue,
    headers: { Authorization: `Bearer ${sentinels.accessToken}` },
    body: sentinels.body,
    error: new Error(sentinels.rawError),
    payload: { refresh_token: sentinels.refreshToken },
  });
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
        event.kind === "safe-diagnostic" && event.code === "invalid-command",
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
    storedConnection: { kind: "available", refreshToken: "stored-refresh" },
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

type RuntimeFixture = {
  readonly authFetch: QueuedSpotifyAuthFetch;
  readonly clock: FakeClock;
  readonly events: PlaybackWorkerEvent[];
  readonly runtime: PlaybackWorkerRuntime;
  readonly scheduler: FakeScheduler;
  readonly spotify: QueuedSpotifyTransport;
  readonly storage: MemorySpotifyAuthStorage;
};

type RuntimeFixtureOptions = {
  readonly authResponses: ReadonlyArray<SpotifyAuthFetchResult>;
  readonly spotifyResponses: ReadonlyArray<PlaybackProviderResult>;
  readonly storedConnection:
    | {
        readonly kind: "available";
        readonly refreshToken: string;
      }
    | {
        readonly kind: "missing";
      };
};

type RuntimeDependencies = {
  readonly authFetch: SpotifyAuthFetchPort;
  readonly clock: FakeClock;
  readonly events: PlaybackWorkerEvent[];
  readonly scheduler: FakeScheduler;
  readonly spotify: PlaybackProviderPort;
  readonly storage: MemorySpotifyAuthStorage;
};

type StoredConnection =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "stored";
      readonly connection: SpotifyRefreshTokenConnection;
    };

type ScheduledEntry = {
  readonly delayMilliseconds: number;
  readonly dueAtEpochMilliseconds: number;
  readonly run: () => Promise<void>;
  cancelled: boolean;
  executed: boolean;
};

type AbortableHttpFetch = {
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly latestSignal: AbortSignal | undefined;
  readonly maximumConcurrentRequests: number;
  readonly requestCount: number;
};

type DeferredResponseHttpFetch = {
  readonly fetchImplementation: typeof globalThis.fetch;
  readonly latestSignal: AbortSignal | undefined;
  readonly requestCount: number;
  readonly resolve: (response: Response) => void;
};

async function runtimeFixture(
  options: RuntimeFixtureOptions,
): Promise<RuntimeFixture> {
  const storage = new MemorySpotifyAuthStorage();
  if (options.storedConnection.kind === "available") {
    await storage.seedRefreshToken(options.storedConnection.refreshToken);
  }

  const clock = new FakeClock(1_000_000);
  const scheduler = new FakeScheduler(clock);
  const events: PlaybackWorkerEvent[] = [];
  const authFetch = new QueuedSpotifyAuthFetch(options.authResponses);
  const spotify = new QueuedSpotifyTransport(options.spotifyResponses);
  const runtime = createRuntime({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
  });

  return Object.freeze({
    storage,
    scheduler,
    clock,
    events,
    authFetch,
    spotify,
    runtime,
  });
}

function createRuntime(
  dependencies: RuntimeDependencies,
): PlaybackWorkerRuntime {
  const events: PlaybackWorkerEventSink = Object.freeze({
    emit(event): void {
      dependencies.events.push(event);
    },
  });

  return createPlaybackWorkerRuntime({
    auth: Object.freeze({
      crypto: deterministicCrypto(),
      fetch: dependencies.authFetch,
      storage: dependencies.storage,
    }),
    cancellation: Object.freeze({
      create(): AbortController {
        return new AbortController();
      },
    }),
    clock: Object.freeze({
      now(): number {
        return dependencies.clock.now();
      },
    }),
    events,
    playbackProviderId: dependencies.spotify.providerId,
    playbackProviders: playbackProviderRegistry(dependencies.spotify),
    scheduler: dependencies.scheduler,
  });
}

function playbackProviderRegistry(
  provider: PlaybackProviderPort,
): PlaybackProviderRegistry {
  const registry = createPlaybackProviderRegistry([provider]);
  if (registry.kind === "success") {
    return registry.value;
  }

  throw new Error("Expected a unique playback provider test registration.");
}

function spotifyProviderId(): ProviderId {
  const providerId = ProviderId.create("spotify");
  if (providerId.kind === "success") {
    return providerId.value;
  }

  throw new Error("Expected a valid Spotify provider identifier fixture.");
}

function abortableNeverSettlingFetch(): AbortableHttpFetch {
  const observedSignals: AbortSignal[] = [];
  let activeRequests = 0;
  let maximumRequests = 0;
  const fetchImplementation: typeof globalThis.fetch = (
    _input,
    init,
  ): Promise<Response> => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      return Promise.reject(new Error("Expected a request deadline signal."));
    }

    observedSignals.push(signal);
    activeRequests += 1;
    maximumRequests = Math.max(maximumRequests, activeRequests);
    return rejectedWhenAborted(signal).finally((): void => {
      activeRequests -= 1;
    });
  };
  const fetch: AbortableHttpFetch = {
    fetchImplementation,
    get latestSignal(): AbortSignal | undefined {
      return observedSignals[observedSignals.length - 1];
    },
    get maximumConcurrentRequests(): number {
      return maximumRequests;
    },
    get requestCount(): number {
      return observedSignals.length;
    },
  };

  return Object.freeze(fetch);
}

function deferredResponseFetch(): DeferredResponseHttpFetch {
  const observedSignals: AbortSignal[] = [];
  let resolveResponse: ((response: Response) => void) | undefined;
  const fetchImplementation: typeof globalThis.fetch = (
    _input,
    init,
  ): Promise<Response> => {
    const signal = init?.signal;
    if (signal === undefined || signal === null) {
      return Promise.reject(new Error("Expected a request deadline signal."));
    }

    if (resolveResponse !== undefined) {
      return Promise.reject(new Error("Expected one deferred token request."));
    }

    observedSignals.push(signal);
    return new Promise<Response>((resolve): void => {
      resolveResponse = resolve;
    });
  };
  const fetch: DeferredResponseHttpFetch = {
    fetchImplementation,
    get latestSignal(): AbortSignal | undefined {
      return observedSignals[observedSignals.length - 1];
    },
    get requestCount(): number {
      return observedSignals.length;
    },
    resolve(response: Response): void {
      if (resolveResponse === undefined) {
        throw new Error("Expected a deferred token response.");
      }

      const resolve = resolveResponse;
      resolveResponse = undefined;
      resolve(response);
    },
  };

  return Object.freeze(fetch);
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

function initializeCommand(): unknown {
  return {
    kind: "initialize",
    applicationUrl: "https://nowplaying.example/nowplaying",
    configuration: {
      spotify: {
        clientId: "browser-client-id",
        redirectUri: "https://nowplaying.example/spotify/",
      },
    },
  };
}

function tokenResponse(
  accessToken: string,
  refreshToken?: string,
  expiresInSeconds = 3_600,
): SpotifyAuthFetchResult {
  const body =
    refreshToken === undefined
      ? {
          access_token: accessToken,
          expires_in: expiresInSeconds,
        }
      : {
          access_token: accessToken,
          expires_in: expiresInSeconds,
          refresh_token: refreshToken,
        };
  const response: SpotifyAuthFetchResponse = {
    status: 200,
    async readJson(): Promise<SpotifyAuthJsonReadResult> {
      return Object.freeze({ kind: "json", value: body });
    },
  };

  return Object.freeze({
    kind: "response",
    response: Object.freeze(response),
  });
}

function invalidGrantResponse(): SpotifyAuthFetchResult {
  const response: SpotifyAuthFetchResponse = {
    status: 400,
    async readJson(): Promise<SpotifyAuthJsonReadResult> {
      return Object.freeze({ kind: "json", value: { error: "invalid_grant" } });
    },
  };

  return Object.freeze({
    kind: "response",
    response: Object.freeze(response),
  });
}

function playbackResult(payload: unknown): PlaybackProviderResult {
  const parsed = parseSpotifyPlaybackPayload(payload);
  if (parsed.kind === "failure") {
    throw new Error("Expected a valid Spotify playback fixture.");
  }

  return Object.freeze({ kind: "playback", state: parsed.value });
}

function playbackStates(
  events: ReadonlyArray<PlaybackWorkerEvent>,
): ReadonlyArray<
  Extract<PlaybackWorkerEvent, { readonly kind: "playback-state" }>
> {
  return events.filter(
    (
      event: PlaybackWorkerEvent,
    ): event is Extract<
      PlaybackWorkerEvent,
      { readonly kind: "playback-state" }
    > => event.kind === "playback-state",
  );
}

function playbackStateKinds(
  events: ReadonlyArray<PlaybackWorkerEvent>,
): ReadonlyArray<string> {
  return playbackStates(events).map((event) => event.state.kind);
}

function lastPlaybackState(
  events: ReadonlyArray<PlaybackWorkerEvent>,
): Extract<PlaybackWorkerEvent, { readonly kind: "playback-state" }> {
  const states = playbackStates(events);
  const state = states[states.length - 1];
  if (state === undefined) {
    throw new Error("Expected a playback-state event.");
  }

  return state;
}

function hasTokenShapedEventField(event: PlaybackWorkerEvent): boolean {
  return Object.getOwnPropertyNames(event).some((field) =>
    field.toLowerCase().includes("token"),
  );
}

function deterministicCrypto(): BrowserPkceCryptoPort {
  const crypto: BrowserPkceCryptoPort = {
    randomness: {
      fill(destination: Uint8Array): void {
        destination.fill(0);
      },
    },
    sha256: {
      async digest(source: Uint8Array): Promise<Uint8Array> {
        void source;
        return new Uint8Array(32);
      },
    },
  };

  return Object.freeze({
    randomness: Object.freeze(crypto.randomness),
    sha256: Object.freeze(crypto.sha256),
  });
}

class MemorySpotifyAuthStorage implements SpotifyAuthStoragePort {
  private pendingAttempts: ReadonlyArray<PendingAuthorizationAttempt> =
    Object.freeze([]);
  private refreshConnectionSaves = 0;
  private storedConnection: StoredConnection = Object.freeze({ kind: "empty" });

  get connectionKind(): "found" | "missing" {
    return this.storedConnection.kind === "stored" ? "found" : "missing";
  }

  get refreshConnectionSaveCount(): number {
    return this.refreshConnectionSaves;
  }

  async seedRefreshToken(value: string): Promise<void> {
    const parsed = SpotifyRefreshToken.parse(value);
    if (parsed.kind === "failure") {
      throw new Error("Expected a valid refresh token fixture.");
    }

    await this.saveSpotifyRefreshTokenConnection(
      SpotifyRefreshTokenConnection.create(parsed.value),
    );
  }

  async savePendingAuthorizationAttempt(
    attempt: PendingAuthorizationAttempt,
  ): Promise<void> {
    this.pendingAttempts = Object.freeze([...this.pendingAttempts, attempt]);
  }

  async consumePendingAuthorizationAttempt(
    options: SpotifyPendingAuthorizationAttemptConsumeOptions,
  ): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
    const attempt = this.pendingAttempts.find((candidate) =>
      matchesPendingAuthorizationAttemptState({
        pending: candidate,
        candidate: options.state,
      }),
    );
    if (attempt === undefined) {
      return Object.freeze({ kind: "rejected", reason: "missing-attempt" });
    }

    this.pendingAttempts = Object.freeze(
      this.pendingAttempts.filter((candidate) => candidate !== attempt),
    );
    if (
      isPendingAuthorizationAttemptExpired({
        pending: attempt,
        observedAt: options.observedAt,
      })
    ) {
      return Object.freeze({ kind: "rejected", reason: "expired" });
    }

    return Object.freeze({ kind: "consumed", attempt });
  }

  async readSpotifyRefreshTokenConnection(): Promise<SpotifyRefreshTokenConnectionReadResult> {
    if (this.storedConnection.kind === "empty") {
      return Object.freeze({ kind: "connection-missing" });
    }

    return Object.freeze({
      kind: "connection-found",
      connection: this.storedConnection.connection,
    });
  }

  async saveSpotifyRefreshTokenConnection(
    connection: SpotifyRefreshTokenConnection,
  ): Promise<void> {
    this.refreshConnectionSaves += 1;
    this.storedConnection = Object.freeze({ kind: "stored", connection });
  }

  async deleteSpotifyRefreshTokenConnection(): Promise<void> {
    this.storedConnection = Object.freeze({ kind: "empty" });
  }

  async clearSpotifyAuthorization(): Promise<void> {
    this.pendingAttempts = Object.freeze([]);
    this.storedConnection = Object.freeze({ kind: "empty" });
  }
}

class QueuedSpotifyAuthFetch implements SpotifyAuthFetchPort {
  private readonly observedRequests: SpotifyAuthFetchRequest[] = [];
  private queuedResults: SpotifyAuthFetchResult[];

  constructor(results: ReadonlyArray<SpotifyAuthFetchResult>) {
    this.queuedResults = [...results];
  }

  get requestCount(): number {
    return this.observedRequests.length;
  }

  async fetch(
    request: SpotifyAuthFetchRequest,
  ): Promise<SpotifyAuthFetchResult> {
    this.observedRequests.push(request);
    const result = this.queuedResults.shift();
    if (result === undefined) {
      throw new Error("Unexpected Spotify token request.");
    }

    return result;
  }
}

class DeferredRefreshSpotifyAuthFetch implements SpotifyAuthFetchPort {
  private readonly completion = deferredSpotifyAuthFetchResult();
  private readonly initialResult: SpotifyAuthFetchResult;
  private readonly observedRequests: SpotifyAuthFetchRequest[] = [];

  constructor(initialResult: SpotifyAuthFetchResult) {
    this.initialResult = initialResult;
  }

  get requestCount(): number {
    return this.observedRequests.length;
  }

  async fetch(
    request: SpotifyAuthFetchRequest,
  ): Promise<SpotifyAuthFetchResult> {
    this.observedRequests.push(request);
    if (this.observedRequests.length === 1) {
      return this.initialResult;
    }

    if (this.observedRequests.length === 2) {
      return this.completion.promise;
    }

    throw new Error("Unexpected concurrent Spotify token request.");
  }

  resolve(result: SpotifyAuthFetchResult): void {
    this.completion.resolve(result);
  }
}

class QueuedSpotifyTransport implements PlaybackProviderPort {
  private concurrentRequests = 0;
  private readonly observedRequests: PlaybackProviderRequest[] = [];
  private queuedResults: PlaybackProviderResult[];
  private maximumRequests = 0;
  public readonly providerId: ProviderId;

  constructor(results: ReadonlyArray<PlaybackProviderResult>) {
    this.providerId = spotifyProviderId();
    this.queuedResults = [...results];
  }

  get maximumConcurrentRequests(): number {
    return this.maximumRequests;
  }

  get requestCount(): number {
    return this.observedRequests.length;
  }

  async fetchCurrentlyPlaying(
    request: PlaybackProviderRequest,
  ): Promise<PlaybackProviderResult> {
    this.observedRequests.push(request);
    this.concurrentRequests += 1;
    this.maximumRequests = Math.max(
      this.maximumRequests,
      this.concurrentRequests,
    );

    try {
      const result = this.queuedResults.shift();
      if (result === undefined) {
        throw new Error("Unexpected Spotify playback request.");
      }

      return result;
    } finally {
      this.concurrentRequests -= 1;
    }
  }
}

class DeferredSpotifyTransport implements PlaybackProviderPort {
  private activeRequests = 0;
  private readonly completions: Array<{
    readonly promise: Promise<PlaybackProviderResult>;
    readonly resolve: (result: PlaybackProviderResult) => void;
  }> = [];
  private readonly observedRequests: PlaybackProviderRequest[] = [];
  private maximumRequests = 0;
  public readonly providerId: ProviderId = spotifyProviderId();

  get latestSignal(): AbortSignal | undefined {
    return this.observedRequests[this.observedRequests.length - 1]?.signal;
  }

  get requestCount(): number {
    return this.observedRequests.length;
  }

  get maximumConcurrentRequests(): number {
    return this.maximumRequests;
  }

  async fetchCurrentlyPlaying(
    request: PlaybackProviderRequest,
  ): Promise<PlaybackProviderResult> {
    this.observedRequests.push(request);
    this.activeRequests += 1;
    this.maximumRequests = Math.max(this.maximumRequests, this.activeRequests);
    const completion = deferredSpotifyResult();
    this.completions.push(completion);

    try {
      return await completion.promise;
    } finally {
      this.activeRequests -= 1;
    }
  }

  resolve(result: PlaybackProviderResult): void {
    const completion = this.completions.shift();
    if (completion === undefined) {
      throw new Error("Expected a deferred Spotify request.");
    }

    completion.resolve(result);
  }
}

class FakeScheduler implements PlaybackWorkerSchedulerPort {
  private readonly clock: FakeClock;
  private readonly scheduledEntries: ScheduledEntry[] = [];

  constructor(clock: FakeClock) {
    this.clock = clock;
  }

  activeDelays(): ReadonlyArray<number> {
    return this.scheduledEntries
      .filter((entry) => !entry.cancelled && !entry.executed)
      .map((entry) => entry.delayMilliseconds)
      .sort((first, second) => first - second);
  }

  async runNextWithDelay(delayMilliseconds: number): Promise<void> {
    const entry = this.scheduledEntries.find(
      (candidate) =>
        !candidate.cancelled &&
        !candidate.executed &&
        candidate.delayMilliseconds === delayMilliseconds,
    );
    if (entry === undefined) {
      throw new Error(`Expected a scheduled delay of ${delayMilliseconds}.`);
    }

    entry.executed = true;
    this.clock.advanceTo(entry.dueAtEpochMilliseconds);
    await entry.run();
  }

  schedule(options: {
    readonly delayMilliseconds: number;
    readonly run: () => Promise<void>;
  }): { readonly cancel: () => void } {
    const entry: ScheduledEntry = {
      delayMilliseconds: options.delayMilliseconds,
      dueAtEpochMilliseconds: this.clock.now() + options.delayMilliseconds,
      run: options.run,
      cancelled: false,
      executed: false,
    };
    this.scheduledEntries.push(entry);

    return Object.freeze({
      cancel(): void {
        entry.cancelled = true;
      },
    });
  }
}

class FakeClock {
  private epochMilliseconds: number;

  constructor(initialEpochMilliseconds: number) {
    this.epochMilliseconds = initialEpochMilliseconds;
  }

  now(): number {
    return this.epochMilliseconds;
  }

  advanceTo(nextEpochMilliseconds: number): void {
    if (nextEpochMilliseconds < this.epochMilliseconds) {
      throw new Error("Cannot move the deterministic clock backwards.");
    }

    this.epochMilliseconds = nextEpochMilliseconds;
  }
}

function deferredSpotifyResult(): {
  readonly promise: Promise<PlaybackProviderResult>;
  readonly resolve: (result: PlaybackProviderResult) => void;
} {
  let resolvePromise: (result: PlaybackProviderResult) => void = () => {
    throw new Error("Deferred Spotify result did not initialize.");
  };
  const promise = new Promise<PlaybackProviderResult>((resolve): void => {
    resolvePromise = resolve;
  });

  return Object.freeze({
    promise,
    resolve(result: PlaybackProviderResult): void {
      resolvePromise(result);
    },
  });
}

function deferredSpotifyAuthFetchResult(): {
  readonly promise: Promise<SpotifyAuthFetchResult>;
  readonly resolve: (result: SpotifyAuthFetchResult) => void;
} {
  let resolvePromise: (result: SpotifyAuthFetchResult) => void = () => {
    throw new Error("Deferred Spotify token result did not initialize.");
  };
  const promise = new Promise<SpotifyAuthFetchResult>((resolve): void => {
    resolvePromise = resolve;
  });

  return Object.freeze({
    promise,
    resolve(result: SpotifyAuthFetchResult): void {
      resolvePromise(result);
    },
  });
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error("Expected asynchronous worker work to begin.");
}
