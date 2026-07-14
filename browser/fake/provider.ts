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
  createProviderLink,
  createTrackItem,
  availableOriginalArtwork,
  parseDisplayText,
  parseOriginalArtworkUrl,
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  parseProviderCollectionId,
  parseProviderId,
  parseProviderItemId,
  unavailableOriginalArtwork,
  type NowPlayingItem,
  type Collection,
  type Creator,
  type OriginalArtwork,
  type PlaybackState,
  type PlaybackSnapshot,
  type ProviderId,
  type Show,
} from "../../domain/playback.ts";
import type {
  FakeControlCommand,
  FakePlaybackMode,
  FakeProviderFailure,
  FakeTrackCreator,
} from "./control.ts";

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
  const providerId = validatedProviderId();
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
  const itemId = parseProviderItemId(command.itemId);
  const title = parseDisplayText(command.title);
  const collectionId = parseProviderCollectionId(command.collectionId);
  const collectionTitle = parseDisplayText(command.collectionTitle);
  const itemLink = providerLink(providerId, command.itemUrl);
  const collectionLink = providerLink(providerId, command.collectionUrl);
  const artwork = originalArtwork(command.artworkUrl);
  const creators = fakeCreators(command.creators, providerId);
  if (
    itemId.kind === "failure" ||
    title.kind === "failure" ||
    collectionId.kind === "failure" ||
    collectionTitle.kind === "failure" ||
    itemLink.kind === "failure" ||
    collectionLink.kind === "failure" ||
    artwork.kind === "failure" ||
    creators.kind === "failure"
  ) {
    return { kind: "failure" };
  }

  const track = createTrackItem({
    providerId,
    itemId: itemId.value,
    title: title.value,
    artists: creators.value,
    collection: {
      id: collectionId.value,
      title: collectionTitle.value,
      links: [collectionLink.value],
    } satisfies Collection,
    artwork: artwork.value,
    links: [itemLink.value],
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
  const itemId = parseProviderItemId(command.itemId);
  const title = parseDisplayText(command.title);
  const showId = parseProviderCollectionId(command.showId);
  const showTitle = parseDisplayText(command.showTitle);
  const publisher = parseDisplayText(command.publisher);
  const itemLink = providerLink(providerId, command.itemUrl);
  const showLink = providerLink(providerId, command.showUrl);
  const artwork = originalArtwork(command.artworkUrl);
  if (
    itemId.kind === "failure" ||
    title.kind === "failure" ||
    showId.kind === "failure" ||
    showTitle.kind === "failure" ||
    publisher.kind === "failure" ||
    itemLink.kind === "failure" ||
    showLink.kind === "failure" ||
    artwork.kind === "failure"
  ) {
    return { kind: "failure" };
  }

  const episode = createEpisodeItem({
    providerId,
    itemId: itemId.value,
    title: title.value,
    show: {
      id: showId.value,
      title: showTitle.value,
      publisher: publisher.value,
      links: [showLink.value],
    } satisfies Show,
    artwork: artwork.value,
    links: [itemLink.value],
  });
  return episode.kind === "success"
    ? { kind: "success", value: episode.value }
    : { kind: "failure" };
}

function fakeCreators(
  source: ReadonlyArray<FakeTrackCreator>,
  providerId: ProviderId,
):
  | { readonly kind: "success"; readonly value: ReadonlyArray<Creator> }
  | { readonly kind: "failure" } {
  const creators: Creator[] = [];
  for (const value of source) {
    const name = parseDisplayText(value.name);
    const link = providerLink(providerId, value.url);
    if (name.kind === "failure" || link.kind === "failure") {
      return { kind: "failure" };
    }

    creators.push({ name: name.value, links: [link.value] } satisfies Creator);
  }

  return { kind: "success", value: creators };
}

function providerLink(providerId: ProviderId, href: string) {
  return createProviderLink({ providerId, href });
}

function originalArtwork(
  source: string | null,
):
  | { readonly kind: "success"; readonly value: OriginalArtwork }
  | { readonly kind: "failure" } {
  if (source === null) {
    return {
      kind: "success",
      value: unavailableOriginalArtwork("provider-did-not-supply-artwork"),
    };
  }

  const url = parseOriginalArtworkUrl(source);
  return url.kind === "success"
    ? {
        kind: "success",
        value: availableOriginalArtwork(url.value),
      }
    : { kind: "failure" };
}

function fakeSnapshot(
  item: NowPlayingItem,
):
  | { readonly kind: "success"; readonly value: PlaybackSnapshot }
  | { readonly kind: "failure" } {
  const position = parsePlaybackPositionMilliseconds(45_000);
  const duration = parsePlaybackDurationMilliseconds(180_000);
  if (position.kind === "failure" || duration.kind === "failure") {
    return { kind: "failure" };
  }

  return createPlaybackSnapshot({
    item,
    position: position.value,
    duration: duration.value,
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

function validatedProviderId(): ProviderId {
  const providerId = parseProviderId("fake");
  if (providerId.kind === "failure") {
    throw new Error("The Fake Music provider identifier is invalid.");
  }

  return providerId.value;
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
