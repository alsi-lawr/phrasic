export type Result<Value, Failure> =
  | {
      readonly kind: "success";
      readonly value: Value;
    }
  | {
      readonly kind: "failure";
      readonly error: Failure;
    };

export type ValueValidationError = {
  readonly kind: "invalid-value";
  readonly value:
    | "display-text"
    | "original-artwork-url"
    | "playback-duration-milliseconds"
    | "playback-position-milliseconds"
    | "provider-collection-id"
    | "provider-id"
    | "provider-item-id"
    | "provider-link";
  readonly reason:
    | "empty-string"
    | "expected-non-negative-integer"
    | "expected-string"
    | "invalid-url";
};

export type ArtworkUnavailableReason =
  "provider-artwork-is-invalid" | "provider-did-not-supply-artwork";

export type ItemConstructionError = {
  readonly kind: "invalid-item";
  readonly item: "episode" | "track";
  readonly reason:
    | "missing-creators"
    | "missing-provider-links"
    | "provider-link-provider-mismatch";
};

export type PlaybackSnapshotError = {
  readonly kind: "invalid-playback-snapshot";
  readonly reason: "position-exceeds-duration";
};

export type AuthorizationRequiredReason =
  | "authorization-expired"
  | "authorization-revoked"
  | "not-authorized"
  | "permission-required";

export type UnsupportedPlaybackReason =
  "advertisement" | "local-item" | "unknown-item-type";

export type PlaybackFailure =
  | {
      readonly kind: "authorization-failed";
      readonly reason: "authorization-denied" | "code-exchange-rejected";
    }
  | {
      readonly kind: "provider-failed";
      readonly reason:
        "malformed-response" | "network" | "rate-limited" | "server-error";
    };

type InitializingPlaybackState = {
  readonly kind: "initializing";
};

type AuthorizationRequiredPlaybackState = {
  readonly kind: "authorization-required";
  readonly reason: AuthorizationRequiredReason;
};

type AuthorizingPlaybackState = {
  readonly kind: "authorizing";
};

type EmptyPlaybackState = {
  readonly kind: "empty";
};

type PlayingPlaybackState = {
  readonly kind: "playing";
  readonly snapshot: PlaybackSnapshot;
};

type PausedPlaybackState = {
  readonly kind: "paused";
  readonly snapshot: PlaybackSnapshot;
};

type UnsupportedPlaybackState = {
  readonly kind: "unsupported";
  readonly reason: UnsupportedPlaybackReason;
};

type ReconnectingPlaybackState = {
  readonly kind: "reconnecting";
  readonly lastItem: LastPlaybackItem;
};

type FailurePlaybackState = {
  readonly kind: "failure";
  readonly error: PlaybackFailure;
};

export type PlaybackState =
  | InitializingPlaybackState
  | AuthorizationRequiredPlaybackState
  | AuthorizingPlaybackState
  | EmptyPlaybackState
  | PlayingPlaybackState
  | PausedPlaybackState
  | UnsupportedPlaybackState
  | ReconnectingPlaybackState
  | FailurePlaybackState;

export type LastPlaybackItem =
  | {
      readonly kind: "available";
      readonly item: NowPlayingItem;
    }
  | {
      readonly kind: "unavailable";
    };

export type PlaybackEvent =
  | {
      readonly kind: "authorization-available";
    }
  | {
      readonly kind: "authorization-complete";
    }
  | {
      readonly kind: "authorization-required";
      readonly reason: AuthorizationRequiredReason;
    }
  | {
      readonly kind: "begin-authorization";
    }
  | {
      readonly kind: "connection-lost";
    }
  | {
      readonly kind: "failure";
      readonly failure: PlaybackFailure;
    }
  | {
      readonly kind: "playback-empty";
    }
  | {
      readonly kind: "playback-paused";
      readonly snapshot: PlaybackSnapshot;
    }
  | {
      readonly kind: "playback-playing";
      readonly snapshot: PlaybackSnapshot;
    }
  | {
      readonly kind: "playback-unsupported";
      readonly reason: UnsupportedPlaybackReason;
    }
  | {
      readonly kind: "retry";
    };

export type PlaybackTransitionError = {
  readonly kind: "invalid-transition";
  readonly state: PlaybackState["kind"];
  readonly event: PlaybackEvent["kind"];
};

declare const providerIdBrand: unique symbol;
declare const providerItemIdBrand: unique symbol;
declare const providerCollectionIdBrand: unique symbol;
declare const displayTextBrand: unique symbol;
declare const originalArtworkUrlBrand: unique symbol;
declare const playbackPositionMillisecondsBrand: unique symbol;
declare const playbackDurationMillisecondsBrand: unique symbol;

export type ProviderId = string & {
  readonly [providerIdBrand]: "ProviderId";
};
export type ProviderItemId = string & {
  readonly [providerItemIdBrand]: "ProviderItemId";
};
export type ProviderCollectionId = string & {
  readonly [providerCollectionIdBrand]: "ProviderCollectionId";
};
export type DisplayText = string & {
  readonly [displayTextBrand]: "DisplayText";
};
export type OriginalArtworkUrl = string & {
  readonly [originalArtworkUrlBrand]: "OriginalArtworkUrl";
};
export type PlaybackPositionMilliseconds = number & {
  readonly [playbackPositionMillisecondsBrand]: "PlaybackPositionMilliseconds";
};
export type PlaybackDurationMilliseconds = number & {
  readonly [playbackDurationMillisecondsBrand]: "PlaybackDurationMilliseconds";
};

export function parseProviderId(
  input: unknown,
): Result<ProviderId, ValueValidationError> {
  const result = validateNonEmptyString("provider-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderId);
}

export function parseProviderItemId(
  input: unknown,
): Result<ProviderItemId, ValueValidationError> {
  const result = validateNonEmptyString("provider-item-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderItemId);
}

export function parseProviderCollectionId(
  input: unknown,
): Result<ProviderCollectionId, ValueValidationError> {
  const result = validateNonEmptyString("provider-collection-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderCollectionId);
}

export const maximumPlatformTimerDelayMilliseconds = 2_147_483_647;

export function parsePlaybackPositionMilliseconds(
  input: unknown,
): Result<PlaybackPositionMilliseconds, ValueValidationError> {
  const result = validateNonNegativeInteger(
    "playback-position-milliseconds",
    input,
  );
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as PlaybackPositionMilliseconds);
}

export function parsePlaybackDurationMilliseconds(
  input: unknown,
): Result<PlaybackDurationMilliseconds, ValueValidationError> {
  const result = validateNonNegativeInteger(
    "playback-duration-milliseconds",
    input,
  );
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as PlaybackDurationMilliseconds);
}

export function parseDisplayText(
  input: unknown,
): Result<DisplayText, ValueValidationError> {
  const result = validateNonEmptyString("display-text", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as DisplayText);
}

export function parseOriginalArtworkUrl(
  input: unknown,
): Result<OriginalArtworkUrl, ValueValidationError> {
  const result = validateHttpUrl("original-artwork-url", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as OriginalArtworkUrl);
}

export type ProviderLinkInput = {
  readonly providerId: ProviderId;
  readonly href: unknown;
};

export type ProviderLink = {
  readonly providerId: ProviderId;
  readonly href: string;
};

export function createProviderLink(
  input: ProviderLinkInput,
): Result<ProviderLink, ValueValidationError> {
  const result = validateHttpUrl("provider-link", input.href);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(
    Object.freeze({ providerId: input.providerId, href: result.value }),
  );
}

export type OriginalArtwork =
  | {
      readonly kind: "available";
      readonly url: OriginalArtworkUrl;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: ArtworkUnavailableReason;
    };

export function availableOriginalArtwork(
  url: OriginalArtworkUrl,
): OriginalArtwork {
  const artwork: OriginalArtwork = {
    kind: "available",
    url,
  };
  return Object.freeze(artwork);
}

export function unavailableOriginalArtwork(
  reason: ArtworkUnavailableReason,
): OriginalArtwork {
  const artwork: OriginalArtwork = {
    kind: "unavailable",
    reason,
  };
  return Object.freeze(artwork);
}

export type Creator = {
  readonly name: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type Collection = {
  readonly id: ProviderCollectionId;
  readonly title: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type Show = {
  readonly id: ProviderCollectionId;
  readonly title: DisplayText;
  readonly publisher: DisplayText;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type TrackItemInput = {
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly artists: ReadonlyArray<Creator>;
  readonly collection: Collection;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type TrackItem = {
  readonly kind: "track";
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly artists: ReadonlyArray<Creator>;
  readonly collection: Collection;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export function createTrackItem(
  input: TrackItemInput,
): Result<TrackItem, ItemConstructionError> {
  if (input.artists.length === 0) {
    return failed(invalidItem("track", "missing-creators"));
  }

  const linksError = providerLinksError(input.providerId, input.links, "track");
  if (linksError.kind === "failure") {
    return linksError;
  }

  return succeeded(Object.freeze({ kind: "track", ...input }));
}

export type EpisodeItemInput = {
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly show: Show;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export type EpisodeItem = {
  readonly kind: "episode";
  readonly providerId: ProviderId;
  readonly itemId: ProviderItemId;
  readonly title: DisplayText;
  readonly show: Show;
  readonly artwork: OriginalArtwork;
  readonly links: ReadonlyArray<ProviderLink>;
};

export function createEpisodeItem(
  input: EpisodeItemInput,
): Result<EpisodeItem, ItemConstructionError> {
  const linksError = providerLinksError(
    input.providerId,
    input.links,
    "episode",
  );
  if (linksError.kind === "failure") {
    return linksError;
  }

  return succeeded(Object.freeze({ kind: "episode", ...input }));
}

export type NowPlayingItem = EpisodeItem | TrackItem;

export type PlaybackSnapshotInput = {
  readonly item: NowPlayingItem;
  readonly position: PlaybackPositionMilliseconds;
  readonly duration: PlaybackDurationMilliseconds;
};

export type PlaybackSnapshot = {
  readonly item: NowPlayingItem;
  readonly position: PlaybackPositionMilliseconds;
  readonly duration: PlaybackDurationMilliseconds;
};

export function createPlaybackSnapshot(
  input: PlaybackSnapshotInput,
): Result<PlaybackSnapshot, PlaybackSnapshotError> {
  if (input.position > input.duration) {
    return failed({
      kind: "invalid-playback-snapshot",
      reason: "position-exceeds-duration",
    });
  }

  return succeeded(Object.freeze({ ...input }));
}

export function authorizationFailure(
  reason: "authorization-denied" | "code-exchange-rejected",
): PlaybackFailure {
  const failure: PlaybackFailure = {
    kind: "authorization-failed",
    reason,
  };
  return Object.freeze(failure);
}

export function providerFailure(
  reason: "malformed-response" | "network" | "rate-limited" | "server-error",
): PlaybackFailure {
  const failure: PlaybackFailure = {
    kind: "provider-failed",
    reason,
  };
  return Object.freeze(failure);
}

export function initialPlaybackState(): PlaybackState {
  return freezeState({ kind: "initializing" });
}

export function currentPlaybackItem(state: PlaybackState): LastPlaybackItem {
  switch (state.kind) {
    case "playing":
    case "paused":
      return availableLastItem(state.snapshot.item);
    case "reconnecting":
      return state.lastItem;
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "unsupported":
    case "failure":
      return unavailableLastPlaybackItem();
  }

  return assertNever(state);
}

export function transitionPlaybackState(
  state: PlaybackState,
  event: PlaybackEvent,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (event.kind) {
    case "authorization-available":
      return transitionAuthorizationAvailable(state, event);
    case "authorization-complete":
      return transitionAuthorizationComplete(state, event);
    case "authorization-required":
      return succeeded(
        freezeState({
          kind: "authorization-required",
          reason: event.reason,
        }),
      );
    case "begin-authorization":
      return transitionBeginAuthorization(state, event);
    case "connection-lost":
      return transitionConnectionLost(state, event);
    case "failure":
      return succeeded(
        freezeState({
          kind: "failure",
          error: event.failure,
        }),
      );
    case "playback-empty":
      return transitionFromConnectedState(
        state,
        event,
        freezeState({ kind: "empty" }),
      );
    case "playback-paused":
      return transitionFromConnectedState(
        state,
        event,
        freezeState({
          kind: "paused",
          snapshot: event.snapshot,
        }),
      );
    case "playback-playing":
      return transitionFromConnectedState(
        state,
        event,
        freezeState({
          kind: "playing",
          snapshot: event.snapshot,
        }),
      );
    case "playback-unsupported":
      return transitionFromConnectedState(
        state,
        event,
        freezeState({
          kind: "unsupported",
          reason: event.reason,
        }),
      );
    case "retry":
      return transitionRetry(state, event);
  }

  return assertNever(event);
}

function validateNonEmptyString(
  value: ValueValidationError["value"],
  input: unknown,
): Result<string, ValueValidationError> {
  if (typeof input !== "string") {
    return failed(invalidValue(value, "expected-string"));
  }

  if (input.trim().length === 0) {
    return failed(invalidValue(value, "empty-string"));
  }

  return succeeded(input);
}

function validateNonNegativeInteger(
  value: ValueValidationError["value"],
  input: unknown,
): Result<number, ValueValidationError> {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    return failed(invalidValue(value, "expected-non-negative-integer"));
  }

  return succeeded(input);
}

function validateHttpUrl(
  value: ValueValidationError["value"],
  input: unknown,
): Result<string, ValueValidationError> {
  const text = validateNonEmptyString(value, input);
  if (text.kind === "failure") {
    return text;
  }

  try {
    const url = new URL(text.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return failed(invalidValue(value, "invalid-url"));
    }

    return succeeded(url.href);
  } catch {
    return failed(invalidValue(value, "invalid-url"));
  }
}

function invalidValue(
  value: ValueValidationError["value"],
  reason: ValueValidationError["reason"],
): ValueValidationError {
  const error: ValueValidationError = {
    kind: "invalid-value",
    value,
    reason,
  };
  return Object.freeze(error);
}

function providerLinksError(
  providerId: ProviderId,
  links: ReadonlyArray<ProviderLink>,
  item: ItemConstructionError["item"],
): Result<ReadonlyArray<ProviderLink>, ItemConstructionError> {
  if (links.length === 0) {
    return failed(invalidItem(item, "missing-provider-links"));
  }

  const allLinksMatchProvider = links.every(
    (link: ProviderLink): boolean => link.providerId === providerId,
  );
  if (!allLinksMatchProvider) {
    return failed(invalidItem(item, "provider-link-provider-mismatch"));
  }

  return succeeded(links);
}

function invalidItem(
  item: ItemConstructionError["item"],
  reason: ItemConstructionError["reason"],
): ItemConstructionError {
  const error: ItemConstructionError = {
    kind: "invalid-item",
    item,
    reason,
  };
  return Object.freeze(error);
}

function transitionAuthorizationAvailable(
  state: PlaybackState,
  event: Extract<PlaybackEvent, { readonly kind: "authorization-available" }>,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "initializing":
      return succeeded(reconnectingState(unavailableLastPlaybackItem()));
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
    case "failure":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function transitionAuthorizationComplete(
  state: PlaybackState,
  event: Extract<PlaybackEvent, { readonly kind: "authorization-complete" }>,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "authorizing":
      return succeeded(reconnectingState(unavailableLastPlaybackItem()));
    case "initializing":
    case "authorization-required":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
    case "failure":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function transitionBeginAuthorization(
  state: PlaybackState,
  event: Extract<PlaybackEvent, { readonly kind: "begin-authorization" }>,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "authorization-required":
      return succeeded(freezeState({ kind: "authorizing" }));
    case "initializing":
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
    case "failure":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function transitionConnectionLost(
  state: PlaybackState,
  event: Extract<PlaybackEvent, { readonly kind: "connection-lost" }>,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "empty":
    case "unsupported":
      return succeeded(reconnectingState(unavailableLastPlaybackItem()));
    case "playing":
    case "paused":
      return succeeded(
        reconnectingState(availableLastItem(state.snapshot.item)),
      );
    case "reconnecting":
      return succeeded(reconnectingState(state.lastItem));
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "failure":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function transitionFromConnectedState(
  state: PlaybackState,
  event:
    | Extract<PlaybackEvent, { readonly kind: "playback-empty" }>
    | Extract<PlaybackEvent, { readonly kind: "playback-paused" }>
    | Extract<PlaybackEvent, { readonly kind: "playback-playing" }>
    | Extract<PlaybackEvent, { readonly kind: "playback-unsupported" }>,
  nextState:
    | EmptyPlaybackState
    | PausedPlaybackState
    | PlayingPlaybackState
    | UnsupportedPlaybackState,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
      return succeeded(nextState);
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "failure":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function transitionRetry(
  state: PlaybackState,
  event: Extract<PlaybackEvent, { readonly kind: "retry" }>,
): Result<PlaybackState, PlaybackTransitionError> {
  switch (state.kind) {
    case "failure":
      return succeeded(freezeState({ kind: "initializing" }));
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
      return invalidTransition(state, event);
  }

  return assertNever(state);
}

function reconnectingState(
  lastItem: LastPlaybackItem,
): ReconnectingPlaybackState {
  return freezeState({
    kind: "reconnecting",
    lastItem,
  });
}

function availableLastItem(item: NowPlayingItem): LastPlaybackItem {
  const lastItem: LastPlaybackItem = {
    kind: "available",
    item,
  };
  return Object.freeze(lastItem);
}

export function unavailableLastPlaybackItem(): LastPlaybackItem {
  const lastItem: LastPlaybackItem = {
    kind: "unavailable",
  };
  return Object.freeze(lastItem);
}

function invalidTransition(
  state: PlaybackState,
  event: PlaybackEvent,
): Result<never, PlaybackTransitionError> {
  const error: PlaybackTransitionError = {
    kind: "invalid-transition",
    state: state.kind,
    event: event.kind,
  };
  return failed(Object.freeze(error));
}

function freezeState<State extends PlaybackState>(state: State): State {
  return Object.freeze(state);
}

function succeeded<Value>(value: Value): {
  readonly kind: "success";
  readonly value: Value;
} {
  const result: {
    readonly kind: "success";
    readonly value: Value;
  } = {
    kind: "success",
    value,
  };
  return Object.freeze(result);
}

function failed<Failure>(error: Failure): {
  readonly kind: "failure";
  readonly error: Failure;
} {
  const result: {
    readonly kind: "failure";
    readonly error: Failure;
  } = {
    kind: "failure",
    error,
  };
  return Object.freeze(result);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected domain variant: ${String(value)}`);
}
