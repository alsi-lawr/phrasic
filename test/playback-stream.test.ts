import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackStreamSubscription,
  emptyPlaybackWireState,
  evaluatePlaybackStream,
  failurePlaybackWireState,
  initialPlaybackStreamCursor,
  parsePlaybackWireEvent,
  parsePlaybackWireState,
  serializePlaybackState,
  type PlaybackWireParseFailure,
  type PlaybackWireState,
} from "../domain/playback-stream.ts";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
  type Result,
} from "../domain/playback.ts";
import { parseSpotifyPlaybackPayload } from "../providers/spotify/playback.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./spotify-playback.fixture.ts";

test("the stream wire serializes and validates every emitted playback state", () => {
  const playing = wireState(playingTrackPayload);
  const paused = wireState(pausedEpisodePayload);
  const empty = wireState(emptyTrackPayload);
  const unsupported = wireState(advertisementPayload);
  const failure = failurePlaybackWireState(providerFailure("network"));

  const cases: ReadonlyArray<{
    readonly state: PlaybackWireState;
    readonly kind: PlaybackWireState["kind"];
  }> = [
    { state: playing, kind: "playing" },
    { state: paused, kind: "paused" },
    { state: empty, kind: "empty" },
    { state: unsupported, kind: "unsupported" },
    { state: failure, kind: "failure" },
  ];

  for (const scenario of cases) {
    const parsed = expectSuccess(parsePlaybackWireState(scenario.state));
    assert.equal(parsed.kind, scenario.kind);
  }
});

test("the stream wire preserves every lifecycle state without relabeling it as malformed", () => {
  const initializing = initialPlaybackState();
  const authorizationRequired = expectSuccess(
    transitionPlaybackState(initializing, {
      kind: "authorization-required",
      reason: "not-authorized",
    }),
  );
  const authorizing = expectSuccess(
    transitionPlaybackState(authorizationRequired, {
      kind: "begin-authorization",
    }),
  );
  const reconnecting = expectSuccess(
    transitionPlaybackState(authorizing, {
      kind: "authorization-complete",
    }),
  );

  const cases: ReadonlyArray<{
    readonly state: PlaybackState;
    readonly expected: PlaybackWireState;
  }> = [
    {
      state: initializing,
      expected: { kind: "initializing" },
    },
    {
      state: authorizationRequired,
      expected: {
        kind: "authorization-required",
        reason: "not-authorized",
      },
    },
    {
      state: authorizing,
      expected: { kind: "authorizing" },
    },
    {
      state: reconnecting,
      expected: {
        kind: "reconnecting",
        lastItem: { kind: "unavailable" },
      },
    },
  ];

  for (const scenario of cases) {
    const serialized = serializePlaybackState(scenario.state);
    assert.deepEqual(serialized, scenario.expected);
    assert.deepEqual(
      expectSuccess(parsePlaybackWireState(serialized)),
      serialized,
    );
  }
});

test("stream decisions distinguish changed, unchanged, empty, unsupported, and failure", () => {
  const playing = wireState(playingTrackPayload);
  const paused = wireState(pausedEpisodePayload);
  const empty = emptyPlaybackWireState();
  const unsupported = wireState(advertisementPayload);
  const failure = failurePlaybackWireState(providerFailure("rate-limited"));

  const first = evaluatePlaybackStream(initialPlaybackStreamCursor(), playing);
  assert.equal(first.outcome.kind, "changed");

  const unchanged = evaluatePlaybackStream(first.cursor, playing);
  assert.equal(unchanged.outcome.kind, "unchanged");

  const pausedChange = evaluatePlaybackStream(unchanged.cursor, paused);
  assert.equal(pausedChange.outcome.kind, "changed");

  const emptyChange = evaluatePlaybackStream(pausedChange.cursor, empty);
  assert.equal(emptyChange.outcome.kind, "empty");

  const emptyUnchanged = evaluatePlaybackStream(emptyChange.cursor, empty);
  assert.equal(emptyUnchanged.outcome.kind, "unchanged");

  const unsupportedChange = evaluatePlaybackStream(
    emptyUnchanged.cursor,
    unsupported,
  );
  assert.equal(unsupportedChange.outcome.kind, "unsupported");

  const failureChange = evaluatePlaybackStream(
    unsupportedChange.cursor,
    failure,
  );
  assert.equal(failureChange.outcome.kind, "failure");
});

test("stream suppression compares the complete emitted playback state", () => {
  const playing = wireState(playingTrackPayload);
  if (playing.kind !== "playing" || playing.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track wire state");
  }

  const paused = wireState(pausedEpisodePayload);
  if (paused.kind !== "paused" || paused.snapshot.item.kind !== "episode") {
    throw new Error("Expected a paused episode wire state");
  }

  const track = playing.snapshot.item;
  if (track.artwork.kind !== "available") {
    throw new Error("Expected available track artwork");
  }

  const episode = paused.snapshot.item;
  const scenarios: ReadonlyArray<{
    readonly current: PlaybackWireState;
    readonly next: PlaybackWireState;
    readonly name: string;
  }> = [
    {
      name: "position",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          positionMilliseconds: playing.snapshot.positionMilliseconds + 1,
        },
      }),
    },
    {
      name: "duration",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          durationMilliseconds: playing.snapshot.durationMilliseconds + 1,
        },
      }),
    },
    {
      name: "title",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: { ...track, title: "Updated track title" },
        },
      }),
    },
    {
      name: "creators",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: {
            ...track,
            artists: track.artists.map((artist) => ({
              ...artist,
              name: "Updated creator",
              links: artist.links.map((link) => ({
                ...link,
                href: "https://open.spotify.com/artist/artist-1-updated",
              })),
            })),
          },
        },
      }),
    },
    {
      name: "collection",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: {
            ...track,
            collection: {
              ...track.collection,
              id: "album-2",
              title: "Updated collection",
              links: track.collection.links.map((link) => ({
                ...link,
                href: "https://open.spotify.com/album/album-2",
              })),
            },
          },
        },
      }),
    },
    {
      name: "available artwork URL",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: {
            ...track,
            artwork: {
              ...track.artwork,
              url: "https://i.scdn.co/image/updated-track-artwork",
            },
          },
        },
      }),
    },
    {
      name: "artwork availability",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: {
            ...track,
            artwork: {
              kind: "unavailable",
              reason: "provider-did-not-supply-artwork",
            },
          },
        },
      }),
    },
    {
      name: "item links",
      current: playing,
      next: validatedWireState({
        ...playing,
        snapshot: {
          ...playing.snapshot,
          item: {
            ...track,
            links: track.links.map((link) => ({
              ...link,
              href: "https://open.spotify.com/track/track-1-updated",
            })),
          },
        },
      }),
    },
    {
      name: "show",
      current: paused,
      next: validatedWireState({
        ...paused,
        snapshot: {
          ...paused.snapshot,
          item: {
            ...episode,
            show: {
              ...episode.show,
              id: "show-2",
              title: "Updated show",
              publisher: "Updated publisher",
              links: episode.show.links.map((link) => ({
                ...link,
                href: "https://open.spotify.com/show/show-2",
              })),
            },
          },
        },
      }),
    },
    {
      name: "playing or paused state",
      current: playing,
      next: validatedWireState({ ...playing, kind: "paused" }),
    },
  ];

  for (const scenario of scenarios) {
    const first = evaluatePlaybackStream(
      initialPlaybackStreamCursor(),
      scenario.current,
    );
    const changed = evaluatePlaybackStream(first.cursor, scenario.next);

    assert.equal(changed.outcome.kind, "changed", scenario.name);
    if (changed.outcome.kind !== "changed") {
      throw new Error(`Expected ${scenario.name} to emit a changed state`);
    }

    assert.deepEqual(changed.outcome.state, scenario.next, scenario.name);
  }

  const firstFailure = evaluatePlaybackStream(
    initialPlaybackStreamCursor(),
    failurePlaybackWireState(providerFailure("network")),
  );
  const changedFailureState = failurePlaybackWireState(
    providerFailure("server-error"),
  );
  const changedFailure = evaluatePlaybackStream(
    firstFailure.cursor,
    changedFailureState,
  );

  assert.equal(changedFailure.outcome.kind, "failure");
  if (changedFailure.outcome.kind !== "failure") {
    throw new Error("Expected changed failure details to emit a failure state");
  }

  assert.deepEqual(changedFailure.outcome.state, changedFailureState);
});

test("each SSE subscriber emits its own initial playback state", () => {
  const state = wireState(playingTrackPayload);
  const firstSubscriber = createPlaybackStreamSubscription();
  const secondSubscriber = createPlaybackStreamSubscription();
  const firstInitialState = firstSubscriber.evaluate(state);
  const secondInitialState = secondSubscriber.evaluate(state);

  assert.deepEqual(firstInitialState, { kind: "changed", state });
  assert.deepEqual(secondInitialState, { kind: "changed", state });

  assert.equal(firstSubscriber.evaluate(state).kind, "unchanged");
  assert.equal(secondSubscriber.evaluate(state).kind, "unchanged");
});

test("wire validation rejects malformed and extra keys", () => {
  const playing = wireState(playingTrackPayload);
  if (playing.kind !== "playing") {
    throw new Error("Expected a playing wire state");
  }

  const extraTopLevel: unknown = {
    ...playing,
    extra: "unexpected",
  };
  const extraSnapshotKey: unknown = {
    ...playing,
    snapshot: {
      ...playing.snapshot,
      extra: "unexpected",
    },
  };
  const malformedIdentifier: unknown = {
    ...playing,
    snapshot: {
      ...playing.snapshot,
      item: {
        ...playing.snapshot.item,
        itemId: "",
      },
    },
  };

  assert.deepEqual(expectFailure(parsePlaybackWireState(extraTopLevel)), {
    kind: "invalid-playback-wire",
    path: "$.extra",
    code: "unexpected-key",
  });
  assert.deepEqual(expectFailure(parsePlaybackWireState(extraSnapshotKey)), {
    kind: "invalid-playback-wire",
    path: "$.snapshot.extra",
    code: "unexpected-key",
  });
  assert.deepEqual(expectFailure(parsePlaybackWireState(malformedIdentifier)), {
    kind: "invalid-playback-wire",
    path: "$.snapshot.item.itemId",
    code: "expected-non-empty-string",
  });
});

test("client-facing EventSource parsing uses safe failure states", () => {
  const playing = wireState(playingTrackPayload);
  const extraKeyEvent = JSON.stringify({
    ...emptyPlaybackWireState(),
    extra: "unexpected",
  });

  assert.equal(parsePlaybackWireEvent(JSON.stringify(playing)).kind, "playing");
  assert.deepEqual(parsePlaybackWireEvent("{"), {
    kind: "failure",
    error: {
      kind: "provider-failed",
      reason: "malformed-response",
    },
  });
  assert.deepEqual(parsePlaybackWireEvent(extraKeyEvent), {
    kind: "failure",
    error: {
      kind: "provider-failed",
      reason: "malformed-response",
    },
  });
  assert.deepEqual(parsePlaybackWireEvent(42), {
    kind: "failure",
    error: {
      kind: "provider-failed",
      reason: "malformed-response",
    },
  });
});

function wireState(payload: unknown): PlaybackWireState {
  return serializePlaybackState(
    expectSuccess(parseSpotifyPlaybackPayload(payload)),
  );
}

function validatedWireState(input: unknown): PlaybackWireState {
  return expectSuccess(parsePlaybackWireState(input));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful result");
}

function expectFailure<Value>(
  result: Result<Value, PlaybackWireParseFailure>,
): PlaybackWireParseFailure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed wire validation result");
}
