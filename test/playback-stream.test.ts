import assert from "node:assert/strict";
import test from "node:test";
import {
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
import { providerFailure, type Result } from "../domain/playback.ts";
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
