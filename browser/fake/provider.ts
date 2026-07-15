import type {
  AuthorizationConnectionResult,
  AuthorizationProviderPort,
  AuthorizationSessionPort,
  BeginAuthorizationResult,
  PlaybackCredential,
  PlaybackCredentialLifetime,
} from "../auth/provider.ts";
import type {
  PlaybackProviderPort,
  PlaybackProviderResult,
} from "../providers/provider.ts";
import {
  createEpisodeItem,
  createPlaybackSnapshot,
  createTrackItem,
  type Creator,
  type NowPlayingItem,
  type PlaybackSnapshot,
} from "../../domain/playback-item.ts";
import {
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  type ProviderId,
  type ValueValidationError,
} from "../../domain/playback-values.ts";
import { type PlaybackState } from "../../domain/playback.ts";
import { type Result } from "../../domain/result.ts";
import { fakeProviderId } from "../providers/provider-identifiers.ts";
import type {
  FakeControlCommand,
  FakePlaybackMode,
  FakeProviderFailure,
} from "./control-contract.ts";

const fakePlaybackPosition = requiredFakeValue(
  parsePlaybackPositionMilliseconds(45_000),
);
const fakePlaybackDuration = requiredFakeValue(
  parsePlaybackDurationMilliseconds(180_000),
);

const fakeCredential: PlaybackCredential = {
  toMemoryValue(): string {
    return "fake-memory-credential";
  },
};
const fakeCredentialLifetime: PlaybackCredentialLifetime = {
  toMilliseconds(): number {
    return 60 * 60 * 1_000;
  },
};

type PendingAuthorization =
  | { readonly kind: "none" }
  | {
      readonly kind: "pending";
      readonly abort: () => void;
      readonly resolve: (result: BeginAuthorizationResult) => void;
      readonly signal: AbortSignal;
    };

type FakeAuthorizationState =
  | { readonly kind: "authorized" }
  | { readonly kind: "expired" }
  | { readonly kind: "missing" };

export type FakeControlApplicationResult =
  | { readonly kind: "none" }
  | { readonly kind: "playback-changed" }
  | {
      readonly kind: "fatal";
      readonly reason:
        "browser-capability-unavailable" | "configuration-unavailable";
    };

export type FakeMusicProviderRuntime = {
  readonly applyControl: (
    command: FakeControlCommand,
  ) => FakeControlApplicationResult;
  readonly authorization: AuthorizationProviderPort;
  readonly dispose: () => void;
  readonly playback: PlaybackProviderPort;
};

export function createFakeMusicProviderRuntime(): FakeMusicProviderRuntime {
  const providerId = fakeProviderId;
  let authorizationState: FakeAuthorizationState = {
    kind: "missing",
  };
  let pendingAuthorization: PendingAuthorization = {
    kind: "none",
  };
  let playbackResult: PlaybackProviderResult = { kind: "empty" };

  const authorizationSession: AuthorizationSessionPort = {
    beginAuthorization(options): Promise<BeginAuthorizationResult> {
      if (pendingAuthorization.kind === "pending") {
        return Promise.resolve({ kind: "provider-failure" });
      }

      return new Promise<BeginAuthorizationResult>((resolve): void => {
        const abort = (): void => {
          resolvePendingAuthorization({ kind: "transient-failure" });
        };
        pendingAuthorization = {
          kind: "pending",
          abort,
          resolve,
          signal: options.signal,
        };
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) {
          abort();
        }
      });
    },

    cancelPendingWork(): void {
      resolvePendingAuthorization({ kind: "transient-failure" });
    },

    consumeCallback(): Promise<never> {
      return Promise.reject(
        new Error("Fake Music does not support authorization callbacks."),
      );
    },

    async logout(): Promise<void> {
      reset();
    },

    recoverConnection(): Promise<AuthorizationConnectionResult> {
      return Promise.resolve(connectionResult());
    },

    refreshCredential(): Promise<AuthorizationConnectionResult> {
      return Promise.resolve(connectionResult());
    },
  };

  const authorization: AuthorizationProviderPort = {
    initialize(options) {
      if (
        options.applicationUrl.pathname !== "/fake/" ||
        !isFakeConfiguration(options.configuration)
      ) {
        return {
          kind: "failure",
          error: { kind: "invalid-provider-configuration" },
        };
      }

      return { kind: "success", value: authorizationSession };
    },
  };

  const playback: PlaybackProviderPort = {
    providerId,
    fetchCurrentlyPlaying(request): Promise<PlaybackProviderResult> {
      if (request.signal.aborted) {
        return Promise.resolve({ kind: "network-failure" });
      }

      if (authorizationState.kind !== "authorized") {
        return Promise.resolve({ kind: "unauthorized", status: 401 });
      }

      return Promise.resolve(playbackResult);
    },
  };

  const runtime: FakeMusicProviderRuntime = {
    applyControl(command): FakeControlApplicationResult {
      switch (command.kind) {
        case "resolve-authorization":
          resolveAuthorization(command.decision);
          return { kind: "none" };
        case "expire-authorization":
          if (authorizationState.kind === "authorized") {
            authorizationState = { kind: "expired" };
            return { kind: "playback-changed" };
          }
          return { kind: "none" };
        case "set-empty":
          playbackResult = { kind: "empty" };
          return playbackChangedIfAuthorized();
        case "set-track":
        case "set-episode": {
          const content = playbackFromCommand(command, providerId);
          playbackResult = content;
          return playbackChangedIfAuthorized();
        }
        case "set-unsupported":
          playbackResult = {
            kind: "playback",
            state: {
              kind: "unsupported",
              reason: command.reason,
            },
          };
          return playbackChangedIfAuthorized();
        case "set-provider-failure":
          playbackResult = playbackFailure(command.failure);
          return playbackChangedIfAuthorized();
        case "set-fatal":
          return { kind: "fatal", reason: command.reason };
      }

      return unreachable(command);
    },
    authorization,
    dispose: reset,
    playback,
  };

  return runtime;

  function resolveAuthorization(decision: "approved" | "denied"): void {
    if (pendingAuthorization.kind !== "pending") {
      return;
    }

    if (decision === "approved") {
      authorizationState = { kind: "authorized" };
      resolvePendingAuthorization({
        kind: "connected",
        credential: fakeCredential,
        lifetime: fakeCredentialLifetime,
      });
      return;
    }

    authorizationState = { kind: "missing" };
    resolvePendingAuthorization({
      kind: "authorization-required",
      reason: "not-authorized",
    });
  }

  function playbackChangedIfAuthorized(): FakeControlApplicationResult {
    return authorizationState.kind === "authorized"
      ? { kind: "playback-changed" }
      : { kind: "none" };
  }

  function resolvePendingAuthorization(result: BeginAuthorizationResult): void {
    if (pendingAuthorization.kind !== "pending") {
      return;
    }

    const pending = pendingAuthorization;
    pendingAuthorization = { kind: "none" };
    pending.signal.removeEventListener("abort", pending.abort);
    pending.resolve(result);
  }

  function connectionResult(): AuthorizationConnectionResult {
    const state = authorizationState;
    switch (state.kind) {
      case "authorized":
        return {
          kind: "success",
          credential: fakeCredential,
          lifetime: fakeCredentialLifetime,
        };
      case "expired":
        return {
          kind: "authorization-required",
          reason: "authorization-expired",
        };
      case "missing":
        return {
          kind: "authorization-required",
          reason: "missing-connection",
        };
    }

    return unreachable(state);
  }

  function reset(): void {
    resolvePendingAuthorization({ kind: "transient-failure" });
    authorizationState = { kind: "missing" };
    playbackResult = { kind: "empty" };
  }
}

function playbackFromCommand(
  command: Extract<
    FakeControlCommand,
    { readonly kind: "set-episode" | "set-track" }
  >,
  providerId: ProviderId,
): PlaybackProviderResult {
  const item =
    command.kind === "set-track"
      ? trackFromCommand(command, providerId)
      : episodeFromCommand(command, providerId);
  if (item.kind === "failure") {
    return { kind: "malformed-response" };
  }

  const snapshot = fakeSnapshot(item.value);
  if (snapshot.kind === "failure") {
    return { kind: "malformed-response" };
  }

  return {
    kind: "playback",
    state: playbackState(command.playback, snapshot.value),
  };
}

function trackFromCommand(
  command: Extract<FakeControlCommand, { readonly kind: "set-track" }>,
  providerId: ProviderId,
):
  | { readonly kind: "success"; readonly value: NowPlayingItem }
  | { readonly kind: "failure" } {
  const track = createTrackItem({
    providerId,
    itemId: command.itemId,
    title: command.title,
    artists: command.creators.map((creator): Creator => creator.creator),
    collection: command.collection,
    artwork: command.artwork,
    links: [command.itemLink],
  });
  return track.kind === "success"
    ? { kind: "success", value: track.value }
    : { kind: "failure" };
}

function episodeFromCommand(
  command: Extract<FakeControlCommand, { readonly kind: "set-episode" }>,
  providerId: ProviderId,
):
  | { readonly kind: "success"; readonly value: NowPlayingItem }
  | { readonly kind: "failure" } {
  const episode = createEpisodeItem({
    providerId,
    itemId: command.itemId,
    title: command.title,
    show: command.show,
    artwork: command.artwork,
    links: [command.itemLink],
  });
  return episode.kind === "success"
    ? { kind: "success", value: episode.value }
    : { kind: "failure" };
}

function fakeSnapshot(
  item: NowPlayingItem,
):
  | { readonly kind: "success"; readonly value: PlaybackSnapshot }
  | { readonly kind: "failure" } {
  return createPlaybackSnapshot({
    item,
    position: fakePlaybackPosition,
    duration: fakePlaybackDuration,
  });
}

function playbackState(
  mode: FakePlaybackMode,
  snapshot: PlaybackSnapshot,
): PlaybackState {
  return mode === "playing"
    ? { kind: "playing", snapshot }
    : { kind: "paused", snapshot };
}

function requiredFakeValue<Value>(
  result: Result<Value, ValueValidationError>,
): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("A fixed Fake Music playback value is invalid.");
}

function playbackFailure(failure: FakeProviderFailure): PlaybackProviderResult {
  switch (failure.kind) {
    case "malformed-response":
    case "network-failure":
      return { kind: failure.kind };
    case "permission-denied":
      return { kind: "permission-denied", status: 403 };
    case "rate-limited":
      return {
        kind: "rate-limited",
        status: 429,
        retryAfter:
          failure.retryAfterMilliseconds === null
            ? { kind: "invalid-or-missing" }
            : {
                kind: "valid",
                delayMilliseconds: failure.retryAfterMilliseconds,
              },
      };
    case "server-failure":
      return {
        kind: "server-failure",
        status: failure.status,
      };
    case "unauthorized":
      return { kind: "unauthorized", status: 401 };
    case "unexpected-response":
      return {
        kind: "unexpected-response",
        status: failure.status,
      };
  }

  return unreachable(failure);
}

function isFakeConfiguration(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const names = Object.getOwnPropertyNames(input);
  if (names.length !== 1 || names[0] !== "fake") {
    return false;
  }

  const fake = Object.getOwnPropertyDescriptor(input, "fake");
  if (fake === undefined || !("value" in fake)) {
    return false;
  }

  return (
    typeof fake.value === "object" &&
    fake.value !== null &&
    !Array.isArray(fake.value) &&
    Object.getOwnPropertyNames(fake.value).length === 0 &&
    Object.getOwnPropertySymbols(fake.value).length === 0
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Fake Music value: ${String(value)}`);
}
