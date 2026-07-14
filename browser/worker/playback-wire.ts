import {
  authorizationFailure,
  availableOriginalArtwork,
  Collection,
  Creator,
  DisplayText,
  EpisodeItem,
  initialPlaybackState,
  OriginalArtworkUrl,
  PlaybackDurationMilliseconds,
  PlaybackPositionMilliseconds,
  PlaybackSnapshot,
  providerFailure,
  ProviderCollectionId,
  ProviderId,
  ProviderItemId,
  ProviderLink,
  Show,
  TrackItem,
  transitionPlaybackState,
  unavailableOriginalArtwork,
  type AuthorizationRequiredReason,
  type ArtworkUnavailableReason,
  type LastPlaybackItem,
  type NowPlayingItem,
  type OriginalArtwork,
  type PlaybackEvent,
  type PlaybackFailure,
  type PlaybackState,
  type Result,
  type UnsupportedPlaybackReason,
} from "../../domain/playback.ts";

type UnknownJsonObject = {
  readonly [key: string]: unknown;
};

export type PlaybackWireLink = {
  readonly providerId: string;
  readonly href: string;
};

export type PlaybackWireArtwork =
  | {
      readonly kind: "available";
      readonly url: string;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: ArtworkUnavailableReason;
    };

export type PlaybackWireCreator = {
  readonly name: string;
  readonly links: ReadonlyArray<PlaybackWireLink>;
};

export type PlaybackWireCollection = {
  readonly id: string;
  readonly title: string;
  readonly links: ReadonlyArray<PlaybackWireLink>;
};

export type PlaybackWireShow = {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly links: ReadonlyArray<PlaybackWireLink>;
};

export type PlaybackWireTrackItem = {
  readonly kind: "track";
  readonly providerId: string;
  readonly itemId: string;
  readonly title: string;
  readonly artists: ReadonlyArray<PlaybackWireCreator>;
  readonly collection: PlaybackWireCollection;
  readonly artwork: PlaybackWireArtwork;
  readonly links: ReadonlyArray<PlaybackWireLink>;
};

export type PlaybackWireEpisodeItem = {
  readonly kind: "episode";
  readonly providerId: string;
  readonly itemId: string;
  readonly title: string;
  readonly show: PlaybackWireShow;
  readonly artwork: PlaybackWireArtwork;
  readonly links: ReadonlyArray<PlaybackWireLink>;
};

export type PlaybackWireItem = PlaybackWireEpisodeItem | PlaybackWireTrackItem;

export type PlaybackWireSnapshot = {
  readonly item: PlaybackWireItem;
  readonly positionMilliseconds: number;
  readonly durationMilliseconds: number;
};

export type PlaybackWireFailure =
  | {
      readonly kind: "authorization-failed";
      readonly reason: "authorization-denied" | "code-exchange-rejected";
    }
  | {
      readonly kind: "provider-failed";
      readonly reason:
        "malformed-response" | "network" | "rate-limited" | "server-error";
    };

export type EmptyPlaybackWireState = {
  readonly kind: "empty";
};

export type InitializingPlaybackWireState = {
  readonly kind: "initializing";
};

export type AuthorizationRequiredPlaybackWireState = {
  readonly kind: "authorization-required";
  readonly reason: AuthorizationRequiredReason;
};

export type AuthorizingPlaybackWireState = {
  readonly kind: "authorizing";
};

export type PlayingPlaybackWireState = {
  readonly kind: "playing";
  readonly snapshot: PlaybackWireSnapshot;
};

export type PausedPlaybackWireState = {
  readonly kind: "paused";
  readonly snapshot: PlaybackWireSnapshot;
};

export type UnsupportedPlaybackWireState = {
  readonly kind: "unsupported";
  readonly reason: UnsupportedPlaybackReason;
};

export type ReconnectingPlaybackWireState = {
  readonly kind: "reconnecting";
  readonly lastItem: PlaybackWireItemAvailability;
};

export type FailurePlaybackWireState = {
  readonly kind: "failure";
  readonly error: PlaybackWireFailure;
};

/** JSON-safe playback state transferred between the dedicated worker and main thread. */
export type PlaybackWireState =
  | AuthorizingPlaybackWireState
  | AuthorizationRequiredPlaybackWireState
  | EmptyPlaybackWireState
  | FailurePlaybackWireState
  | InitializingPlaybackWireState
  | PausedPlaybackWireState
  | PlayingPlaybackWireState
  | ReconnectingPlaybackWireState
  | UnsupportedPlaybackWireState;

export type PlaybackWireParseFailure = {
  readonly kind: "invalid-playback-wire";
  readonly path: string;
  readonly code:
    | "expected-array"
    | "expected-http-url"
    | "expected-non-empty-string"
    | "expected-non-negative-integer"
    | "expected-object"
    | "invalid-value"
    | "missing-value"
    | "unexpected-key";
};

export type PlaybackWireDeserializationFailure = {
  readonly kind: "invalid-playback-wire-domain";
};

export type PlaybackWireItemAvailability =
  | {
      readonly kind: "available";
      readonly item: PlaybackWireItem;
    }
  | {
      readonly kind: "unavailable";
    };

export function emptyPlaybackWireState(): EmptyPlaybackWireState {
  return Object.freeze({ kind: "empty" });
}

export function initializingPlaybackWireState(): InitializingPlaybackWireState {
  return Object.freeze({ kind: "initializing" });
}

export function authorizationRequiredPlaybackWireState(
  reason: AuthorizationRequiredReason,
): AuthorizationRequiredPlaybackWireState {
  const state: AuthorizationRequiredPlaybackWireState = {
    kind: "authorization-required",
    reason,
  };
  return Object.freeze(state);
}

export function authorizingPlaybackWireState(): AuthorizingPlaybackWireState {
  return Object.freeze({ kind: "authorizing" });
}

export function reconnectingPlaybackWireState(
  lastItem: LastPlaybackItem,
): ReconnectingPlaybackWireState {
  const state: ReconnectingPlaybackWireState = {
    kind: "reconnecting",
    lastItem: serializeLastPlaybackItem(lastItem),
  };
  return Object.freeze(state);
}

export function serializePlaybackState(
  state: PlaybackState,
): PlaybackWireState {
  switch (state.kind) {
    case "initializing":
      return initializingPlaybackWireState();
    case "authorization-required":
      return authorizationRequiredPlaybackWireState(state.reason);
    case "authorizing":
      return authorizingPlaybackWireState();
    case "empty":
      return emptyPlaybackWireState();
    case "playing":
      return playingPlaybackWireState(serializePlaybackSnapshot(state));
    case "paused":
      return pausedPlaybackWireState(serializePlaybackSnapshot(state));
    case "unsupported":
      return unsupportedPlaybackWireState(state.reason);
    case "reconnecting":
      return reconnectingPlaybackWireState(state.lastItem);
    case "failure": {
      const wireState: FailurePlaybackWireState = {
        kind: "failure",
        error: serializePlaybackFailure(state.error),
      };
      return Object.freeze(wireState);
    }
  }

  return assertNever(state);
}

export function parsePlaybackWireState(
  input: unknown,
): Result<PlaybackWireState, PlaybackWireParseFailure> {
  const source = parseObject(input, "$");
  if (source.kind === "failure") {
    return source;
  }

  const kind = parseRequiredString(source.value, "kind", "$.kind");
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "initializing":
      return parseInitializingPlaybackWireState(source.value);
    case "authorization-required":
      return parseAuthorizationRequiredPlaybackWireState(source.value);
    case "authorizing":
      return parseAuthorizingPlaybackWireState(source.value);
    case "empty":
      return parseEmptyPlaybackWireState(source.value);
    case "playing":
      return parseActivePlaybackWireState(source.value, "playing");
    case "paused":
      return parseActivePlaybackWireState(source.value, "paused");
    case "unsupported":
      return parseUnsupportedPlaybackWireState(source.value);
    case "reconnecting":
      return parseReconnectingPlaybackWireState(source.value);
    case "failure":
      return parseFailurePlaybackWireState(source.value);
    default:
      return failed(parseFailure("$.kind", "invalid-value"));
  }
}

export function deserializePlaybackWireState(
  state: PlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  switch (state.kind) {
    case "initializing":
      return succeeded(initialPlaybackState());
    case "authorization-required":
      return deserializeTransition(initialPlaybackState(), {
        kind: "authorization-required",
        reason: state.reason,
      });
    case "authorizing":
      return deserializeAuthorizingPlaybackState();
    case "empty":
      return deserializeEmptyPlaybackState();
    case "playing":
      return deserializePlayingPlaybackState(state);
    case "paused":
      return deserializePausedPlaybackState(state);
    case "unsupported":
      return deserializeUnsupportedPlaybackState(state);
    case "reconnecting":
      return deserializeReconnectingPlaybackState(state);
    case "failure":
      return deserializeFailurePlaybackState(state);
  }

  return assertNever(state);
}

function deserializeAuthorizingPlaybackState(): Result<
  PlaybackState,
  PlaybackWireDeserializationFailure
> {
  const authorizationRequired = deserializeTransition(initialPlaybackState(), {
    kind: "authorization-required",
    reason: "not-authorized",
  });
  if (authorizationRequired.kind === "failure") {
    return authorizationRequired;
  }

  return deserializeTransition(authorizationRequired.value, {
    kind: "begin-authorization",
  });
}

function deserializeEmptyPlaybackState(): Result<
  PlaybackState,
  PlaybackWireDeserializationFailure
> {
  const connected = deserializeConnectedPlaybackState();
  if (connected.kind === "failure") {
    return connected;
  }

  return deserializeTransition(connected.value, { kind: "playback-empty" });
}

function deserializePlayingPlaybackState(
  state: PlayingPlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  const snapshot = deserializePlaybackWireSnapshot(state.snapshot);
  if (snapshot.kind === "failure") {
    return snapshot;
  }

  const connected = deserializeConnectedPlaybackState();
  if (connected.kind === "failure") {
    return connected;
  }

  return deserializeTransition(connected.value, {
    kind: "playback-playing",
    snapshot: snapshot.value,
  });
}

function deserializePausedPlaybackState(
  state: PausedPlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  const snapshot = deserializePlaybackWireSnapshot(state.snapshot);
  if (snapshot.kind === "failure") {
    return snapshot;
  }

  const connected = deserializeConnectedPlaybackState();
  if (connected.kind === "failure") {
    return connected;
  }

  return deserializeTransition(connected.value, {
    kind: "playback-paused",
    snapshot: snapshot.value,
  });
}

function deserializeUnsupportedPlaybackState(
  state: UnsupportedPlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  const connected = deserializeConnectedPlaybackState();
  if (connected.kind === "failure") {
    return connected;
  }

  return deserializeTransition(connected.value, {
    kind: "playback-unsupported",
    reason: state.reason,
  });
}

function deserializeReconnectingPlaybackState(
  state: ReconnectingPlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  const connected = deserializeConnectedPlaybackState();
  if (connected.kind === "failure") {
    return connected;
  }

  switch (state.lastItem.kind) {
    case "unavailable":
      return connected;
    case "available": {
      const item = deserializePlaybackWireItem(state.lastItem.item);
      if (item.kind === "failure") {
        return item;
      }

      const snapshot = zeroPlaybackSnapshot(item.value);
      if (snapshot.kind === "failure") {
        return snapshot;
      }

      const activePlayback = deserializeTransition(connected.value, {
        kind: "playback-playing",
        snapshot: snapshot.value,
      });
      if (activePlayback.kind === "failure") {
        return activePlayback;
      }

      return deserializeTransition(activePlayback.value, {
        kind: "connection-lost",
      });
    }
  }

  return assertNever(state.lastItem);
}

function deserializeFailurePlaybackState(
  state: FailurePlaybackWireState,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  return deserializeTransition(initialPlaybackState(), {
    kind: "failure",
    failure: deserializePlaybackFailure(state.error),
  });
}

function deserializeConnectedPlaybackState(): Result<
  PlaybackState,
  PlaybackWireDeserializationFailure
> {
  return deserializeTransition(initialPlaybackState(), {
    kind: "authorization-available",
  });
}

function deserializeTransition(
  state: PlaybackState,
  event: PlaybackEvent,
): Result<PlaybackState, PlaybackWireDeserializationFailure> {
  return deserializeDomainResult(transitionPlaybackState(state, event));
}

function deserializePlaybackWireSnapshot(
  snapshot: PlaybackWireSnapshot,
): Result<PlaybackSnapshot, PlaybackWireDeserializationFailure> {
  const item = deserializePlaybackWireItem(snapshot.item);
  if (item.kind === "failure") {
    return item;
  }

  const position = deserializeDomainResult(
    PlaybackPositionMilliseconds.create(snapshot.positionMilliseconds),
  );
  if (position.kind === "failure") {
    return position;
  }

  const duration = deserializeDomainResult(
    PlaybackDurationMilliseconds.create(snapshot.durationMilliseconds),
  );
  if (duration.kind === "failure") {
    return duration;
  }

  return deserializeDomainResult(
    PlaybackSnapshot.create({
      item: item.value,
      position: position.value,
      duration: duration.value,
    }),
  );
}

function zeroPlaybackSnapshot(
  item: NowPlayingItem,
): Result<PlaybackSnapshot, PlaybackWireDeserializationFailure> {
  const position = deserializeDomainResult(
    PlaybackPositionMilliseconds.create(0),
  );
  if (position.kind === "failure") {
    return position;
  }

  const duration = deserializeDomainResult(
    PlaybackDurationMilliseconds.create(0),
  );
  if (duration.kind === "failure") {
    return duration;
  }

  return deserializeDomainResult(
    PlaybackSnapshot.create({
      item,
      position: position.value,
      duration: duration.value,
    }),
  );
}

function deserializePlaybackWireItem(
  item: PlaybackWireItem,
): Result<NowPlayingItem, PlaybackWireDeserializationFailure> {
  switch (item.kind) {
    case "track":
      return deserializePlaybackWireTrackItem(item);
    case "episode":
      return deserializePlaybackWireEpisodeItem(item);
  }

  return assertNever(item);
}

function deserializePlaybackWireTrackItem(
  item: PlaybackWireTrackItem,
): Result<NowPlayingItem, PlaybackWireDeserializationFailure> {
  const providerId = deserializeDomainResult(
    ProviderId.create(item.providerId),
  );
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemId = deserializeDomainResult(ProviderItemId.create(item.itemId));
  if (itemId.kind === "failure") {
    return itemId;
  }

  const title = deserializeDomainResult(DisplayText.create(item.title));
  if (title.kind === "failure") {
    return title;
  }

  const artists = deserializePlaybackWireCreators(item.artists);
  if (artists.kind === "failure") {
    return artists;
  }

  const collection = deserializePlaybackWireCollection(item.collection);
  if (collection.kind === "failure") {
    return collection;
  }

  const artwork = deserializePlaybackWireArtwork(item.artwork);
  if (artwork.kind === "failure") {
    return artwork;
  }

  const links = deserializePlaybackWireLinks(item.links);
  if (links.kind === "failure") {
    return links;
  }

  return deserializeDomainResult(
    TrackItem.create({
      providerId: providerId.value,
      itemId: itemId.value,
      title: title.value,
      artists: artists.value,
      collection: collection.value,
      artwork: artwork.value,
      links: links.value,
    }),
  );
}

function deserializePlaybackWireEpisodeItem(
  item: PlaybackWireEpisodeItem,
): Result<NowPlayingItem, PlaybackWireDeserializationFailure> {
  const providerId = deserializeDomainResult(
    ProviderId.create(item.providerId),
  );
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemId = deserializeDomainResult(ProviderItemId.create(item.itemId));
  if (itemId.kind === "failure") {
    return itemId;
  }

  const title = deserializeDomainResult(DisplayText.create(item.title));
  if (title.kind === "failure") {
    return title;
  }

  const show = deserializePlaybackWireShow(item.show);
  if (show.kind === "failure") {
    return show;
  }

  const artwork = deserializePlaybackWireArtwork(item.artwork);
  if (artwork.kind === "failure") {
    return artwork;
  }

  const links = deserializePlaybackWireLinks(item.links);
  if (links.kind === "failure") {
    return links;
  }

  return deserializeDomainResult(
    EpisodeItem.create({
      providerId: providerId.value,
      itemId: itemId.value,
      title: title.value,
      show: show.value,
      artwork: artwork.value,
      links: links.value,
    }),
  );
}

function deserializePlaybackWireCreators(
  creators: ReadonlyArray<PlaybackWireCreator>,
): Result<ReadonlyArray<Creator>, PlaybackWireDeserializationFailure> {
  const deserialized: Creator[] = [];
  for (const creator of creators) {
    const value = deserializePlaybackWireCreator(creator);
    if (value.kind === "failure") {
      return value;
    }

    deserialized.push(value.value);
  }

  return succeeded(freezeArray(deserialized));
}

function deserializePlaybackWireCreator(
  creator: PlaybackWireCreator,
): Result<Creator, PlaybackWireDeserializationFailure> {
  const name = deserializeDomainResult(DisplayText.create(creator.name));
  if (name.kind === "failure") {
    return name;
  }

  const links = deserializePlaybackWireLinks(creator.links);
  if (links.kind === "failure") {
    return links;
  }

  return succeeded(
    Creator.create({
      name: name.value,
      links: links.value,
    }),
  );
}

function deserializePlaybackWireCollection(
  collection: PlaybackWireCollection,
): Result<Collection, PlaybackWireDeserializationFailure> {
  const id = deserializeDomainResult(
    ProviderCollectionId.create(collection.id),
  );
  if (id.kind === "failure") {
    return id;
  }

  const title = deserializeDomainResult(DisplayText.create(collection.title));
  if (title.kind === "failure") {
    return title;
  }

  const links = deserializePlaybackWireLinks(collection.links);
  if (links.kind === "failure") {
    return links;
  }

  return succeeded(
    Collection.create({
      id: id.value,
      title: title.value,
      links: links.value,
    }),
  );
}

function deserializePlaybackWireShow(
  show: PlaybackWireShow,
): Result<Show, PlaybackWireDeserializationFailure> {
  const id = deserializeDomainResult(ProviderCollectionId.create(show.id));
  if (id.kind === "failure") {
    return id;
  }

  const title = deserializeDomainResult(DisplayText.create(show.title));
  if (title.kind === "failure") {
    return title;
  }

  const publisher = deserializeDomainResult(DisplayText.create(show.publisher));
  if (publisher.kind === "failure") {
    return publisher;
  }

  const links = deserializePlaybackWireLinks(show.links);
  if (links.kind === "failure") {
    return links;
  }

  return succeeded(
    Show.create({
      id: id.value,
      title: title.value,
      publisher: publisher.value,
      links: links.value,
    }),
  );
}

function deserializePlaybackWireArtwork(
  artwork: PlaybackWireArtwork,
): Result<OriginalArtwork, PlaybackWireDeserializationFailure> {
  switch (artwork.kind) {
    case "available": {
      const url = deserializeDomainResult(
        OriginalArtworkUrl.create(artwork.url),
      );
      if (url.kind === "failure") {
        return url;
      }

      return succeeded(availableOriginalArtwork(url.value));
    }
    case "unavailable":
      return succeeded(unavailableOriginalArtwork(artwork.reason));
  }

  return assertNever(artwork);
}

function deserializePlaybackWireLinks(
  links: ReadonlyArray<PlaybackWireLink>,
): Result<ReadonlyArray<ProviderLink>, PlaybackWireDeserializationFailure> {
  const deserialized: ProviderLink[] = [];
  for (const link of links) {
    const providerId = deserializeDomainResult(
      ProviderId.create(link.providerId),
    );
    if (providerId.kind === "failure") {
      return providerId;
    }

    const value = deserializeDomainResult(
      ProviderLink.create({
        providerId: providerId.value,
        href: link.href,
      }),
    );
    if (value.kind === "failure") {
      return value;
    }

    deserialized.push(value.value);
  }

  return succeeded(freezeArray(deserialized));
}

function deserializePlaybackFailure(
  error: PlaybackWireFailure,
): PlaybackFailure {
  switch (error.kind) {
    case "authorization-failed":
      return authorizationFailure(error.reason);
    case "provider-failed":
      return providerFailure(error.reason);
  }

  return assertNever(error);
}

function deserializeDomainResult<Value, Failure>(
  result: Result<Value, Failure>,
): Result<Value, PlaybackWireDeserializationFailure> {
  if (result.kind === "success") {
    return succeeded(result.value);
  }

  return failed(playbackWireDeserializationFailure());
}

function playbackWireDeserializationFailure(): PlaybackWireDeserializationFailure {
  return Object.freeze({ kind: "invalid-playback-wire-domain" });
}

function serializePlaybackSnapshot(
  state: Extract<PlaybackState, { readonly kind: "playing" | "paused" }>,
): PlaybackWireSnapshot {
  const snapshot: PlaybackWireSnapshot = {
    item: serializePlaybackItem(state.snapshot.item),
    positionMilliseconds: state.snapshot.position.value,
    durationMilliseconds: state.snapshot.duration.value,
  };
  return Object.freeze(snapshot);
}

function serializeLastPlaybackItem(
  lastItem: LastPlaybackItem,
): PlaybackWireItemAvailability {
  switch (lastItem.kind) {
    case "available":
      return Object.freeze({
        kind: "available",
        item: serializePlaybackItem(lastItem.item),
      });
    case "unavailable":
      return Object.freeze({ kind: "unavailable" });
  }

  return assertNever(lastItem);
}

function serializePlaybackItem(item: NowPlayingItem): PlaybackWireItem {
  switch (item.kind) {
    case "track": {
      const wireItem: PlaybackWireTrackItem = {
        kind: "track",
        providerId: item.providerId.value,
        itemId: item.itemId.value,
        title: item.title.value,
        artists: freezeArray(item.artists.map(serializePlaybackCreator)),
        collection: Object.freeze({
          id: item.collection.id.value,
          title: item.collection.title.value,
          links: serializePlaybackLinks(item.collection.links),
        }),
        artwork: serializePlaybackArtwork(item.artwork),
        links: serializePlaybackLinks(item.links),
      };
      return Object.freeze(wireItem);
    }
    case "episode": {
      const wireItem: PlaybackWireEpisodeItem = {
        kind: "episode",
        providerId: item.providerId.value,
        itemId: item.itemId.value,
        title: item.title.value,
        show: Object.freeze({
          id: item.show.id.value,
          title: item.show.title.value,
          publisher: item.show.publisher.value,
          links: serializePlaybackLinks(item.show.links),
        }),
        artwork: serializePlaybackArtwork(item.artwork),
        links: serializePlaybackLinks(item.links),
      };
      return Object.freeze(wireItem);
    }
  }

  return assertNever(item);
}

function serializePlaybackCreator(creator: Creator): PlaybackWireCreator {
  const wireCreator: PlaybackWireCreator = {
    name: creator.name.value,
    links: serializePlaybackLinks(creator.links),
  };
  return Object.freeze(wireCreator);
}

function serializePlaybackLinks(
  links: ReadonlyArray<ProviderLink>,
): ReadonlyArray<PlaybackWireLink> {
  return freezeArray(
    links.map((link): PlaybackWireLink =>
      Object.freeze({
        providerId: link.providerId.value,
        href: link.href,
      }),
    ),
  );
}

function serializePlaybackArtwork(
  artwork: OriginalArtwork,
): PlaybackWireArtwork {
  switch (artwork.kind) {
    case "available":
      return Object.freeze({
        kind: "available",
        url: artwork.url.value,
      });
    case "unavailable":
      return Object.freeze({
        kind: "unavailable",
        reason: artwork.reason,
      });
  }

  return assertNever(artwork);
}

function serializePlaybackFailure(error: PlaybackFailure): PlaybackWireFailure {
  switch (error.kind) {
    case "authorization-failed":
      return Object.freeze({
        kind: "authorization-failed",
        reason: error.reason,
      });
    case "provider-failed":
      return Object.freeze({
        kind: "provider-failed",
        reason: error.reason,
      });
  }

  return assertNever(error);
}

function playingPlaybackWireState(
  snapshot: PlaybackWireSnapshot,
): PlayingPlaybackWireState {
  const state: PlayingPlaybackWireState = {
    kind: "playing",
    snapshot,
  };
  return Object.freeze(state);
}

function pausedPlaybackWireState(
  snapshot: PlaybackWireSnapshot,
): PausedPlaybackWireState {
  const state: PausedPlaybackWireState = {
    kind: "paused",
    snapshot,
  };
  return Object.freeze(state);
}

function unsupportedPlaybackWireState(
  reason: UnsupportedPlaybackReason,
): UnsupportedPlaybackWireState {
  const state: UnsupportedPlaybackWireState = {
    kind: "unsupported",
    reason,
  };
  return Object.freeze(state);
}

function parseInitializingPlaybackWireState(
  source: UnknownJsonObject,
): Result<InitializingPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind"]);
  if (object.kind === "failure") {
    return object;
  }

  return succeeded(initializingPlaybackWireState());
}

function parseAuthorizationRequiredPlaybackWireState(
  source: UnknownJsonObject,
): Result<AuthorizationRequiredPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind", "reason"]);
  if (object.kind === "failure") {
    return object;
  }

  const reason = parseRequiredAuthorizationRequiredReason(
    object.value,
    "reason",
    "$.reason",
  );
  if (reason.kind === "failure") {
    return reason;
  }

  return succeeded(authorizationRequiredPlaybackWireState(reason.value));
}

function parseAuthorizingPlaybackWireState(
  source: UnknownJsonObject,
): Result<AuthorizingPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind"]);
  if (object.kind === "failure") {
    return object;
  }

  return succeeded(authorizingPlaybackWireState());
}

function parseEmptyPlaybackWireState(
  source: UnknownJsonObject,
): Result<EmptyPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind"]);
  if (object.kind === "failure") {
    return object;
  }

  return succeeded(emptyPlaybackWireState());
}

function parseActivePlaybackWireState(
  source: UnknownJsonObject,
  kind: "paused" | "playing",
): Result<
  PausedPlaybackWireState | PlayingPlaybackWireState,
  PlaybackWireParseFailure
> {
  const object = parseExactObject(source, "$", ["kind", "snapshot"]);
  if (object.kind === "failure") {
    return object;
  }

  const snapshot = parseRequiredSnapshot(
    object.value,
    "snapshot",
    "$.snapshot",
  );
  if (snapshot.kind === "failure") {
    return snapshot;
  }

  if (kind === "playing") {
    return succeeded(playingPlaybackWireState(snapshot.value));
  }

  return succeeded(pausedPlaybackWireState(snapshot.value));
}

function parseUnsupportedPlaybackWireState(
  source: UnknownJsonObject,
): Result<UnsupportedPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind", "reason"]);
  if (object.kind === "failure") {
    return object;
  }

  const reason = parseRequiredUnsupportedReason(
    object.value,
    "reason",
    "$.reason",
  );
  if (reason.kind === "failure") {
    return reason;
  }

  return succeeded(unsupportedPlaybackWireState(reason.value));
}

function parseReconnectingPlaybackWireState(
  source: UnknownJsonObject,
): Result<ReconnectingPlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind", "lastItem"]);
  if (object.kind === "failure") {
    return object;
  }

  const lastItem = parseRequiredPlaybackWireItemAvailability(
    object.value,
    "lastItem",
    "$.lastItem",
  );
  if (lastItem.kind === "failure") {
    return lastItem;
  }

  const state: ReconnectingPlaybackWireState = {
    kind: "reconnecting",
    lastItem: lastItem.value,
  };
  return succeeded(Object.freeze(state));
}

function parseFailurePlaybackWireState(
  source: UnknownJsonObject,
): Result<FailurePlaybackWireState, PlaybackWireParseFailure> {
  const object = parseExactObject(source, "$", ["kind", "error"]);
  if (object.kind === "failure") {
    return object;
  }

  const error = parseRequiredPlaybackFailure(object.value, "error", "$.error");
  if (error.kind === "failure") {
    return error;
  }

  const state: FailurePlaybackWireState = {
    kind: "failure",
    error: error.value,
  };
  return succeeded(Object.freeze(state));
}

function parseRequiredSnapshot(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireSnapshot, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parsePlaybackWireSnapshot(value.value, path);
}

function parsePlaybackWireSnapshot(
  input: unknown,
  path: string,
): Result<PlaybackWireSnapshot, PlaybackWireParseFailure> {
  const object = parseExactObject(input, path, [
    "item",
    "positionMilliseconds",
    "durationMilliseconds",
  ]);
  if (object.kind === "failure") {
    return object;
  }

  const item = parseRequiredPlaybackWireItem(
    object.value,
    "item",
    `${path}.item`,
  );
  if (item.kind === "failure") {
    return item;
  }

  const position = parseRequiredNonNegativeInteger(
    object.value,
    "positionMilliseconds",
    `${path}.positionMilliseconds`,
  );
  if (position.kind === "failure") {
    return position;
  }

  const duration = parseRequiredNonNegativeInteger(
    object.value,
    "durationMilliseconds",
    `${path}.durationMilliseconds`,
  );
  if (duration.kind === "failure") {
    return duration;
  }

  if (position.value > duration.value) {
    return failed(
      parseFailure(`${path}.positionMilliseconds`, "invalid-value"),
    );
  }

  const snapshot: PlaybackWireSnapshot = {
    item: item.value,
    positionMilliseconds: position.value,
    durationMilliseconds: duration.value,
  };
  return succeeded(Object.freeze(snapshot));
}

function parseRequiredPlaybackWireItem(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireItem, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parsePlaybackWireItem(value.value, path);
}

function parsePlaybackWireItem(
  input: unknown,
  path: string,
): Result<PlaybackWireItem, PlaybackWireParseFailure> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const kind = parseRequiredString(source.value, "kind", `${path}.kind`);
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "track":
      return parsePlaybackWireTrackItem(source.value, path);
    case "episode":
      return parsePlaybackWireEpisodeItem(source.value, path);
    default:
      return failed(parseFailure(`${path}.kind`, "invalid-value"));
  }
}

function parseRequiredPlaybackWireItemAvailability(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireItemAvailability, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parsePlaybackWireItemAvailability(value.value, path);
}

function parsePlaybackWireItemAvailability(
  input: unknown,
  path: string,
): Result<PlaybackWireItemAvailability, PlaybackWireParseFailure> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const kind = parseRequiredString(source.value, "kind", `${path}.kind`);
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "available": {
      const object = parseExactObject(source.value, path, ["kind", "item"]);
      if (object.kind === "failure") {
        return object;
      }

      const item = parseRequiredPlaybackWireItem(
        object.value,
        "item",
        `${path}.item`,
      );
      if (item.kind === "failure") {
        return item;
      }

      return succeeded(Object.freeze({ kind: "available", item: item.value }));
    }
    case "unavailable": {
      const object = parseExactObject(source.value, path, ["kind"]);
      if (object.kind === "failure") {
        return object;
      }

      return succeeded(Object.freeze({ kind: "unavailable" }));
    }
    default:
      return failed(parseFailure(`${path}.kind`, "invalid-value"));
  }
}

function parsePlaybackWireTrackItem(
  source: UnknownJsonObject,
  path: string,
): Result<PlaybackWireTrackItem, PlaybackWireParseFailure> {
  const object = parseExactObject(source, path, [
    "kind",
    "providerId",
    "itemId",
    "title",
    "artists",
    "collection",
    "artwork",
    "links",
  ]);
  if (object.kind === "failure") {
    return object;
  }

  const providerId = parseRequiredString(
    object.value,
    "providerId",
    `${path}.providerId`,
  );
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemId = parseRequiredString(object.value, "itemId", `${path}.itemId`);
  if (itemId.kind === "failure") {
    return itemId;
  }

  const title = parseRequiredString(object.value, "title", `${path}.title`);
  if (title.kind === "failure") {
    return title;
  }

  const artists = parseRequiredCreators(
    object.value,
    "artists",
    `${path}.artists`,
  );
  if (artists.kind === "failure") {
    return artists;
  }

  if (artists.value.length === 0) {
    return failed(parseFailure(`${path}.artists`, "invalid-value"));
  }

  const collection = parseRequiredCollection(
    object.value,
    "collection",
    `${path}.collection`,
  );
  if (collection.kind === "failure") {
    return collection;
  }

  const artwork = parseRequiredArtwork(
    object.value,
    "artwork",
    `${path}.artwork`,
  );
  if (artwork.kind === "failure") {
    return artwork;
  }

  const links = parseRequiredItemLinks(
    object.value,
    "links",
    `${path}.links`,
    providerId.value,
  );
  if (links.kind === "failure") {
    return links;
  }

  const item: PlaybackWireTrackItem = {
    kind: "track",
    providerId: providerId.value,
    itemId: itemId.value,
    title: title.value,
    artists: artists.value,
    collection: collection.value,
    artwork: artwork.value,
    links: links.value,
  };
  return succeeded(Object.freeze(item));
}

function parsePlaybackWireEpisodeItem(
  source: UnknownJsonObject,
  path: string,
): Result<PlaybackWireEpisodeItem, PlaybackWireParseFailure> {
  const object = parseExactObject(source, path, [
    "kind",
    "providerId",
    "itemId",
    "title",
    "show",
    "artwork",
    "links",
  ]);
  if (object.kind === "failure") {
    return object;
  }

  const providerId = parseRequiredString(
    object.value,
    "providerId",
    `${path}.providerId`,
  );
  if (providerId.kind === "failure") {
    return providerId;
  }

  const itemId = parseRequiredString(object.value, "itemId", `${path}.itemId`);
  if (itemId.kind === "failure") {
    return itemId;
  }

  const title = parseRequiredString(object.value, "title", `${path}.title`);
  if (title.kind === "failure") {
    return title;
  }

  const show = parseRequiredShow(object.value, "show", `${path}.show`);
  if (show.kind === "failure") {
    return show;
  }

  const artwork = parseRequiredArtwork(
    object.value,
    "artwork",
    `${path}.artwork`,
  );
  if (artwork.kind === "failure") {
    return artwork;
  }

  const links = parseRequiredItemLinks(
    object.value,
    "links",
    `${path}.links`,
    providerId.value,
  );
  if (links.kind === "failure") {
    return links;
  }

  const item: PlaybackWireEpisodeItem = {
    kind: "episode",
    providerId: providerId.value,
    itemId: itemId.value,
    title: title.value,
    show: show.value,
    artwork: artwork.value,
    links: links.value,
  };
  return succeeded(Object.freeze(item));
}

function parseRequiredCreators(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<ReadonlyArray<PlaybackWireCreator>, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  const values = parseArray(value.value, path);
  if (values.kind === "failure") {
    return values;
  }

  const creators: PlaybackWireCreator[] = [];
  for (const entry of values.value) {
    const creator = parsePlaybackWireCreator(entry, `${path}[]`);
    if (creator.kind === "failure") {
      return creator;
    }

    creators.push(creator.value);
  }

  return succeeded(freezeArray(creators));
}

function parsePlaybackWireCreator(
  input: unknown,
  path: string,
): Result<PlaybackWireCreator, PlaybackWireParseFailure> {
  const object = parseExactObject(input, path, ["name", "links"]);
  if (object.kind === "failure") {
    return object;
  }

  const name = parseRequiredString(object.value, "name", `${path}.name`);
  if (name.kind === "failure") {
    return name;
  }

  const links = parseRequiredLinks(object.value, "links", `${path}.links`);
  if (links.kind === "failure") {
    return links;
  }

  const creator: PlaybackWireCreator = {
    name: name.value,
    links: links.value,
  };
  return succeeded(Object.freeze(creator));
}

function parseRequiredCollection(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireCollection, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  const object = parseExactObject(value.value, path, ["id", "title", "links"]);
  if (object.kind === "failure") {
    return object;
  }

  const id = parseRequiredString(object.value, "id", `${path}.id`);
  if (id.kind === "failure") {
    return id;
  }

  const title = parseRequiredString(object.value, "title", `${path}.title`);
  if (title.kind === "failure") {
    return title;
  }

  const links = parseRequiredLinks(object.value, "links", `${path}.links`);
  if (links.kind === "failure") {
    return links;
  }

  const collection: PlaybackWireCollection = {
    id: id.value,
    title: title.value,
    links: links.value,
  };
  return succeeded(Object.freeze(collection));
}

function parseRequiredShow(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireShow, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  const object = parseExactObject(value.value, path, [
    "id",
    "title",
    "publisher",
    "links",
  ]);
  if (object.kind === "failure") {
    return object;
  }

  const id = parseRequiredString(object.value, "id", `${path}.id`);
  if (id.kind === "failure") {
    return id;
  }

  const title = parseRequiredString(object.value, "title", `${path}.title`);
  if (title.kind === "failure") {
    return title;
  }

  const publisher = parseRequiredString(
    object.value,
    "publisher",
    `${path}.publisher`,
  );
  if (publisher.kind === "failure") {
    return publisher;
  }

  const links = parseRequiredLinks(object.value, "links", `${path}.links`);
  if (links.kind === "failure") {
    return links;
  }

  const show: PlaybackWireShow = {
    id: id.value,
    title: title.value,
    publisher: publisher.value,
    links: links.value,
  };
  return succeeded(Object.freeze(show));
}

function parseRequiredArtwork(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireArtwork, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parsePlaybackWireArtwork(value.value, path);
}

function parsePlaybackWireArtwork(
  input: unknown,
  path: string,
): Result<PlaybackWireArtwork, PlaybackWireParseFailure> {
  const source = parseObject(input, path);
  if (source.kind === "failure") {
    return source;
  }

  const kind = parseRequiredString(source.value, "kind", `${path}.kind`);
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "available": {
      const object = parseExactObject(source.value, path, ["kind", "url"]);
      if (object.kind === "failure") {
        return object;
      }

      const url = parseRequiredHttpUrl(object.value, "url", `${path}.url`);
      if (url.kind === "failure") {
        return url;
      }

      return succeeded(Object.freeze({ kind: "available", url: url.value }));
    }
    case "unavailable": {
      const object = parseExactObject(source.value, path, ["kind", "reason"]);
      if (object.kind === "failure") {
        return object;
      }

      const reason = parseRequiredArtworkUnavailableReason(
        object.value,
        "reason",
        `${path}.reason`,
      );
      if (reason.kind === "failure") {
        return reason;
      }

      return succeeded(
        Object.freeze({ kind: "unavailable", reason: reason.value }),
      );
    }
    default:
      return failed(parseFailure(`${path}.kind`, "invalid-value"));
  }
}

function parseRequiredItemLinks(
  source: UnknownJsonObject,
  key: string,
  path: string,
  providerId: string,
): Result<ReadonlyArray<PlaybackWireLink>, PlaybackWireParseFailure> {
  const links = parseRequiredLinks(source, key, path);
  if (links.kind === "failure") {
    return links;
  }

  if (links.value.length === 0) {
    return failed(parseFailure(path, "invalid-value"));
  }

  const allLinksMatchProvider = links.value.every(
    (link: PlaybackWireLink): boolean => link.providerId === providerId,
  );
  if (!allLinksMatchProvider) {
    return failed(parseFailure(path, "invalid-value"));
  }

  return links;
}

function parseRequiredLinks(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<ReadonlyArray<PlaybackWireLink>, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  const values = parseArray(value.value, path);
  if (values.kind === "failure") {
    return values;
  }

  const links: PlaybackWireLink[] = [];
  for (const entry of values.value) {
    const link = parsePlaybackWireLink(entry, `${path}[]`);
    if (link.kind === "failure") {
      return link;
    }

    links.push(link.value);
  }

  return succeeded(freezeArray(links));
}

function parsePlaybackWireLink(
  input: unknown,
  path: string,
): Result<PlaybackWireLink, PlaybackWireParseFailure> {
  const object = parseExactObject(input, path, ["providerId", "href"]);
  if (object.kind === "failure") {
    return object;
  }

  const providerId = parseRequiredString(
    object.value,
    "providerId",
    `${path}.providerId`,
  );
  if (providerId.kind === "failure") {
    return providerId;
  }

  const href = parseRequiredHttpUrl(object.value, "href", `${path}.href`);
  if (href.kind === "failure") {
    return href;
  }

  const link: PlaybackWireLink = {
    providerId: providerId.value,
    href: href.value,
  };
  return succeeded(Object.freeze(link));
}

function parseRequiredPlaybackFailure(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<PlaybackWireFailure, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  const object = parseObject(value.value, path);
  if (object.kind === "failure") {
    return object;
  }

  const kind = parseRequiredString(object.value, "kind", `${path}.kind`);
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "authorization-failed": {
      const exact = parseExactObject(object.value, path, ["kind", "reason"]);
      if (exact.kind === "failure") {
        return exact;
      }

      const reason = parseRequiredAuthorizationFailureReason(
        exact.value,
        "reason",
        `${path}.reason`,
      );
      if (reason.kind === "failure") {
        return reason;
      }

      return succeeded(
        Object.freeze({ kind: "authorization-failed", reason: reason.value }),
      );
    }
    case "provider-failed": {
      const exact = parseExactObject(object.value, path, ["kind", "reason"]);
      if (exact.kind === "failure") {
        return exact;
      }

      const reason = parseRequiredProviderFailureReason(
        exact.value,
        "reason",
        `${path}.reason`,
      );
      if (reason.kind === "failure") {
        return reason;
      }

      return succeeded(
        Object.freeze({ kind: "provider-failed", reason: reason.value }),
      );
    }
    default:
      return failed(parseFailure(`${path}.kind`, "invalid-value"));
  }
}

function parseRequiredUnsupportedReason(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<UnsupportedPlaybackReason, PlaybackWireParseFailure> {
  const reason = parseRequiredString(source, key, path);
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "advertisement":
    case "local-item":
    case "unknown-item-type":
      return succeeded(reason.value);
    default:
      return failed(parseFailure(path, "invalid-value"));
  }
}

function parseRequiredArtworkUnavailableReason(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<ArtworkUnavailableReason, PlaybackWireParseFailure> {
  const reason = parseRequiredString(source, key, path);
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "provider-artwork-is-invalid":
    case "provider-did-not-supply-artwork":
      return succeeded(reason.value);
    default:
      return failed(parseFailure(path, "invalid-value"));
  }
}

function parseRequiredAuthorizationRequiredReason(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<AuthorizationRequiredReason, PlaybackWireParseFailure> {
  const reason = parseRequiredString(source, key, path);
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "authorization-expired":
    case "authorization-revoked":
    case "not-authorized":
    case "permission-required":
      return succeeded(reason.value);
    default:
      return failed(parseFailure(path, "invalid-value"));
  }
}

function parseRequiredAuthorizationFailureReason(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<
  "authorization-denied" | "code-exchange-rejected",
  PlaybackWireParseFailure
> {
  const reason = parseRequiredString(source, key, path);
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "authorization-denied":
    case "code-exchange-rejected":
      return succeeded(reason.value);
    default:
      return failed(parseFailure(path, "invalid-value"));
  }
}

function parseRequiredProviderFailureReason(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<
  "malformed-response" | "network" | "rate-limited" | "server-error",
  PlaybackWireParseFailure
> {
  const reason = parseRequiredString(source, key, path);
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "malformed-response":
    case "network":
    case "rate-limited":
    case "server-error":
      return succeeded(reason.value);
    default:
      return failed(parseFailure(path, "invalid-value"));
  }
}

function parseRequiredString(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<string, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parseNonEmptyString(value.value, path);
}

function parseRequiredHttpUrl(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<string, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  return parseHttpUrl(value.value, path);
}

function parseRequiredNonNegativeInteger(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<number, PlaybackWireParseFailure> {
  const value = readRequired(source, key, path);
  if (value.kind === "failure") {
    return value;
  }

  if (
    typeof value.value !== "number" ||
    !Number.isSafeInteger(value.value) ||
    value.value < 0
  ) {
    return failed(parseFailure(path, "expected-non-negative-integer"));
  }

  return succeeded(value.value);
}

function parseExactObject(
  input: unknown,
  path: string,
  keys: ReadonlyArray<string>,
): Result<UnknownJsonObject, PlaybackWireParseFailure> {
  const object = parseObject(input, path);
  if (object.kind === "failure") {
    return object;
  }

  for (const key of keys) {
    if (!Object.hasOwn(object.value, key)) {
      return failed(parseFailure(`${path}.${key}`, "missing-value"));
    }
  }

  for (const key of Object.keys(object.value)) {
    if (!keys.includes(key)) {
      return failed(parseFailure(`${path}.${key}`, "unexpected-key"));
    }
  }

  return object;
}

function parseObject(
  input: unknown,
  path: string,
): Result<UnknownJsonObject, PlaybackWireParseFailure> {
  if (!isUnknownJsonObject(input)) {
    return failed(parseFailure(path, "expected-object"));
  }

  return succeeded(input);
}

function parseArray(
  input: unknown,
  path: string,
): Result<ReadonlyArray<unknown>, PlaybackWireParseFailure> {
  if (!Array.isArray(input)) {
    return failed(parseFailure(path, "expected-array"));
  }

  return succeeded(input);
}

function parseNonEmptyString(
  input: unknown,
  path: string,
): Result<string, PlaybackWireParseFailure> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return failed(parseFailure(path, "expected-non-empty-string"));
  }

  return succeeded(input);
}

function parseHttpUrl(
  input: unknown,
  path: string,
): Result<string, PlaybackWireParseFailure> {
  const value = parseNonEmptyString(input, path);
  if (value.kind === "failure") {
    return value;
  }

  try {
    const url = new URL(value.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return failed(parseFailure(path, "expected-http-url"));
    }

    return succeeded(url.href);
  } catch {
    return failed(parseFailure(path, "expected-http-url"));
  }
}

function readRequired(
  source: UnknownJsonObject,
  key: string,
  path: string,
): Result<unknown, PlaybackWireParseFailure> {
  if (!Object.hasOwn(source, key)) {
    return failed(parseFailure(path, "missing-value"));
  }

  return succeeded(source[key]);
}

function parseFailure(
  path: string,
  code: PlaybackWireParseFailure["code"],
): PlaybackWireParseFailure {
  const failure: PlaybackWireParseFailure = {
    kind: "invalid-playback-wire",
    path,
    code,
  };
  return Object.freeze(failure);
}

function isUnknownJsonObject(input: unknown): input is UnknownJsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function freezeArray<Value>(
  values: ReadonlyArray<Value>,
): ReadonlyArray<Value> {
  return Object.freeze([...values]);
}

function succeeded<Value>(value: Value): {
  readonly kind: "success";
  readonly value: Value;
} {
  return Object.freeze({ kind: "success", value });
}

function failed<Failure>(error: Failure): {
  readonly kind: "failure";
  readonly error: Failure;
} {
  return Object.freeze({ kind: "failure", error });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected playback stream variant: ${String(value)}`);
}
