import { failed, succeeded, type Result } from "./result.ts";
import type { NowPlayingItem, PlaybackSnapshot } from "./playback-item.ts";

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

export function authorizationFailure(
  reason: "authorization-denied" | "code-exchange-rejected",
): PlaybackFailure {
  const failure: PlaybackFailure = {
    kind: "authorization-failed",
    reason,
  };
  return failure;
}

export function providerFailure(
  reason: "malformed-response" | "network" | "rate-limited" | "server-error",
): PlaybackFailure {
  const failure: PlaybackFailure = {
    kind: "provider-failed",
    reason,
  };
  return failure;
}

export function initialPlaybackState(): PlaybackState {
  return { kind: "initializing" };
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
      return succeeded<PlaybackState>({
        kind: "authorization-required",
        reason: event.reason,
      });
    case "begin-authorization":
      return transitionBeginAuthorization(state, event);
    case "connection-lost":
      return transitionConnectionLost(state, event);
    case "failure":
      return succeeded<PlaybackState>({
        kind: "failure",
        error: event.failure,
      });
    case "playback-empty":
      return transitionFromConnectedState(state, event, { kind: "empty" });
    case "playback-paused":
      return transitionFromConnectedState(state, event, {
        kind: "paused",
        snapshot: event.snapshot,
      });
    case "playback-playing":
      return transitionFromConnectedState(state, event, {
        kind: "playing",
        snapshot: event.snapshot,
      });
    case "playback-unsupported":
      return transitionFromConnectedState(state, event, {
        kind: "unsupported",
        reason: event.reason,
      });
    case "retry":
      return transitionRetry(state, event);
  }

  return assertNever(event);
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
      return succeeded<PlaybackState>({ kind: "authorizing" });
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
      return succeeded<PlaybackState>({ kind: "initializing" });
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
  return {
    kind: "reconnecting",
    lastItem,
  };
}

function availableLastItem(item: NowPlayingItem): LastPlaybackItem {
  const lastItem: LastPlaybackItem = {
    kind: "available",
    item,
  };
  return lastItem;
}

export function unavailableLastPlaybackItem(): LastPlaybackItem {
  const lastItem: LastPlaybackItem = {
    kind: "unavailable",
  };
  return lastItem;
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
  return failed(error);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected domain variant: ${String(value)}`);
}
