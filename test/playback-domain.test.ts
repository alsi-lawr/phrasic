import assert from "node:assert/strict";
import test from "node:test";
import {
  availableOriginalArtwork,
  Creator,
  Collection,
  EpisodeItem,
  initialPlaybackState,
  PlaybackSnapshot,
  providerFailure,
  ProviderLink,
  Show,
  TrackItem,
  transitionPlaybackState,
  unavailableOriginalArtwork,
  parseDisplayText,
  parseOriginalArtworkUrl,
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  parseProviderCollectionId,
  parseProviderId,
  parseProviderItemId,
  type OriginalArtwork,
  type DisplayText,
  type PlaybackState,
  type ProviderId,
  type Result,
} from "../domain/playback.ts";

test("validated values reject invalid boundaries and preserve distinct values", () => {
  const provider = expectSuccess(parseProviderId("spotify"));
  const item = expectSuccess(parseProviderItemId("track-1"));
  const collection = expectSuccess(parseProviderCollectionId("album-1"));
  const position = expectSuccess(parsePlaybackPositionMilliseconds(1_250));
  const duration = expectSuccess(parsePlaybackDurationMilliseconds(3_000));

  assert.equal(provider, "spotify");
  assert.equal(item, "track-1");
  assert.equal(collection, "album-1");
  assert.equal(position, 1_250);
  assert.equal(duration, 3_000);
  assert.deepEqual(expectFailure(parseProviderId("   ")), {
    kind: "invalid-value",
    value: "provider-id",
    reason: "empty-string",
  });
  assert.deepEqual(expectFailure(parsePlaybackPositionMilliseconds(-1)), {
    kind: "invalid-value",
    value: "playback-position-milliseconds",
    reason: "expected-non-negative-integer",
  });
  assert.deepEqual(expectFailure(parseOriginalArtworkUrl("not a URL")), {
    kind: "invalid-value",
    value: "original-artwork-url",
    reason: "invalid-url",
  });
});

test("track and episode items retain their distinct metadata", () => {
  const track = makeTrack(availableArtwork());
  const episode = makeEpisode(availableArtwork());

  assert.equal(track.kind, "track");
  assert.equal(track.title, "Track title");
  assert.equal(track.collection.title, "Collection title");
  assert.deepEqual(
    track.artists.map((artist: Creator): string => artist.name),
    ["Track artist"],
  );
  assert.equal(episode.kind, "episode");
  assert.equal(episode.title, "Episode title");
  assert.equal(episode.show.title, "Show title");
  assert.equal(episode.show.publisher, "Show publisher");
});

test("unavailable original artwork is explicit", () => {
  const artwork = unavailableOriginalArtwork("provider-did-not-supply-artwork");
  const track = makeTrack(artwork);

  assert.equal(track.artwork.kind, "unavailable");
  if (track.artwork.kind === "unavailable") {
    assert.equal(track.artwork.reason, "provider-did-not-supply-artwork");
  }
});

test("item construction reports missing creators and mismatched provider links", () => {
  const provider = makeProvider();
  const otherProvider = expectSuccess(parseProviderId("another-provider"));
  const artwork = availableArtwork();
  const collection = makeCollection(provider);
  const title = text("Track title");
  const itemId = expectSuccess(parseProviderItemId("track-1"));
  const mismatchedLink = expectSuccess(
    ProviderLink.create({
      providerId: otherProvider,
      href: "https://another-provider.example/items/track-1",
    }),
  );

  assert.deepEqual(
    expectFailure(
      TrackItem.create({
        providerId: provider,
        itemId,
        title,
        artists: [],
        collection,
        artwork,
        links: [makeProviderLink(provider, "track-1")],
      }),
    ),
    {
      kind: "invalid-item",
      item: "track",
      reason: "missing-creators",
    },
  );
  assert.deepEqual(
    expectFailure(
      TrackItem.create({
        providerId: provider,
        itemId,
        title,
        artists: [makeCreator(provider)],
        collection,
        artwork,
        links: [mismatchedLink],
      }),
    ),
    {
      kind: "invalid-item",
      item: "track",
      reason: "provider-link-provider-mismatch",
    },
  );
});

test("playback snapshots reject positions beyond their duration", () => {
  const track = makeTrack(availableArtwork());
  const position = expectSuccess(parsePlaybackPositionMilliseconds(3_001));
  const duration = expectSuccess(parsePlaybackDurationMilliseconds(3_000));

  assert.deepEqual(
    expectFailure(
      PlaybackSnapshot.create({
        item: track,
        position,
        duration,
      }),
    ),
    {
      kind: "invalid-playback-snapshot",
      reason: "position-exceeds-duration",
    },
  );
});

test("playback transitions cover every lifecycle state", () => {
  const snapshot = makeSnapshot();
  let state: PlaybackState = initialPlaybackState();
  assert.equal(state.kind, "initializing");

  state = expectSuccess(
    transitionPlaybackState(state, {
      kind: "authorization-required",
      reason: "not-authorized",
    }),
  );
  assert.equal(state.kind, "authorization-required");

  state = expectSuccess(
    transitionPlaybackState(state, { kind: "begin-authorization" }),
  );
  assert.equal(state.kind, "authorizing");

  state = expectSuccess(
    transitionPlaybackState(state, { kind: "authorization-complete" }),
  );
  assert.equal(state.kind, "reconnecting");
  if (state.kind === "reconnecting") {
    assert.equal(state.lastItem.kind, "unavailable");
  }

  state = expectSuccess(
    transitionPlaybackState(state, { kind: "playback-empty" }),
  );
  assert.equal(state.kind, "empty");

  state = expectSuccess(
    transitionPlaybackState(state, {
      kind: "playback-playing",
      snapshot,
    }),
  );
  assert.equal(state.kind, "playing");

  state = expectSuccess(
    transitionPlaybackState(state, {
      kind: "playback-paused",
      snapshot,
    }),
  );
  assert.equal(state.kind, "paused");

  state = expectSuccess(
    transitionPlaybackState(state, {
      kind: "playback-unsupported",
      reason: "advertisement",
    }),
  );
  assert.equal(state.kind, "unsupported");

  state = expectSuccess(
    transitionPlaybackState(state, { kind: "connection-lost" }),
  );
  assert.equal(state.kind, "reconnecting");
  if (state.kind === "reconnecting") {
    assert.equal(state.lastItem.kind, "unavailable");
  }

  state = expectSuccess(
    transitionPlaybackState(state, {
      kind: "failure",
      failure: providerFailure("network"),
    }),
  );
  assert.equal(state.kind, "failure");
  if (state.kind === "failure") {
    assert.deepEqual(state.error, providerFailure("network"));
  }

  state = expectSuccess(transitionPlaybackState(state, { kind: "retry" }));
  assert.equal(state.kind, "initializing");
});

test("available authorization reaches reconnecting without a last item", () => {
  const state = expectSuccess(
    transitionPlaybackState(initialPlaybackState(), {
      kind: "authorization-available",
    }),
  );

  assert.equal(state.kind, "reconnecting");
  if (state.kind === "reconnecting") {
    assert.equal(state.lastItem.kind, "unavailable");
  }
});

test("reconnecting keeps a stale last item only after active playback", () => {
  const snapshot = makeSnapshot();
  const reconnecting = expectSuccess(
    transitionPlaybackState(
      expectSuccess(
        transitionPlaybackState(initialPlaybackState(), {
          kind: "authorization-available",
        }),
      ),
      {
        kind: "playback-playing",
        snapshot,
      },
    ),
  );
  const state = expectSuccess(
    transitionPlaybackState(reconnecting, { kind: "connection-lost" }),
  );

  assert.equal(state.kind, "reconnecting");
  if (state.kind === "reconnecting") {
    assert.equal(state.lastItem.kind, "available");
    if (state.lastItem.kind === "available") {
      assert.equal(state.lastItem.item, snapshot.item);
    }
  }
});

test("invalid transitions and expected failures use explicit result branches", () => {
  assert.deepEqual(
    expectFailure(
      transitionPlaybackState(initialPlaybackState(), {
        kind: "begin-authorization",
      }),
    ),
    {
      kind: "invalid-transition",
      state: "initializing",
      event: "begin-authorization",
    },
  );
  assert.deepEqual(providerFailure("rate-limited"), {
    kind: "provider-failed",
    reason: "rate-limited",
  });
});

function makeSnapshot(): PlaybackSnapshot {
  return expectSuccess(
    PlaybackSnapshot.create({
      item: makeTrack(availableArtwork()),
      position: expectSuccess(parsePlaybackPositionMilliseconds(1_250)),
      duration: expectSuccess(parsePlaybackDurationMilliseconds(3_000)),
    }),
  );
}

function makeTrack(artwork: OriginalArtwork): TrackItem {
  const provider = makeProvider();
  const links: ReadonlyArray<ProviderLink> = [
    makeProviderLink(provider, "track-1"),
  ];
  return expectSuccess(
    TrackItem.create({
      providerId: provider,
      itemId: expectSuccess(parseProviderItemId("track-1")),
      title: text("Track title"),
      artists: [makeCreator(provider)],
      collection: makeCollection(provider),
      artwork,
      links,
    }),
  );
}

function makeEpisode(artwork: OriginalArtwork): EpisodeItem {
  const provider = makeProvider();
  const links: ReadonlyArray<ProviderLink> = [
    makeProviderLink(provider, "episode-1"),
  ];
  return expectSuccess(
    EpisodeItem.create({
      providerId: provider,
      itemId: expectSuccess(parseProviderItemId("episode-1")),
      title: text("Episode title"),
      show: Show.create({
        id: expectSuccess(parseProviderCollectionId("show-1")),
        title: text("Show title"),
        publisher: text("Show publisher"),
        links,
      }),
      artwork,
      links,
    }),
  );
}

function makeCreator(provider: ProviderId): Creator {
  return Creator.create({
    name: text("Track artist"),
    links: [makeProviderLink(provider, "artist-1")],
  });
}

function makeCollection(provider: ProviderId): Collection {
  return Collection.create({
    id: expectSuccess(parseProviderCollectionId("collection-1")),
    title: text("Collection title"),
    links: [makeProviderLink(provider, "collection-1")],
  });
}

function makeProvider(): ProviderId {
  return expectSuccess(parseProviderId("spotify"));
}

function makeProviderLink(provider: ProviderId, itemId: string): ProviderLink {
  return expectSuccess(
    ProviderLink.create({
      providerId: provider,
      href: `https://spotify.example/items/${itemId}`,
    }),
  );
}

function availableArtwork(): OriginalArtwork {
  return availableOriginalArtwork(
    expectSuccess(
      parseOriginalArtworkUrl("https://spotify.example/artwork.jpg"),
    ),
  );
}

function text(value: string): DisplayText {
  return expectSuccess(parseDisplayText(value));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed domain result");
}
