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
  Collection,
  Creator,
  EpisodeItem,
  PlaybackSnapshot,
  ProviderLink,
  Show,
  TrackItem,
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
  type OriginalArtwork,
  type PlaybackState,
  type ProviderId,
} from "../../domain/playback.ts";
import type {
  FakeControlCommand,
  FakePlaybackMode,
  FakeProviderFailure,
  FakeTrackCreator,
} from "./control.ts";

const fakeCredential: PlaybackCredential = Object.freeze({
  toMemoryValue(): string {
    return "fake-memory-credential";
  },
});
const fakeCredentialLifetime: PlaybackCredentialLifetime = Object.freeze({
  toMilliseconds(): number {
    return 60 * 60 * 1_000;
  },
});

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
  let authorizationState: FakeAuthorizationState = Object.freeze({
    kind: "missing",
  });
  let pendingAuthorization: PendingAuthorization = Object.freeze({
    kind: "none",
  });
  let playbackResult: PlaybackProviderResult = Object.freeze({ kind: "empty" });

  const authorizationSession: AuthorizationSessionPort = Object.freeze({
    beginAuthorization(options): Promise<BeginAuthorizationResult> {
      if (pendingAuthorization.kind === "pending") {
        return Promise.resolve(Object.freeze({ kind: "provider-failure" }));
      }

      return new Promise<BeginAuthorizationResult>((resolve): void => {
        const abort = (): void => {
          resolvePendingAuthorization(
            Object.freeze({ kind: "transient-failure" }),
          );
        };
        pendingAuthorization = Object.freeze({
          kind: "pending",
          abort,
          resolve,
          signal: options.signal,
        });
        options.signal.addEventListener("abort", abort, { once: true });
        if (options.signal.aborted) {
          abort();
        }
      });
    },

    cancelPendingWork(): void {
      resolvePendingAuthorization(Object.freeze({ kind: "transient-failure" }));
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
  });

  const authorization: AuthorizationProviderPort = Object.freeze({
    initialize(options) {
      if (
        options.applicationUrl.pathname !== "/fake/" ||
        !isFakeConfiguration(options.configuration)
      ) {
        return Object.freeze({
          kind: "failure",
          error: Object.freeze({ kind: "invalid-provider-configuration" }),
        });
      }

      return Object.freeze({ kind: "success", value: authorizationSession });
    },
  });

  const playback: PlaybackProviderPort = Object.freeze({
    providerId,
    fetchCurrentlyPlaying(request): Promise<PlaybackProviderResult> {
      if (request.signal.aborted) {
        return Promise.resolve(Object.freeze({ kind: "network-failure" }));
      }

      if (authorizationState.kind !== "authorized") {
        return Promise.resolve(
          Object.freeze({ kind: "unauthorized", status: 401 }),
        );
      }

      return Promise.resolve(playbackResult);
    },
  });

  const runtime: FakeMusicProviderRuntime = {
    applyControl(command): FakeControlApplicationResult {
      switch (command.kind) {
        case "resolve-authorization":
          resolveAuthorization(command.decision);
          return Object.freeze({ kind: "none" });
        case "expire-authorization":
          if (authorizationState.kind === "authorized") {
            authorizationState = Object.freeze({ kind: "expired" });
            return Object.freeze({ kind: "playback-changed" });
          }
          return Object.freeze({ kind: "none" });
        case "set-empty":
          playbackResult = Object.freeze({ kind: "empty" });
          return playbackChangedIfAuthorized();
        case "set-track":
        case "set-episode": {
          const content = playbackFromCommand(command, providerId);
          playbackResult = content;
          return playbackChangedIfAuthorized();
        }
        case "set-unsupported":
          playbackResult = Object.freeze({
            kind: "playback",
            state: Object.freeze({
              kind: "unsupported",
              reason: command.reason,
            }),
          });
          return playbackChangedIfAuthorized();
        case "set-provider-failure":
          playbackResult = playbackFailure(command.failure);
          return playbackChangedIfAuthorized();
        case "set-fatal":
          return Object.freeze({ kind: "fatal", reason: command.reason });
      }

      return unreachable(command);
    },
    authorization,
    dispose: reset,
    playback,
  };

  return Object.freeze(runtime);

  function resolveAuthorization(decision: "approved" | "denied"): void {
    if (pendingAuthorization.kind !== "pending") {
      return;
    }

    if (decision === "approved") {
      authorizationState = Object.freeze({ kind: "authorized" });
      resolvePendingAuthorization(
        Object.freeze({
          kind: "connected",
          credential: fakeCredential,
          lifetime: fakeCredentialLifetime,
        }),
      );
      return;
    }

    authorizationState = Object.freeze({ kind: "missing" });
    resolvePendingAuthorization(
      Object.freeze({
        kind: "authorization-required",
        reason: "not-authorized",
      }),
    );
  }

  function playbackChangedIfAuthorized(): FakeControlApplicationResult {
    return authorizationState.kind === "authorized"
      ? Object.freeze({ kind: "playback-changed" })
      : Object.freeze({ kind: "none" });
  }

  function resolvePendingAuthorization(result: BeginAuthorizationResult): void {
    if (pendingAuthorization.kind !== "pending") {
      return;
    }

    const pending = pendingAuthorization;
    pendingAuthorization = Object.freeze({ kind: "none" });
    pending.signal.removeEventListener("abort", pending.abort);
    pending.resolve(result);
  }

  function connectionResult(): AuthorizationConnectionResult {
    const state = authorizationState;
    switch (state.kind) {
      case "authorized":
        return Object.freeze({
          kind: "success",
          credential: fakeCredential,
          lifetime: fakeCredentialLifetime,
        });
      case "expired":
        return Object.freeze({
          kind: "authorization-required",
          reason: "authorization-expired",
        });
      case "missing":
        return Object.freeze({
          kind: "authorization-required",
          reason: "missing-connection",
        });
    }

    return unreachable(state);
  }

  function reset(): void {
    resolvePendingAuthorization(Object.freeze({ kind: "transient-failure" }));
    authorizationState = Object.freeze({ kind: "missing" });
    playbackResult = Object.freeze({ kind: "empty" });
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
    return Object.freeze({ kind: "malformed-response" });
  }

  const snapshot = fakeSnapshot(item.value);
  if (snapshot.kind === "failure") {
    return Object.freeze({ kind: "malformed-response" });
  }

  return Object.freeze({
    kind: "playback",
    state: playbackState(command.playback, snapshot.value),
  });
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
    return Object.freeze({ kind: "failure" });
  }

  const track = TrackItem.create({
    providerId,
    itemId: itemId.value,
    title: title.value,
    artists: creators.value,
    collection: Collection.create({
      id: collectionId.value,
      title: collectionTitle.value,
      links: [collectionLink.value],
    }),
    artwork: artwork.value,
    links: [itemLink.value],
  });
  return track.kind === "success"
    ? Object.freeze({ kind: "success", value: track.value })
    : Object.freeze({ kind: "failure" });
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
    return Object.freeze({ kind: "failure" });
  }

  const episode = EpisodeItem.create({
    providerId,
    itemId: itemId.value,
    title: title.value,
    show: Show.create({
      id: showId.value,
      title: showTitle.value,
      publisher: publisher.value,
      links: [showLink.value],
    }),
    artwork: artwork.value,
    links: [itemLink.value],
  });
  return episode.kind === "success"
    ? Object.freeze({ kind: "success", value: episode.value })
    : Object.freeze({ kind: "failure" });
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
      return Object.freeze({ kind: "failure" });
    }

    creators.push(Creator.create({ name: name.value, links: [link.value] }));
  }

  return Object.freeze({ kind: "success", value: Object.freeze(creators) });
}

function providerLink(providerId: ProviderId, href: string) {
  return ProviderLink.create({ providerId, href });
}

function originalArtwork(
  source: string | null,
):
  | { readonly kind: "success"; readonly value: OriginalArtwork }
  | { readonly kind: "failure" } {
  if (source === null) {
    return Object.freeze({
      kind: "success",
      value: unavailableOriginalArtwork("provider-did-not-supply-artwork"),
    });
  }

  const url = parseOriginalArtworkUrl(source);
  return url.kind === "success"
    ? Object.freeze({
        kind: "success",
        value: availableOriginalArtwork(url.value),
      })
    : Object.freeze({ kind: "failure" });
}

function fakeSnapshot(item: NowPlayingItem) {
  const position = parsePlaybackPositionMilliseconds(45_000);
  const duration = parsePlaybackDurationMilliseconds(180_000);
  if (position.kind === "failure" || duration.kind === "failure") {
    return Object.freeze({ kind: "failure" });
  }

  return PlaybackSnapshot.create({
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
    ? Object.freeze({ kind: "playing", snapshot })
    : Object.freeze({ kind: "paused", snapshot });
}

function playbackFailure(failure: FakeProviderFailure): PlaybackProviderResult {
  switch (failure.kind) {
    case "malformed-response":
    case "network-failure":
      return Object.freeze({ kind: failure.kind });
    case "permission-denied":
      return Object.freeze({ kind: "permission-denied", status: 403 });
    case "rate-limited":
      return Object.freeze({
        kind: "rate-limited",
        status: 429,
        retryAfter:
          failure.retryAfterMilliseconds === null
            ? Object.freeze({ kind: "invalid-or-missing" })
            : Object.freeze({
                kind: "valid",
                delayMilliseconds: failure.retryAfterMilliseconds,
              }),
      });
    case "server-failure":
      return Object.freeze({
        kind: "server-failure",
        status: failure.status,
      });
    case "unauthorized":
      return Object.freeze({ kind: "unauthorized", status: 401 });
    case "unexpected-response":
      return Object.freeze({
        kind: "unexpected-response",
        status: failure.status,
      });
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
