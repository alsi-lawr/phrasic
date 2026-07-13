import assert from "node:assert/strict";
import test from "node:test";
import {
  deserializePlaybackWireState,
  failurePlaybackWireState,
  parsePlaybackWireState,
  serializePlaybackState,
  type PlaybackWireState,
} from "../../../browser/worker/playback-wire.ts";
import {
  authorizationFailure,
  currentPlaybackItem,
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
  type Result,
} from "../../../domain/playback.ts";
import { parseSpotifyPlaybackPayload } from "../../../browser/providers/spotify-payload.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "../providers/spotify-payload.fixture.ts";

test("the worker wire serializes and validates every emitted playback state", () => {
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

test("the worker wire preserves every lifecycle state without relabeling it as malformed", () => {
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

test("validated wire states deserialize to trusted playback states", () => {
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
  const playing = expectSuccess(
    parseSpotifyPlaybackPayload(playingTrackPayload),
  );
  const paused = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const empty = expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload));
  const unsupported = expectSuccess(
    parseSpotifyPlaybackPayload(advertisementPayload),
  );
  const reconnectingWithItem = expectSuccess(
    transitionPlaybackState(playing, { kind: "connection-lost" }),
  );
  const failure = expectSuccess(
    transitionPlaybackState(initializing, {
      kind: "failure",
      failure: providerFailure("network"),
    }),
  );
  const authorizationFailureState = expectSuccess(
    transitionPlaybackState(initializing, {
      kind: "failure",
      failure: authorizationFailure("authorization-denied"),
    }),
  );
  const states: ReadonlyArray<PlaybackState> = [
    initializing,
    authorizationRequired,
    authorizing,
    reconnecting,
    playing,
    paused,
    empty,
    unsupported,
    reconnectingWithItem,
    failure,
    authorizationFailureState,
  ];

  for (const state of states) {
    const wire = serializePlaybackState(state);
    const deserialized = expectSuccess(deserializePlaybackWireState(wire));

    assert.equal(deserialized.kind, state.kind);
    assert.deepEqual(serializePlaybackState(deserialized), wire);
  }
});

test("trusted playback item views preserve playing and paused items", () => {
  const playing = expectSuccess(
    parseSpotifyPlaybackPayload(playingTrackPayload),
  );
  const paused = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const reconnecting = expectSuccess(
    transitionPlaybackState(playing, { kind: "connection-lost" }),
  );
  const cases: ReadonlyArray<{
    readonly state: PlaybackState;
    readonly itemKind: "episode" | "track";
  }> = [
    { state: playing, itemKind: "track" },
    { state: paused, itemKind: "episode" },
    { state: reconnecting, itemKind: "track" },
  ];

  for (const scenario of cases) {
    const item = currentPlaybackItem(scenario.state);

    assert.equal(item.kind, "available");
    if (item.kind === "available") {
      assert.equal(item.item.kind, scenario.itemKind);
    }
  }
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

test("wire deserialization rejects values that cannot construct trusted items", () => {
  const playing = wireState(playingTrackPayload);
  if (playing.kind !== "playing" || playing.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track wire state");
  }

  const uncommittable: PlaybackWireState = {
    ...playing,
    snapshot: {
      ...playing.snapshot,
      item: {
        ...playing.snapshot.item,
        artists: [],
      },
    },
  };

  assert.deepEqual(expectFailure(deserializePlaybackWireState(uncommittable)), {
    kind: "invalid-playback-wire-domain",
  });
});

function wireState(payload: unknown): PlaybackWireState {
  return serializePlaybackState(
    expectSuccess(parseSpotifyPlaybackPayload(payload)),
  );
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful result");
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed wire validation result");
}
