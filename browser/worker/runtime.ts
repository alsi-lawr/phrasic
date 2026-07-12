import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "../config.ts";
import {
  parseDisplayReturnConfiguration,
  type BrowserPkceCryptoPort,
} from "../auth/pkce.ts";
import {
  beginSpotifyAuthorization,
  consumeSpotifyAuthorizationCallback,
  createBrowserAuthClockPort,
  logoutSpotifyAuthorization,
  refreshSpotifyConnection,
  type BrowserAuthClockPort,
  type ConsumeSpotifyAuthorizationCallbackResult,
  type RefreshSpotifyConnectionResult,
} from "../auth/session.ts";
import {
  type SpotifyAuthStoragePort,
  type SpotifyPendingAuthorizationAttemptConsumeOptions,
  type SpotifyPendingAuthorizationAttemptConsumeResult,
  type SpotifyRefreshTokenConnection,
  type SpotifyRefreshTokenConnectionReadResult,
} from "../auth/storage.ts";
import {
  type SpotifyAccessToken,
  type SpotifyAccessTokenLifetimeSeconds,
  type SpotifyAuthFetchPort,
} from "../auth/token.ts";
import {
  initialPlaybackState,
  maximumPlatformTimerDelayMilliseconds,
  providerFailure,
  transitionPlaybackState,
  type PlaybackEvent,
  type PlaybackState,
} from "../../domain/playback.ts";
import { serializePlaybackState } from "../../domain/playback-stream.ts";
import {
  type SpotifyCurrentlyPlayingPort,
  type SpotifyCurrentlyPlayingResult,
} from "../providers/spotify.ts";
import {
  createPlaybackWorkerSafeDiagnostic,
  noPlaybackWorkerDiagnosticMetadata,
  parsePlaybackWorkerCommand,
  type PlaybackWorkerBeginAuthorizationCommand,
  type PlaybackWorkerConsumeCallbackCommand,
  type PlaybackWorkerDiagnosticCode,
  type PlaybackWorkerDiagnosticMetadata,
  type PlaybackWorkerDiagnosticOperation,
  type PlaybackWorkerEvent,
  type PlaybackWorkerInitializeCommand,
} from "./protocol.ts";

const successfulPollDelayMilliseconds = 5_000;
const accessTokenRefreshLeadMilliseconds = 60_000;
const maximumScheduledDelayMilliseconds = maximumPlatformTimerDelayMilliseconds;
const reconnectDelayMilliseconds: ReadonlyArray<number> = Object.freeze([
  1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
]);

export type PlaybackWorkerClockPort = {
  readonly now: () => number;
};

export type PlaybackWorkerScheduledTask = {
  readonly cancel: () => void;
};

export type PlaybackWorkerScheduleOptions = {
  readonly delayMilliseconds: number;
  readonly run: () => Promise<void>;
};

export type PlaybackWorkerSchedulerPort = {
  readonly schedule: (
    options: PlaybackWorkerScheduleOptions,
  ) => PlaybackWorkerScheduledTask;
};

export type PlaybackWorkerCancellationPort = {
  readonly create: () => AbortController;
};

export type PlaybackWorkerAuthPorts = {
  readonly crypto: BrowserPkceCryptoPort;
  readonly fetch: SpotifyAuthFetchPort;
  readonly storage: SpotifyAuthStoragePort;
};

export type PlaybackWorkerEventSink = {
  readonly emit: (event: PlaybackWorkerEvent) => void;
};

export type PlaybackWorkerRuntimePorts = {
  readonly auth: PlaybackWorkerAuthPorts;
  readonly cancellation: PlaybackWorkerCancellationPort;
  readonly clock: PlaybackWorkerClockPort;
  readonly events: PlaybackWorkerEventSink;
  readonly scheduler: PlaybackWorkerSchedulerPort;
  readonly spotify: SpotifyCurrentlyPlayingPort;
};

export type PlaybackWorkerRuntime = {
  readonly receive: (message: unknown) => Promise<void>;
};

type RuntimeStatus =
  | {
      readonly kind: "awaiting-initialization";
    }
  | {
      readonly kind: "active";
      readonly configuration: SpotifyPublicConfiguration;
    }
  | {
      readonly kind: "fatal";
    }
  | {
      readonly kind: "disposed";
    };

type WorkerVisibility = "hidden" | "visible";

type AccessTokenState =
  | {
      readonly kind: "missing";
    }
  | {
      readonly kind: "available";
      readonly accessToken: SpotifyAccessToken;
      readonly expiresAtEpochMilliseconds: number;
      readonly refreshAtEpochMilliseconds: number;
    };

type ScheduledWork =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "scheduled";
      readonly task: PlaybackWorkerScheduledTask;
      readonly ticket: number;
    };

type ActiveOperation =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "active";
      readonly controller: AbortController;
      readonly epoch: number;
    };

type RuntimeOperation = {
  readonly controller: AbortController;
  readonly epoch: number;
};

type RefreshFlight =
  | {
      readonly kind: "idle";
    }
  | {
      readonly kind: "running";
      readonly operationEpoch: number;
      readonly result: Promise<RuntimeRefreshResult>;
    };

type RuntimeRefreshResult =
  | RefreshSpotifyConnectionResult
  | {
      readonly kind: "unexpected";
    };

type CurrentTime =
  | {
      readonly kind: "available";
      readonly epochMilliseconds: number;
    }
  | {
      readonly kind: "unavailable";
    };

export function createPlaybackWorkerRuntime(
  ports: PlaybackWorkerRuntimePorts,
): PlaybackWorkerRuntime {
  let runtimeStatus: RuntimeStatus = frozenAwaitingInitialization();
  let visibility: WorkerVisibility = "visible";
  let playbackState: PlaybackState = initialPlaybackState();
  let accessTokenState: AccessTokenState = frozenMissingAccessToken();
  let activeOperation: ActiveOperation = frozenNoActiveOperation();
  let refreshFlight: RefreshFlight = frozenIdleRefreshFlight();
  let queuedWork: Promise<void> = Promise.resolve();
  let retryPosition = 0;
  let pollSchedule: ScheduledWork = frozenNoScheduledWork();
  let refreshSchedule: ScheduledWork = frozenNoScheduledWork();
  let retrySchedule: ScheduledWork = frozenNoScheduledWork();
  let pollTicket = 0;
  let refreshTicket = 0;
  let retryTicket = 0;
  let operationEpoch = 0;

  const runtime: PlaybackWorkerRuntime = {
    receive(message: unknown): Promise<void> {
      const command = parsePlaybackWorkerCommand(message);
      if (command.kind === "failure") {
        emitDiagnostic("command", "invalid-command");
        return Promise.resolve();
      }

      const receivedCommand = command.value;
      switch (receivedCommand.kind) {
        case "initialize":
          return enqueue(() => initialize(receivedCommand));
        case "begin-authorization":
          return enqueue(() => beginAuthorization(receivedCommand));
        case "consume-callback":
          cancelRuntimeWork();
          return enqueue(() => consumeCallback(receivedCommand));
        case "retry":
          cancelRuntimeWork();
          return enqueue(retryConnection);
        case "visibility-change":
          return receiveVisibilityChange(receivedCommand.visibility);
        case "logout":
          return receiveLogout();
        case "dispose":
          receiveDispose();
          return Promise.resolve();
      }

      return Promise.resolve();
    },
  };

  return Object.freeze(runtime);

  function enqueue(work: () => Promise<void>): Promise<void> {
    const next = queuedWork.then(work, work);
    queuedWork = next.then(
      (): void => undefined,
      (): void => {
        emitDiagnostic("initialization", "runtime-operation-failed");
      },
    );

    return queuedWork;
  }

  async function initialize(
    command: PlaybackWorkerInitializeCommand,
  ): Promise<void> {
    if (runtimeStatus.kind !== "awaiting-initialization") {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    const applicationUrl = parseApplicationUrl(command.applicationUrl);
    if (applicationUrl.kind === "failure") {
      failInitialization("invalid-public-configuration");
      return;
    }

    let configuration;
    try {
      configuration = parseSpotifyPublicConfiguration(command.configuration, {
        applicationUrl: applicationUrl.value,
      });
    } catch {
      failInitialization("invalid-public-configuration");
      return;
    }

    if (configuration.kind === "failure") {
      failInitialization("invalid-public-configuration");
      return;
    }

    runtimeStatus = frozenActiveRuntime(configuration.value);
    playbackState = initialPlaybackState();
    emitPlaybackState();
    await recoverConnection();
  }

  async function beginAuthorization(
    command: PlaybackWorkerBeginAuthorizationCommand,
  ): Promise<void> {
    if (!isRuntimeActive() || playbackState.kind !== "authorization-required") {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    const returnTo = parseDisplayReturnConfiguration(command.returnTo);
    if (returnTo.kind === "failure") {
      emitDiagnostic("authorization", "invalid-display-return-configuration");
      return;
    }

    const transitioned = transition({ kind: "begin-authorization" });
    if (!transitioned) {
      return;
    }

    const authClock = currentBrowserAuthClock();
    if (authClock.kind === "unavailable") {
      transitionToFailure(providerFailure("network"));
      return;
    }

    const operation = startOperation();
    try {
      const configuration = activeConfiguration();
      if (configuration.kind === "unavailable") {
        return;
      }

      const redirect = await beginSpotifyAuthorization({
        configuration: configuration.value,
        crypto: ports.auth.crypto,
        clock: authClock.value,
        storage: cancellationAwareStorage(operation),
        returnTo: returnTo.value,
      });
      if (!isCurrentOperation(operation)) {
        return;
      }

      const event: PlaybackWorkerEvent = {
        kind: "authorization-redirect",
        url: redirect.url,
      };
      ports.events.emit(Object.freeze(event));
    } catch {
      if (isCurrentOperation(operation)) {
        emitDiagnostic("authorization", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
      }
    } finally {
      finishOperation(operation);
    }
  }

  async function consumeCallback(
    command: PlaybackWorkerConsumeCallbackCommand,
  ): Promise<void> {
    if (!isRuntimeActive()) {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    let callbackUrl: URL;
    try {
      callbackUrl = new URL(command.callbackUrl);
    } catch {
      emitDiagnostic("authorization", "invalid-callback-url");
      return;
    }

    if (playbackState.kind === "authorization-required") {
      const started = transition({ kind: "begin-authorization" });
      if (!started) {
        return;
      }
    } else if (playbackState.kind !== "authorizing") {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    const authClock = currentBrowserAuthClock();
    if (authClock.kind === "unavailable") {
      transitionToFailure(providerFailure("network"));
      return;
    }

    const operation = startOperation();
    try {
      const configuration = activeConfiguration();
      if (configuration.kind === "unavailable") {
        return;
      }

      const result = await consumeSpotifyAuthorizationCallback({
        configuration: configuration.value,
        callbackUrl,
        clock: authClock.value,
        fetch: ports.auth.fetch,
        signal: operation.controller.signal,
        storage: cancellationAwareStorage(operation),
      });
      if (!isCurrentOperation(operation)) {
        return;
      }

      await handleConsumedCallback(result, operation);
    } catch {
      if (isCurrentOperation(operation)) {
        emitDiagnostic("authorization", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
      }
    } finally {
      finishOperation(operation);
    }
  }

  async function handleConsumedCallback(
    result: ConsumeSpotifyAuthorizationCallbackResult,
    operation: RuntimeOperation,
  ): Promise<void> {
    switch (result.kind) {
      case "connected": {
        const connected = transition({ kind: "authorization-complete" });
        if (
          !connected ||
          !installAccessToken(result.accessToken, result.expiresIn)
        ) {
          return;
        }

        retryPosition = 0;
        await pollWithCurrentToken(operation, true);
        return;
      }
      case "authorization-denied":
        emitDiagnostic("authorization", "authorization-denied");
        transitionToFailure({
          kind: "authorization-failed",
          reason: "authorization-denied",
        });
        return;
      case "malformed-callback":
        emitDiagnostic("authorization", "authorization-required");
        transition({
          kind: "authorization-required",
          reason: "not-authorized",
        });
        return;
      case "authorization-required":
        emitDiagnostic("authorization", "authorization-required");
        transition({
          kind: "authorization-required",
          reason: "not-authorized",
        });
        return;
      case "transient-failure":
        emitDiagnostic("authorization", "authorization-transient-failure");
        transitionToFailure(providerFailure("network"));
        return;
      case "provider-failure":
        emitDiagnostic("authorization", "authorization-provider-failure");
        transitionToFailure({
          kind: "authorization-failed",
          reason: "code-exchange-rejected",
        });
        return;
    }

    emitDiagnostic("authorization", "runtime-operation-failed");
  }

  async function retryConnection(): Promise<void> {
    if (!isRuntimeActive()) {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    if (playbackState.kind === "authorizing") {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    if (playbackState.kind === "authorization-required") {
      emitDiagnostic("command", "command-not-allowed");
      return;
    }

    await recoverConnection();
  }

  function receiveVisibilityChange(
    nextVisibility: WorkerVisibility,
  ): Promise<void> {
    if (!isRuntimeActive()) {
      emitDiagnostic("command", "command-not-allowed");
      return Promise.resolve();
    }

    visibility = nextVisibility;
    if (nextVisibility === "hidden") {
      cancelRuntimeWork();
      return Promise.resolve();
    }

    if (playbackState.kind === "authorizing") {
      transition({ kind: "authorization-required", reason: "not-authorized" });
      return Promise.resolve();
    }

    return enqueue(recoverConnection);
  }

  function receiveLogout(): Promise<void> {
    if (!isRuntimeActive()) {
      emitDiagnostic("command", "command-not-allowed");
      return Promise.resolve();
    }

    cancelRuntimeWork();
    accessTokenState = frozenMissingAccessToken();
    retryPosition = 0;
    transition({ kind: "authorization-required", reason: "not-authorized" });

    return enqueue(async (): Promise<void> => {
      try {
        await logoutSpotifyAuthorization(ports.auth.storage);
      } catch {
        emitDiagnostic("storage", "storage-failure");
      }
    });
  }

  function receiveDispose(): void {
    if (runtimeStatus.kind === "disposed") {
      return;
    }

    cancelRuntimeWork();
    accessTokenState = frozenMissingAccessToken();
    retryPosition = 0;
    runtimeStatus = frozenDisposedRuntime();
  }

  async function recoverConnection(): Promise<void> {
    if (!canPerformNetworkWork()) {
      return;
    }

    if (playbackState.kind === "authorization-required") {
      return;
    }

    if (playbackState.kind === "authorizing") {
      return;
    }

    if (playbackState.kind === "failure") {
      const retried = transition({ kind: "retry" });
      if (!retried) {
        return;
      }
    }

    const operation = startOperation();
    try {
      if (accessTokenState.kind === "missing") {
        await refreshAndUseToken(operation, "poll");
        return;
      }

      if (refreshSchedule.kind === "none") {
        scheduleRefreshForAccessToken();
      }

      const now = readCurrentTime();
      if (now.kind === "unavailable") {
        transitionToFailure(providerFailure("network"));
        return;
      }

      if (
        now.epochMilliseconds >= accessTokenState.refreshAtEpochMilliseconds
      ) {
        await refreshAndUseToken(operation, "poll");
        return;
      }

      await pollWithCurrentToken(operation, true);
    } catch {
      if (isCurrentOperation(operation)) {
        emitDiagnostic("playback-poll", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
      }
    } finally {
      finishOperation(operation);
    }
  }

  async function refreshAndUseToken(
    operation: RuntimeOperation,
    afterSuccess: "poll" | "wait",
  ): Promise<void> {
    const refreshed = await refreshAccessToken(operation);
    if (!isCurrentOperation(operation)) {
      return;
    }

    switch (refreshed.kind) {
      case "success":
        if (!installAccessToken(refreshed.accessToken, refreshed.expiresIn)) {
          return;
        }

        if (!markAuthorizationAvailable()) {
          return;
        }

        retryPosition = 0;
        if (afterSuccess === "poll") {
          await pollWithCurrentToken(operation, true);
          return;
        }

        if (pollSchedule.kind === "none") {
          schedulePoll(0);
        }
        return;
      case "authorization-required":
        accessTokenState = frozenMissingAccessToken();
        cancelAllSchedules();
        emitDiagnostic("token-refresh", "authorization-required");
        transition({
          kind: "authorization-required",
          reason:
            refreshed.reason === "invalid-credentials"
              ? "authorization-revoked"
              : "not-authorized",
        });
        return;
      case "transient-failure":
        emitDiagnostic("token-refresh", "authorization-transient-failure");
        scheduleRefreshRetry();
        return;
      case "provider-failure":
        emitDiagnostic("token-refresh", "authorization-provider-failure");
        transitionToFailure(providerFailure("malformed-response"));
        return;
      case "unexpected":
        emitDiagnostic("token-refresh", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
        return;
    }

    emitDiagnostic("token-refresh", "runtime-operation-failed");
  }

  async function pollWithCurrentToken(
    operation: RuntimeOperation,
    mayRefreshAfterUnauthorized: boolean,
  ): Promise<void> {
    if (!isCurrentOperation(operation)) {
      return;
    }

    if (accessTokenState.kind === "missing") {
      return;
    }

    let result: SpotifyCurrentlyPlayingResult;
    try {
      result = await ports.spotify.fetchCurrentlyPlaying({
        accessToken: accessTokenState.accessToken,
        signal: operation.controller.signal,
      });
    } catch {
      result = frozenNetworkFailure();
    }

    if (!isCurrentOperation(operation)) {
      return;
    }

    switch (result.kind) {
      case "empty":
        applyEmptyPlayback();
        retryPosition = 0;
        schedulePoll(successfulPollDelayMilliseconds);
        return;
      case "playback":
        if (!applyPlaybackState(result.state)) {
          return;
        }

        retryPosition = 0;
        schedulePoll(successfulPollDelayMilliseconds);
        return;
      case "malformed-response":
        emitDiagnostic("playback-poll", "playback-payload-invalid");
        transitionToFailure(providerFailure("malformed-response"));
        return;
      case "network-failure":
        emitDiagnostic("playback-poll", "playback-network-failure");
        scheduleTransportRetry(nextReconnectDelay());
        return;
      case "server-failure":
        emitDiagnostic(
          "playback-poll",
          "playback-server-failure",
          httpStatusMetadata(result.status),
        );
        scheduleTransportRetry(nextReconnectDelay());
        return;
      case "rate-limited":
        handleRateLimitedPlayback(result);
        return;
      case "permission-denied":
        accessTokenState = frozenMissingAccessToken();
        cancelAllSchedules();
        emitDiagnostic(
          "playback-poll",
          "playback-permission-denied",
          httpStatusMetadata(result.status),
        );
        transition({
          kind: "authorization-required",
          reason: "permission-required",
        });
        return;
      case "unauthorized":
        if (!mayRefreshAfterUnauthorized) {
          accessTokenState = frozenMissingAccessToken();
          cancelAllSchedules();
          emitDiagnostic(
            "playback-poll",
            "playback-unauthorized",
            httpStatusMetadata(result.status),
          );
          transition({
            kind: "authorization-required",
            reason: "authorization-expired",
          });
          return;
        }

        emitDiagnostic(
          "playback-poll",
          "playback-unauthorized",
          httpStatusMetadata(result.status),
        );
        await refreshAfterUnauthorized(operation);
        return;
      case "unexpected-response":
        emitDiagnostic(
          "playback-poll",
          "unexpected-playback-status",
          httpStatusMetadata(result.status),
        );
        transitionToFailure(providerFailure("server-error"));
        return;
    }

    emitDiagnostic("playback-poll", "unsupported-playback-result");
  }

  function handleRateLimitedPlayback(
    result: Extract<
      SpotifyCurrentlyPlayingResult,
      { readonly kind: "rate-limited" }
    >,
  ): void {
    switch (result.retryAfter.kind) {
      case "valid":
        emitDiagnostic(
          "playback-poll",
          "playback-rate-limited",
          httpStatusAndRetryMetadata(
            result.status,
            result.retryAfter.delayMilliseconds,
          ),
        );
        scheduleTransportRetry(result.retryAfter.delayMilliseconds);
        return;
      case "invalid-or-missing":
        const delayMilliseconds = nextReconnectDelay();
        emitDiagnostic(
          "playback-poll",
          "invalid-retry-after",
          httpStatusAndRetryMetadata(result.status, delayMilliseconds),
        );
        scheduleTransportRetry(delayMilliseconds);
        return;
    }

    emitDiagnostic("playback-poll", "unsupported-playback-result");
  }

  async function refreshAfterUnauthorized(
    operation: RuntimeOperation,
  ): Promise<void> {
    const refreshed = await refreshAccessToken(operation);
    if (!isCurrentOperation(operation)) {
      return;
    }

    switch (refreshed.kind) {
      case "success":
        if (!installAccessToken(refreshed.accessToken, refreshed.expiresIn)) {
          return;
        }

        await pollWithCurrentToken(operation, false);
        return;
      case "authorization-required":
        accessTokenState = frozenMissingAccessToken();
        cancelAllSchedules();
        emitDiagnostic("token-refresh", "authorization-required");
        transition({
          kind: "authorization-required",
          reason:
            refreshed.reason === "invalid-credentials"
              ? "authorization-revoked"
              : "not-authorized",
        });
        return;
      case "transient-failure":
        emitDiagnostic("token-refresh", "authorization-transient-failure");
        scheduleRefreshRetry();
        return;
      case "provider-failure":
        emitDiagnostic("token-refresh", "authorization-provider-failure");
        transitionToFailure(providerFailure("malformed-response"));
        return;
      case "unexpected":
        emitDiagnostic("token-refresh", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
        return;
    }

    emitDiagnostic("token-refresh", "runtime-operation-failed");
  }

  async function refreshAccessToken(
    operation: RuntimeOperation,
  ): Promise<RuntimeRefreshResult> {
    if (refreshFlight.kind === "running") {
      return refreshFlight.result;
    }

    const configuration = activeConfiguration();
    if (configuration.kind === "unavailable") {
      return frozenUnexpectedRefreshResult();
    }

    const result = requestRefreshConnection(configuration.value, operation);
    refreshFlight = frozenRunningRefreshFlight(operation.epoch, result);
    try {
      return await result;
    } finally {
      if (
        refreshFlight.kind === "running" &&
        refreshFlight.operationEpoch === operation.epoch
      ) {
        refreshFlight = frozenIdleRefreshFlight();
      }
    }
  }

  async function requestRefreshConnection(
    configuration: SpotifyPublicConfiguration,
    operation: RuntimeOperation,
  ): Promise<RuntimeRefreshResult> {
    try {
      return await refreshSpotifyConnection({
        configuration,
        fetch: ports.auth.fetch,
        signal: operation.controller.signal,
        storage: cancellationAwareStorage(operation),
      });
    } catch {
      return frozenUnexpectedRefreshResult();
    }
  }

  async function runScheduledRefresh(ticket: number): Promise<void> {
    if (!canPerformNetworkWork() || refreshTicket !== ticket) {
      return;
    }

    if (accessTokenState.kind === "missing") {
      await recoverConnection();
      return;
    }

    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      transitionToFailure(providerFailure("network"));
      return;
    }

    if (now.epochMilliseconds < accessTokenState.refreshAtEpochMilliseconds) {
      scheduleRefreshForAccessToken();
      return;
    }

    const operation = startOperation();
    try {
      await refreshAndUseToken(operation, "wait");
    } catch {
      if (isCurrentOperation(operation)) {
        emitDiagnostic("token-refresh", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
      }
    } finally {
      finishOperation(operation);
    }
  }

  async function runScheduledRetry(ticket: number): Promise<void> {
    if (!canPerformNetworkWork() || retryTicket !== ticket) {
      return;
    }

    await recoverConnection();
  }

  function installAccessToken(
    accessToken: SpotifyAccessToken,
    expiresIn: SpotifyAccessTokenLifetimeSeconds,
  ): boolean {
    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      emitDiagnostic("token-refresh", "runtime-operation-failed");
      return false;
    }

    const lifetimeMilliseconds = expiresIn.toMilliseconds();
    if (
      now.epochMilliseconds >
      Number.MAX_SAFE_INTEGER - lifetimeMilliseconds
    ) {
      emitDiagnostic("token-refresh", "runtime-operation-failed");
      return false;
    }

    const expiresAtEpochMilliseconds =
      now.epochMilliseconds + lifetimeMilliseconds;
    const refreshAtEpochMilliseconds = Math.max(
      now.epochMilliseconds,
      expiresAtEpochMilliseconds - accessTokenRefreshLeadMilliseconds,
    );
    accessTokenState = frozenAvailableAccessToken({
      accessToken,
      expiresAtEpochMilliseconds,
      refreshAtEpochMilliseconds,
    });
    scheduleRefreshForAccessToken();
    return true;
  }

  function markAuthorizationAvailable(): boolean {
    if (playbackState.kind === "initializing") {
      return transition({ kind: "authorization-available" });
    }

    return true;
  }

  function applyEmptyPlayback(): boolean {
    return transition({ kind: "playback-empty" });
  }

  function applyPlaybackState(state: PlaybackState): boolean {
    switch (state.kind) {
      case "empty":
        return applyEmptyPlayback();
      case "playing":
        return transition({
          kind: "playback-playing",
          snapshot: state.snapshot,
        });
      case "paused":
        return transition({
          kind: "playback-paused",
          snapshot: state.snapshot,
        });
      case "unsupported":
        return transition({
          kind: "playback-unsupported",
          reason: state.reason,
        });
      case "initializing":
      case "authorization-required":
      case "authorizing":
      case "reconnecting":
      case "failure":
        emitDiagnostic("playback-poll", "unsupported-playback-result");
        transitionToFailure(providerFailure("malformed-response"));
        return false;
    }

    emitDiagnostic("playback-poll", "unsupported-playback-result");
    return false;
  }

  function scheduleRefreshRetry(): void {
    if (canTransitionToReconnecting()) {
      transition({ kind: "connection-lost" });
      scheduleRetry(nextReconnectDelay());
      return;
    }

    transitionToFailure(providerFailure("network"));
    scheduleRetry(nextReconnectDelay());
  }

  function scheduleTransportRetry(delayMilliseconds: number): void {
    if (!canTransitionToReconnecting()) {
      transitionToFailure(providerFailure("network"));
    } else {
      transition({ kind: "connection-lost" });
    }

    scheduleRetry(delayMilliseconds);
  }

  function canTransitionToReconnecting(): boolean {
    switch (playbackState.kind) {
      case "empty":
      case "playing":
      case "paused":
      case "reconnecting":
      case "unsupported":
        return true;
      case "initializing":
      case "authorization-required":
      case "authorizing":
      case "failure":
        return false;
    }

    return false;
  }

  function transitionToFailure(
    failure: Extract<PlaybackEvent, { readonly kind: "failure" }>["failure"],
  ): void {
    cancelAllSchedules();
    transition({ kind: "failure", failure });
  }

  function transition(event: PlaybackEvent): boolean {
    const next = transitionPlaybackState(playbackState, event);
    if (next.kind === "failure") {
      emitDiagnostic("initialization", "invalid-runtime-transition");
      return false;
    }

    playbackState = next.value;
    emitPlaybackState();
    return true;
  }

  function emitPlaybackState(): void {
    const event: PlaybackWorkerEvent = {
      kind: "playback-state",
      state: serializePlaybackState(playbackState),
    };
    ports.events.emit(Object.freeze(event));
  }

  function schedulePoll(delayMilliseconds: number): void {
    if (!canPerformNetworkWork() || !isSafeScheduleDelay(delayMilliseconds)) {
      return;
    }

    clearPollSchedule();
    pollTicket += 1;
    const ticket = pollTicket;
    const scheduled = scheduleWork(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork() || pollTicket !== ticket) {
        return Promise.resolve();
      }

      pollSchedule = frozenNoScheduledWork();
      return enqueue(recoverConnection);
    });
    if (scheduled.kind === "failure") {
      return;
    }

    pollSchedule = frozenScheduledWork(ticket, scheduled.value);
  }

  function scheduleRefreshForAccessToken(): void {
    if (!canPerformNetworkWork() || accessTokenState.kind === "missing") {
      return;
    }

    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      emitDiagnostic("token-refresh", "runtime-operation-failed");
      return;
    }

    const remainingDelay = Math.max(
      0,
      accessTokenState.refreshAtEpochMilliseconds - now.epochMilliseconds,
    );
    const delayMilliseconds = Math.min(
      remainingDelay,
      maximumScheduledDelayMilliseconds,
    );
    clearRefreshSchedule();
    refreshTicket += 1;
    const ticket = refreshTicket;
    const scheduled = scheduleWork(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork() || refreshTicket !== ticket) {
        return Promise.resolve();
      }

      refreshSchedule = frozenNoScheduledWork();
      return enqueue(() => runScheduledRefresh(ticket));
    });
    if (scheduled.kind === "failure") {
      return;
    }

    refreshSchedule = frozenScheduledWork(ticket, scheduled.value);
  }

  function scheduleRetry(delayMilliseconds: number): void {
    if (!canPerformNetworkWork() || !isSafeScheduleDelay(delayMilliseconds)) {
      return;
    }

    clearPollSchedule();
    clearRefreshSchedule();
    clearRetrySchedule();
    retryTicket += 1;
    const ticket = retryTicket;
    const scheduled = scheduleWork(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork() || retryTicket !== ticket) {
        return Promise.resolve();
      }

      retrySchedule = frozenNoScheduledWork();
      return enqueue(() => runScheduledRetry(ticket));
    });
    if (scheduled.kind === "failure") {
      return;
    }

    retrySchedule = frozenScheduledWork(ticket, scheduled.value);
  }

  function scheduleWork(
    delayMilliseconds: number,
    run: () => Promise<void>,
  ):
    | {
        readonly kind: "success";
        readonly value: PlaybackWorkerScheduledTask;
      }
    | {
        readonly kind: "failure";
      } {
    try {
      const task = ports.scheduler.schedule({ delayMilliseconds, run });
      return Object.freeze({ kind: "success", value: task });
    } catch {
      emitDiagnostic("scheduler", "scheduler-failure");
      return Object.freeze({ kind: "failure" });
    }
  }

  function cancelRuntimeWork(): void {
    cancelActiveOperation();
    cancelAllSchedules();
  }

  function cancelAllSchedules(): void {
    clearPollSchedule();
    clearRefreshSchedule();
    clearRetrySchedule();
  }

  function clearPollSchedule(): void {
    pollTicket += 1;
    cancelScheduledWork(pollSchedule);
    pollSchedule = frozenNoScheduledWork();
  }

  function clearRefreshSchedule(): void {
    refreshTicket += 1;
    cancelScheduledWork(refreshSchedule);
    refreshSchedule = frozenNoScheduledWork();
  }

  function clearRetrySchedule(): void {
    retryTicket += 1;
    cancelScheduledWork(retrySchedule);
    retrySchedule = frozenNoScheduledWork();
  }

  function cancelScheduledWork(work: ScheduledWork): void {
    if (work.kind === "none") {
      return;
    }

    try {
      work.task.cancel();
    } catch {
      emitDiagnostic("scheduler", "scheduler-failure");
    }
  }

  function startOperation(): RuntimeOperation {
    operationEpochIncrement();
    const operation: RuntimeOperation = {
      epoch: currentOperationEpoch(),
      controller: ports.cancellation.create(),
    };
    activeOperation = frozenActiveOperation(operation);
    return Object.freeze(operation);
  }

  function operationEpochIncrement(): void {
    if (operationEpoch < Number.MAX_SAFE_INTEGER) {
      operationEpoch += 1;
      return;
    }

    operationEpoch = 1;
  }

  function currentOperationEpoch(): number {
    return operationEpoch;
  }

  function cancelActiveOperation(): void {
    operationEpochIncrement();
    if (activeOperation.kind === "active") {
      activeOperation.controller.abort();
    }

    activeOperation = frozenNoActiveOperation();
  }

  function finishOperation(operation: RuntimeOperation): void {
    if (
      activeOperation.kind === "active" &&
      activeOperation.epoch === operation.epoch
    ) {
      activeOperation = frozenNoActiveOperation();
    }
  }

  function isCurrentOperation(operation: RuntimeOperation): boolean {
    return (
      canPerformNetworkWork() &&
      operationEpoch === operation.epoch &&
      !operation.controller.signal.aborted
    );
  }

  function cancellationAwareStorage(
    operation: RuntimeOperation,
  ): SpotifyAuthStoragePort {
    const storage: SpotifyAuthStoragePort = {
      async savePendingAuthorizationAttempt(attempt): Promise<void> {
        if (!isCurrentOperation(operation)) {
          return;
        }

        await ports.auth.storage.savePendingAuthorizationAttempt(attempt);
      },

      async consumePendingAuthorizationAttempt(
        options: SpotifyPendingAuthorizationAttemptConsumeOptions,
      ): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
        if (!isCurrentOperation(operation)) {
          return frozenRejectedPendingAuthorizationAttempt();
        }

        const result =
          await ports.auth.storage.consumePendingAuthorizationAttempt(options);
        if (!isCurrentOperation(operation)) {
          return frozenRejectedPendingAuthorizationAttempt();
        }

        return result;
      },

      async readSpotifyRefreshTokenConnection(): Promise<SpotifyRefreshTokenConnectionReadResult> {
        if (!isCurrentOperation(operation)) {
          return frozenMissingRefreshTokenConnection();
        }

        const result =
          await ports.auth.storage.readSpotifyRefreshTokenConnection();
        if (!isCurrentOperation(operation)) {
          return frozenMissingRefreshTokenConnection();
        }

        return result;
      },

      async saveSpotifyRefreshTokenConnection(
        connection: SpotifyRefreshTokenConnection,
      ): Promise<void> {
        if (!isCurrentOperation(operation)) {
          return;
        }

        await ports.auth.storage.saveSpotifyRefreshTokenConnection(connection);
      },

      async deleteSpotifyRefreshTokenConnection(): Promise<void> {
        if (!isCurrentOperation(operation)) {
          return;
        }

        await ports.auth.storage.deleteSpotifyRefreshTokenConnection();
      },

      async clearSpotifyAuthorization(): Promise<void> {
        if (!isCurrentOperation(operation)) {
          return;
        }

        await ports.auth.storage.clearSpotifyAuthorization();
      },
    };

    return Object.freeze(storage);
  }

  function failInitialization(
    code: "invalid-public-configuration" | "worker-initialization-failed",
  ): void {
    cancelRuntimeWork();
    runtimeStatus = frozenFatalRuntime();
    ports.events.emit(createFatalInitializationEvent(code));
  }

  function createFatalInitializationEvent(
    code: "invalid-public-configuration" | "worker-initialization-failed",
  ): PlaybackWorkerEvent {
    return Object.freeze({ kind: "fatal-initialization-failure", code });
  }

  function activeConfiguration():
    | {
        readonly kind: "available";
        readonly value: SpotifyPublicConfiguration;
      }
    | {
        readonly kind: "unavailable";
      } {
    if (runtimeStatus.kind !== "active") {
      return Object.freeze({ kind: "unavailable" });
    }

    return Object.freeze({
      kind: "available",
      value: runtimeStatus.configuration,
    });
  }

  function currentBrowserAuthClock():
    | {
        readonly kind: "available";
        readonly value: BrowserAuthClockPort;
      }
    | {
        readonly kind: "unavailable";
      } {
    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      return Object.freeze({ kind: "unavailable" });
    }

    return Object.freeze({
      kind: "available",
      value: createBrowserAuthClockPort(() => now.epochMilliseconds),
    });
  }

  function readCurrentTime(): CurrentTime {
    let epochMilliseconds: number;
    try {
      epochMilliseconds = ports.clock.now();
    } catch {
      return frozenUnavailableCurrentTime();
    }

    if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
      return frozenUnavailableCurrentTime();
    }

    return frozenAvailableCurrentTime(epochMilliseconds);
  }

  function isRuntimeActive(): boolean {
    return runtimeStatus.kind === "active";
  }

  function canPerformNetworkWork(): boolean {
    return isRuntimeActive() && visibility === "visible";
  }

  function nextReconnectDelay(): number {
    const delay = reconnectDelayMilliseconds[retryPosition];
    if (retryPosition < reconnectDelayMilliseconds.length - 1) {
      retryPosition += 1;
    }

    return delay ?? 30_000;
  }

  function emitDiagnostic(
    operation: PlaybackWorkerDiagnosticOperation,
    code: PlaybackWorkerDiagnosticCode,
    metadata: PlaybackWorkerDiagnosticMetadata = noPlaybackWorkerDiagnosticMetadata(),
  ): void {
    ports.events.emit(
      createPlaybackWorkerSafeDiagnostic({ operation, code, metadata }),
    );
  }
}

function parseApplicationUrl(input: string):
  | {
      readonly kind: "success";
      readonly value: URL;
    }
  | {
      readonly kind: "failure";
    } {
  try {
    const url = new URL(input);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return Object.freeze({ kind: "failure" });
    }

    return Object.freeze({ kind: "success", value: url });
  } catch {
    return Object.freeze({ kind: "failure" });
  }
}

function httpStatusMetadata(status: number): PlaybackWorkerDiagnosticMetadata {
  return Object.freeze({ kind: "http-status", status });
}

function httpStatusAndRetryMetadata(
  status: number,
  retryAfterMilliseconds: number,
): PlaybackWorkerDiagnosticMetadata {
  return Object.freeze({
    kind: "http-status-and-retry-after",
    status,
    retryAfterMilliseconds,
  });
}

function isSafeScheduleDelay(delayMilliseconds: number): boolean {
  return (
    Number.isSafeInteger(delayMilliseconds) &&
    delayMilliseconds >= 0 &&
    delayMilliseconds <= maximumScheduledDelayMilliseconds
  );
}

function frozenAwaitingInitialization(): RuntimeStatus {
  return Object.freeze({ kind: "awaiting-initialization" });
}

function frozenActiveRuntime(
  configuration: SpotifyPublicConfiguration,
): RuntimeStatus {
  return Object.freeze({ kind: "active", configuration });
}

function frozenDisposedRuntime(): RuntimeStatus {
  return Object.freeze({ kind: "disposed" });
}

function frozenFatalRuntime(): RuntimeStatus {
  return Object.freeze({ kind: "fatal" });
}

function frozenMissingAccessToken(): AccessTokenState {
  return Object.freeze({ kind: "missing" });
}

function frozenAvailableAccessToken(input: {
  readonly accessToken: SpotifyAccessToken;
  readonly expiresAtEpochMilliseconds: number;
  readonly refreshAtEpochMilliseconds: number;
}): AccessTokenState {
  return Object.freeze({ kind: "available", ...input });
}

function frozenNoScheduledWork(): ScheduledWork {
  return Object.freeze({ kind: "none" });
}

function frozenScheduledWork(
  ticket: number,
  task: PlaybackWorkerScheduledTask,
): ScheduledWork {
  return Object.freeze({ kind: "scheduled", ticket, task });
}

function frozenNoActiveOperation(): ActiveOperation {
  return Object.freeze({ kind: "none" });
}

function frozenActiveOperation(operation: RuntimeOperation): ActiveOperation {
  return Object.freeze({
    kind: "active",
    epoch: operation.epoch,
    controller: operation.controller,
  });
}

function frozenIdleRefreshFlight(): RefreshFlight {
  return Object.freeze({ kind: "idle" });
}

function frozenRunningRefreshFlight(
  operationEpoch: number,
  result: Promise<RuntimeRefreshResult>,
): RefreshFlight {
  return Object.freeze({ kind: "running", operationEpoch, result });
}

function frozenAvailableCurrentTime(epochMilliseconds: number): CurrentTime {
  return Object.freeze({ kind: "available", epochMilliseconds });
}

function frozenUnavailableCurrentTime(): CurrentTime {
  return Object.freeze({ kind: "unavailable" });
}

function frozenUnexpectedRefreshResult(): RuntimeRefreshResult {
  return Object.freeze({ kind: "unexpected" });
}

function frozenNetworkFailure(): SpotifyCurrentlyPlayingResult {
  return Object.freeze({ kind: "network-failure" });
}

function frozenRejectedPendingAuthorizationAttempt(): SpotifyPendingAuthorizationAttemptConsumeResult {
  return Object.freeze({ kind: "rejected", reason: "missing-attempt" });
}

function frozenMissingRefreshTokenConnection(): SpotifyRefreshTokenConnectionReadResult {
  return Object.freeze({ kind: "connection-missing" });
}
