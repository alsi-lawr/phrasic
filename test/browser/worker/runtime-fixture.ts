import {
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
} from "../../../browser/auth/pkce.ts";
import {
  type BrowserPkceCryptoPort,
  type PendingAuthorizationAttempt,
} from "../../../browser/auth/pkce-values.ts";
import {
  type SpotifyAuthStoragePort,
  type SpotifyPendingAuthorizationAttemptConsumeOptions,
  type SpotifyPendingAuthorizationAttemptConsumeResult,
  type SpotifyRefreshTokenReadResult,
} from "../../../browser/auth/spotify-auth-storage-contract.ts";
import {
  type SpotifyAuthFetchPort,
  type SpotifyAuthFetchRequest,
  type SpotifyAuthFetchResponse,
  type SpotifyAuthFetchResult,
  type SpotifyAuthJsonReadResult,
} from "../../../browser/auth/spotify-auth-fetch.ts";
import { SpotifyRefreshToken } from "../../../browser/auth/spotify-token-values.ts";
import { createSpotifyAuthorizationProvider } from "../../../browser/auth/spotify-provider.ts";
import { parseSpotifyPlaybackPayload } from "../../../browser/providers/spotify-payload.ts";
import {
  type PlaybackProviderPort,
  type PlaybackProviderRequest,
  type PlaybackProviderResult,
} from "../../../browser/providers/provider.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerRuntime,
} from "../../../browser/worker/runtime.ts";
import type {
  PlaybackWorkerEventSink,
  PlaybackWorkerSchedulerPort,
} from "../../../browser/worker/runtime-ports.ts";
import type {
  PlaybackWorkerCommand,
  PlaybackWorkerEvent,
} from "../../../browser/worker/protocol.ts";
import {
  parseProviderId,
  type ProviderId,
} from "../../../domain/playback-values.ts";

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
  readonly storedRefreshToken:
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
  readonly scheduler: PlaybackWorkerSchedulerPort;
  readonly spotify: PlaybackProviderPort;
  readonly storage: MemorySpotifyAuthStorage;
};

type StoredRefreshToken =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "stored";
      readonly refreshToken: SpotifyRefreshToken;
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

export async function runtimeFixture(
  options: RuntimeFixtureOptions,
): Promise<RuntimeFixture> {
  const storage = new MemorySpotifyAuthStorage();
  if (options.storedRefreshToken.kind === "available") {
    await storage.seedRefreshToken(options.storedRefreshToken.refreshToken);
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

export function createRuntime(
  dependencies: RuntimeDependencies,
): PlaybackWorkerRuntime {
  const events: PlaybackWorkerEventSink = Object.freeze({
    emit(event): void {
      dependencies.events.push(event);
    },
  });

  return createPlaybackWorkerRuntime({
    authorization: createSpotifyAuthorizationProvider({
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
    playbackProvider: dependencies.spotify,
    scheduler: dependencies.scheduler,
  });
}

export function spotifyProviderId(): ProviderId {
  const providerId = parseProviderId("spotify");
  if (providerId.kind === "success") {
    return providerId.value;
  }

  throw new Error("Expected a valid Spotify provider identifier fixture.");
}

export function abortableNeverSettlingFetch(): AbortableHttpFetch {
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

export function deferredResponseFetch(): DeferredResponseHttpFetch {
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

export function initializeCommand(): PlaybackWorkerCommand {
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

export function tokenResponse(
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

export function invalidGrantResponse(): SpotifyAuthFetchResult {
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

export function playbackResult(payload: unknown): PlaybackProviderResult {
  const parsed = parseSpotifyPlaybackPayload(payload);
  if (parsed.kind === "failure") {
    throw new Error("Expected a valid Spotify playback fixture.");
  }

  return Object.freeze({ kind: "playback", state: parsed.value });
}

export function playbackStates(
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

export function playbackStateKinds(
  events: ReadonlyArray<PlaybackWorkerEvent>,
): ReadonlyArray<string> {
  return playbackStates(events).map((event) => event.state.kind);
}

export function lastPlaybackState(
  events: ReadonlyArray<PlaybackWorkerEvent>,
): Extract<PlaybackWorkerEvent, { readonly kind: "playback-state" }> {
  const states = playbackStates(events);
  const state = states[states.length - 1];
  if (state === undefined) {
    throw new Error("Expected a playback-state event.");
  }

  return state;
}

export function hasTokenShapedEventField(event: PlaybackWorkerEvent): boolean {
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

export class MemorySpotifyAuthStorage implements SpotifyAuthStoragePort {
  private pendingAttempts: ReadonlyArray<PendingAuthorizationAttempt> =
    Object.freeze([]);
  private refreshTokenSaves = 0;
  private storedRefreshToken: StoredRefreshToken = Object.freeze({
    kind: "empty",
  });

  get connectionKind(): "found" | "missing" {
    return this.storedRefreshToken.kind === "stored" ? "found" : "missing";
  }

  get refreshTokenSaveCount(): number {
    return this.refreshTokenSaves;
  }

  async seedRefreshToken(value: string): Promise<void> {
    const parsed = SpotifyRefreshToken.parse(value);
    if (parsed.kind === "failure") {
      throw new Error("Expected a valid refresh token fixture.");
    }

    await this.saveSpotifyRefreshToken(parsed.value);
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

  async readSpotifyRefreshToken(): Promise<SpotifyRefreshTokenReadResult> {
    if (this.storedRefreshToken.kind === "empty") {
      return Object.freeze({ kind: "missing" });
    }

    return Object.freeze({
      kind: "found",
      refreshToken: this.storedRefreshToken.refreshToken,
    });
  }

  async saveSpotifyRefreshToken(
    refreshToken: SpotifyRefreshToken,
  ): Promise<void> {
    this.refreshTokenSaves += 1;
    this.storedRefreshToken = Object.freeze({ kind: "stored", refreshToken });
  }

  async deleteSpotifyRefreshToken(): Promise<void> {
    this.storedRefreshToken = Object.freeze({ kind: "empty" });
  }

  async clearSpotifyAuthorization(): Promise<void> {
    this.pendingAttempts = Object.freeze([]);
    this.storedRefreshToken = Object.freeze({ kind: "empty" });
  }
}

export class QueuedSpotifyAuthFetch implements SpotifyAuthFetchPort {
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

export class DeferredRefreshSpotifyAuthFetch implements SpotifyAuthFetchPort {
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

export class QueuedSpotifyTransport implements PlaybackProviderPort {
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

export class DeferredSpotifyTransport implements PlaybackProviderPort {
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

export class FakeScheduler implements PlaybackWorkerSchedulerPort {
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

export class SynchronousFirstScheduler implements PlaybackWorkerSchedulerPort {
  private hasScheduled = false;
  private synchronousCallback: Promise<void> | undefined;

  async waitForSynchronousCallback(): Promise<void> {
    if (this.synchronousCallback === undefined) {
      throw new Error("Expected a synchronous callback.");
    }

    await this.synchronousCallback;
  }

  schedule(options: {
    readonly delayMilliseconds: number;
    readonly run: () => Promise<void>;
  }): { readonly cancel: () => void } {
    if (!this.hasScheduled) {
      this.hasScheduled = true;
      this.synchronousCallback = options.run();
      return Object.freeze({
        cancel(): void {
          throw new Error(
            "A synchronously completed task must not be cancelled.",
          );
        },
      });
    }

    return Object.freeze({
      cancel(): void {},
    });
  }
}

export class FakeClock {
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

export async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error("Expected asynchronous worker work to begin.");
}
