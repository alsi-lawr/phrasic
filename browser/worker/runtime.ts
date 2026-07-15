import {
  type AuthorizationConnectionResult,
  type AuthorizationSessionPort,
  type BeginAuthorizationResult,
  type ConsumeAuthorizationCallbackResult,
  type PlaybackCredential,
  type PlaybackCredentialLifetime,
} from "../auth/provider.ts";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackEvent,
  type PlaybackState,
} from "../../domain/playback.ts";
import { maximumPlatformTimerDelayMilliseconds } from "../../domain/playback-values.ts";
import { type PlaybackProviderResult } from "../providers/provider.ts";
import {
  createPlaybackWorkerFatalInitializationFailure,
  createPlaybackWorkerSafeDiagnostic,
  noPlaybackWorkerDiagnosticMetadata,
  type PlaybackWorkerBeginAuthorizationCommand,
  type PlaybackWorkerCommand,
  type PlaybackWorkerConsumeCallbackCommand,
  type PlaybackWorkerDiagnosticCode,
  type PlaybackWorkerDiagnosticMetadata,
  type PlaybackWorkerDiagnosticOperation,
  type PlaybackWorkerEvent,
  type PlaybackWorkerInitializeCommand,
} from "./protocol.ts";
import type { PlaybackWorkerRuntimePorts } from "./runtime-ports.ts";
import { createScheduledTaskSlot } from "./scheduled-task-slot.ts";

const successfulPollDelayMilliseconds = 5_000;
const accessTokenRefreshLeadMilliseconds = 60_000;
const maximumScheduledDelayMilliseconds = maximumPlatformTimerDelayMilliseconds;
const reconnectDelayMilliseconds: ReadonlyArray<number> = [
  1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
];

export type PlaybackWorkerRuntime = {
  readonly receive: (message: PlaybackWorkerCommand) => Promise<void>;
};

type RuntimeStatus =
  | {
      readonly kind: "awaiting-initialization";
    }
  | {
      readonly kind: "active";
      readonly authorization: AuthorizationSessionPort;
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
      readonly accessToken: PlaybackCredential;
      readonly expiresAtEpochMilliseconds: number;
      readonly refreshAtEpochMilliseconds: number;
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
  | AuthorizationConnectionResult
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
  let runtimeStatus: RuntimeStatus = awaitingInitialization();
  let visibility: WorkerVisibility = "visible";
  let playbackState: PlaybackState = initialPlaybackState();
  let accessTokenState: AccessTokenState = missingAccessToken();
  let activeOperation: ActiveOperation = noActiveOperation();
  let refreshFlight: RefreshFlight = idleRefreshFlight();
  let queuedWork: Promise<void> = Promise.resolve();
  let retryPosition = 0;
  let operationEpoch = 0;

  const schedulerFailure = (): void => {
    emitDiagnostic("scheduler", "scheduler-failure");
  };
  const pollSlot = createScheduledTaskSlot(ports.scheduler, schedulerFailure);
  const refreshSlot = createScheduledTaskSlot(
    ports.scheduler,
    schedulerFailure,
  );
  const retrySlot = createScheduledTaskSlot(ports.scheduler, schedulerFailure);

  const runtime: PlaybackWorkerRuntime = {
    receive(message: PlaybackWorkerCommand): Promise<void> {
      switch (message.kind) {
        case "initialize":
          return enqueue(() => initialize(message));
        case "begin-authorization":
          return enqueue(() => beginAuthorization(message));
        case "consume-callback":
          cancelRuntimeWork();
          return enqueue(() => consumeCallback(message));
        case "retry":
          cancelRuntimeWork();
          return enqueue(retryConnection);
        case "visibility-change":
          return receiveVisibilityChange(message.visibility);
        case "logout":
          return receiveLogout();
        case "dispose":
          receiveDispose();
          return Promise.resolve();
      }
    },
  };

  return runtime;

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

    let authorization;
    try {
      authorization = ports.authorization.initialize({
        applicationUrl: applicationUrl.value,
        configuration: command.configuration,
      });
    } catch {
      failInitialization("invalid-public-configuration");
      return;
    }

    if (authorization.kind === "failure") {
      failInitialization("invalid-public-configuration");
      return;
    }

    runtimeStatus = activeRuntime(authorization.value);
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

    const transitioned = transition({ kind: "begin-authorization" });
    if (!transitioned) {
      return;
    }

    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      transitionToFailure(providerFailure("network"));
      return;
    }

    const operation = startOperation();
    try {
      const authorization = activeAuthorization();
      if (authorization.kind === "unavailable") {
        return;
      }

      const result = await authorization.value.beginAuthorization({
        nowEpochMilliseconds: now.epochMilliseconds,
        returnTo: command.returnTo,
        signal: operation.controller.signal,
      });
      if (!isCurrentOperation(operation)) {
        return;
      }

      await handleBeginAuthorization(result, operation);
    } catch {
      if (isCurrentOperation(operation)) {
        emitDiagnostic("authorization", "runtime-operation-failed");
        transitionToFailure(providerFailure("network"));
      }
    } finally {
      finishOperation(operation);
    }
  }

  async function handleBeginAuthorization(
    result: BeginAuthorizationResult,
    operation: RuntimeOperation,
  ): Promise<void> {
    switch (result.kind) {
      case "authorization-redirect": {
        const event: PlaybackWorkerEvent = {
          kind: "authorization-redirect",
          url: result.url,
        };
        ports.events.emit(event);
        return;
      }
      case "connected":
        if (
          !transition({ kind: "authorization-complete" }) ||
          !installAccessToken(result.credential, result.lifetime)
        ) {
          return;
        }

        retryPosition = 0;
        await pollWithCurrentToken(operation, true);
        return;
      case "authorization-denied":
        emitDiagnostic("authorization", "authorization-denied");
        transitionToFailure({
          kind: "authorization-failed",
          reason: "authorization-denied",
        });
        return;
      case "authorization-required":
        emitDiagnostic("authorization", "authorization-denied");
        transition({ kind: "authorization-required", reason: result.reason });
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

    return unreachable(result);
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

    const now = readCurrentTime();
    if (now.kind === "unavailable") {
      transitionToFailure(providerFailure("network"));
      return;
    }

    const operation = startOperation();
    try {
      const authorization = activeAuthorization();
      if (authorization.kind === "unavailable") {
        return;
      }

      const result = await authorization.value.consumeCallback({
        callbackUrl,
        nowEpochMilliseconds: now.epochMilliseconds,
        signal: operation.controller.signal,
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
    result: ConsumeAuthorizationCallbackResult,
    operation: RuntimeOperation,
  ): Promise<void> {
    switch (result.kind) {
      case "connected": {
        emitCallbackReturnUrl(result.returnUrl);
        const connected = transition({ kind: "authorization-complete" });
        if (
          !connected ||
          !installAccessToken(result.credential, result.lifetime)
        ) {
          return;
        }

        retryPosition = 0;
        await pollWithCurrentToken(operation, true);
        return;
      }
      case "authorization-denied":
        emitCallbackReturnUrl(result.returnUrl);
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
        if (result.returnUrl.kind === "available") {
          emitCallbackReturnUrl(result.returnUrl.value);
        }
        emitDiagnostic("authorization", "authorization-required");
        transition({
          kind: "authorization-required",
          reason: "not-authorized",
        });
        return;
      case "transient-failure":
        emitCallbackReturnUrl(result.returnUrl);
        emitDiagnostic("authorization", "authorization-transient-failure");
        transitionToFailure(providerFailure("network"));
        return;
      case "provider-failure":
        emitCallbackReturnUrl(result.returnUrl);
        emitDiagnostic("authorization", "authorization-provider-failure");
        transitionToFailure({
          kind: "authorization-failed",
          reason: "code-exchange-rejected",
        });
        return;
    }

    emitDiagnostic("authorization", "runtime-operation-failed");
  }

  function emitCallbackReturnUrl(url: string): void {
    const event: PlaybackWorkerEvent = {
      kind: "callback-url-restored",
      url,
    };
    ports.events.emit(event);
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
    accessTokenState = missingAccessToken();
    retryPosition = 0;
    transition({ kind: "authorization-required", reason: "not-authorized" });

    return enqueue(async (): Promise<void> => {
      const authorization = activeAuthorization();
      if (authorization.kind === "unavailable") {
        return;
      }

      try {
        await authorization.value.logout();
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
    accessTokenState = missingAccessToken();
    retryPosition = 0;
    runtimeStatus = disposedRuntime();
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

      if (!refreshSlot.isScheduled()) {
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
        if (!installAccessToken(refreshed.credential, refreshed.lifetime)) {
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

        if (!pollSlot.isScheduled()) {
          schedulePoll(0);
        }
        return;
      case "authorization-required":
        accessTokenState = missingAccessToken();
        cancelAllSchedules();
        emitDiagnostic("token-refresh", "authorization-required");
        transition({
          kind: "authorization-required",
          reason: authorizationRequiredReason(refreshed.reason),
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

    let result: PlaybackProviderResult;
    try {
      result = await ports.playbackProvider.fetchCurrentlyPlaying({
        accessToken: accessTokenState.accessToken,
        signal: operation.controller.signal,
      });
    } catch {
      result = networkFailure();
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
        accessTokenState = missingAccessToken();
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
          accessTokenState = missingAccessToken();
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
    result: Extract<PlaybackProviderResult, { readonly kind: "rate-limited" }>,
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
        if (!installAccessToken(refreshed.credential, refreshed.lifetime)) {
          return;
        }

        await pollWithCurrentToken(operation, false);
        return;
      case "authorization-required":
        accessTokenState = missingAccessToken();
        cancelAllSchedules();
        emitDiagnostic("token-refresh", "authorization-required");
        transition({
          kind: "authorization-required",
          reason: authorizationRequiredReason(refreshed.reason),
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

    const authorization = activeAuthorization();
    if (authorization.kind === "unavailable") {
      return unexpectedRefreshResult();
    }

    const result = requestRefreshConnection(authorization.value, operation);
    refreshFlight = runningRefreshFlight(operation.epoch, result);
    try {
      return await result;
    } finally {
      if (
        refreshFlight.kind === "running" &&
        refreshFlight.operationEpoch === operation.epoch
      ) {
        refreshFlight = idleRefreshFlight();
      }
    }
  }

  async function requestRefreshConnection(
    authorization: AuthorizationSessionPort,
    operation: RuntimeOperation,
  ): Promise<RuntimeRefreshResult> {
    try {
      const request = {
        signal: operation.controller.signal,
      };
      return accessTokenState.kind === "missing"
        ? await authorization.recoverConnection(request)
        : await authorization.refreshCredential(request);
    } catch {
      return unexpectedRefreshResult();
    }
  }

  async function runScheduledRefresh(): Promise<void> {
    if (!canPerformNetworkWork()) {
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

  async function runScheduledRetry(): Promise<void> {
    if (!canPerformNetworkWork()) {
      return;
    }

    await recoverConnection();
  }

  function installAccessToken(
    accessToken: PlaybackCredential,
    expiresIn: PlaybackCredentialLifetime,
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
    accessTokenState = availableAccessToken({
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
      state: playbackState,
    };
    ports.events.emit(event);
  }

  function schedulePoll(delayMilliseconds: number): void {
    if (!canPerformNetworkWork() || !isSafeScheduleDelay(delayMilliseconds)) {
      return;
    }

    pollSlot.schedule(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork()) {
        return Promise.resolve();
      }

      return enqueue(recoverConnection);
    });
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
    refreshSlot.schedule(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork()) {
        return Promise.resolve();
      }

      return enqueue(runScheduledRefresh);
    });
  }

  function scheduleRetry(delayMilliseconds: number): void {
    if (!canPerformNetworkWork() || !isSafeScheduleDelay(delayMilliseconds)) {
      return;
    }

    pollSlot.cancel();
    refreshSlot.cancel();
    retrySlot.schedule(delayMilliseconds, (): Promise<void> => {
      if (!canPerformNetworkWork()) {
        return Promise.resolve();
      }

      return enqueue(runScheduledRetry);
    });
  }

  function cancelRuntimeWork(): void {
    cancelActiveOperation();
    cancelAllSchedules();
    const authorization = activeAuthorization();
    if (authorization.kind === "available") {
      authorization.value.cancelPendingWork();
    }
  }

  function cancelAllSchedules(): void {
    pollSlot.cancel();
    refreshSlot.cancel();
    retrySlot.cancel();
  }

  function startOperation(): RuntimeOperation {
    operationEpochIncrement();
    const operation: RuntimeOperation = {
      epoch: currentOperationEpoch(),
      controller: ports.cancellation.create(),
    };
    activeOperation = {
      kind: "active",
      epoch: operation.epoch,
      controller: operation.controller,
    };
    return operation;
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

    activeOperation = noActiveOperation();
  }

  function finishOperation(operation: RuntimeOperation): void {
    if (
      activeOperation.kind === "active" &&
      activeOperation.epoch === operation.epoch
    ) {
      activeOperation = noActiveOperation();
    }
  }

  function isCurrentOperation(operation: RuntimeOperation): boolean {
    return (
      canPerformNetworkWork() &&
      operationEpoch === operation.epoch &&
      !operation.controller.signal.aborted
    );
  }

  function failInitialization(
    code: "invalid-public-configuration" | "worker-initialization-failed",
  ): void {
    cancelRuntimeWork();
    runtimeStatus = fatalRuntime();
    ports.events.emit(createPlaybackWorkerFatalInitializationFailure(code));
  }

  function activeAuthorization():
    | {
        readonly kind: "available";
        readonly value: AuthorizationSessionPort;
      }
    | {
        readonly kind: "unavailable";
      } {
    if (runtimeStatus.kind !== "active") {
      return { kind: "unavailable" };
    }

    return {
      kind: "available",
      value: runtimeStatus.authorization,
    };
  }

  function readCurrentTime(): CurrentTime {
    let epochMilliseconds: number;
    try {
      epochMilliseconds = ports.clock.now();
    } catch {
      return unavailableCurrentTime();
    }

    if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
      return unavailableCurrentTime();
    }

    return availableCurrentTime(epochMilliseconds);
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
      return { kind: "failure" };
    }

    return { kind: "success", value: url };
  } catch {
    return { kind: "failure" };
  }
}

function httpStatusMetadata(status: number): PlaybackWorkerDiagnosticMetadata {
  return { kind: "http-status", status };
}

function httpStatusAndRetryMetadata(
  status: number,
  retryAfterMilliseconds: number,
): PlaybackWorkerDiagnosticMetadata {
  return {
    kind: "http-status-and-retry-after",
    status,
    retryAfterMilliseconds,
  };
}

function isSafeScheduleDelay(delayMilliseconds: number): boolean {
  return (
    Number.isSafeInteger(delayMilliseconds) &&
    delayMilliseconds >= 0 &&
    delayMilliseconds <= maximumScheduledDelayMilliseconds
  );
}

function authorizationRequiredReason(
  reason: Extract<
    AuthorizationConnectionResult,
    { readonly kind: "authorization-required" }
  >["reason"],
): "authorization-expired" | "authorization-revoked" | "not-authorized" {
  switch (reason) {
    case "authorization-expired":
      return "authorization-expired";
    case "invalid-credentials":
      return "authorization-revoked";
    case "missing-connection":
      return "not-authorized";
  }

  return unreachable(reason);
}

function awaitingInitialization(): RuntimeStatus {
  return { kind: "awaiting-initialization" };
}

function activeRuntime(authorization: AuthorizationSessionPort): RuntimeStatus {
  return { kind: "active", authorization };
}

function disposedRuntime(): RuntimeStatus {
  return { kind: "disposed" };
}

function fatalRuntime(): RuntimeStatus {
  return { kind: "fatal" };
}

function missingAccessToken(): AccessTokenState {
  return { kind: "missing" };
}

function availableAccessToken(input: {
  readonly accessToken: PlaybackCredential;
  readonly expiresAtEpochMilliseconds: number;
  readonly refreshAtEpochMilliseconds: number;
}): AccessTokenState {
  return { kind: "available", ...input };
}

function noActiveOperation(): ActiveOperation {
  return { kind: "none" };
}

function idleRefreshFlight(): RefreshFlight {
  return { kind: "idle" };
}

function runningRefreshFlight(
  operationEpoch: number,
  result: Promise<RuntimeRefreshResult>,
): RefreshFlight {
  return { kind: "running", operationEpoch, result };
}

function availableCurrentTime(epochMilliseconds: number): CurrentTime {
  return { kind: "available", epochMilliseconds };
}

function unavailableCurrentTime(): CurrentTime {
  return { kind: "unavailable" };
}

function unexpectedRefreshResult(): RuntimeRefreshResult {
  return { kind: "unexpected" };
}

function networkFailure(): PlaybackProviderResult {
  return { kind: "network-failure" };
}

function unreachable(value: never): never {
  throw new Error(`Unexpected authorization result: ${String(value)}`);
}
