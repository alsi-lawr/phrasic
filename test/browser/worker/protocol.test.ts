import assert from "node:assert/strict";
import test from "node:test";
import type { Result } from "../../../domain/playback.ts";
import {
  parsePlaybackWorkerCommand,
  parsePlaybackWorkerEvent,
} from "../../../browser/worker/protocol.ts";

test("worker commands are manually validated as exact protocol messages", () => {
  const commands: ReadonlyArray<unknown> = [
    {
      kind: "initialize",
      applicationUrl: "https://nowplaying.example/nowplaying",
      configuration: {
        spotify: {
          clientId: "browser-client-id",
          redirectUri: "https://nowplaying.example/spotify/",
        },
      },
    },
    {
      kind: "begin-authorization",
      returnTo: { width: 1_280, setup: true },
    },
    {
      kind: "consume-callback",
      callbackUrl:
        "https://nowplaying.example/spotify/?code=authorization-code&state=state",
    },
    { kind: "retry" },
    { kind: "visibility-change", visibility: "hidden" },
    { kind: "logout" },
    { kind: "dispose" },
  ];

  const parsedKinds = commands.map(
    (command) => expectSuccess(parsePlaybackWorkerCommand(command)).kind,
  );

  assert.deepEqual(parsedKinds, [
    "initialize",
    "begin-authorization",
    "consume-callback",
    "retry",
    "visibility-change",
    "logout",
    "dispose",
  ]);
});

test("unknown, extra, and malformed worker commands are rejected without inspecting their values", () => {
  const malformedMessages: ReadonlyArray<unknown> = [
    null,
    { kind: "poll-now" },
    { kind: "retry", accessToken: "token-value" },
    { kind: "visibility-change", visibility: "background" },
    { kind: "consume-callback", callbackUrl: "" },
  ];

  for (const message of malformedMessages) {
    const parsed = parsePlaybackWorkerCommand(message);
    assert.equal(parsed.kind, "failure");
    if (parsed.kind === "failure") {
      assert.equal(parsed.error.kind, "invalid-playback-worker-command");
    }
  }
});

test("worker events carry only validated provider-neutral wire state or fixed diagnostics", () => {
  const playback = expectSuccess(
    parsePlaybackWorkerEvent({
      kind: "playback-state",
      state: { kind: "empty" },
    }),
  );
  const diagnostic = expectSuccess(
    parsePlaybackWorkerEvent({
      kind: "safe-diagnostic",
      operation: "playback-poll",
      code: "playback-rate-limited",
      metadata: {
        kind: "http-status-and-retry-after",
        status: 429,
        retryAfterMilliseconds: 7_000,
      },
    }),
  );
  const leaked = parsePlaybackWorkerEvent({
    kind: "playback-state",
    state: { kind: "empty" },
    accessToken: "token-value",
  });

  assert.deepEqual(playback, {
    kind: "playback-state",
    state: { kind: "empty" },
  });
  assert.deepEqual(diagnostic, {
    kind: "safe-diagnostic",
    operation: "playback-poll",
    code: "playback-rate-limited",
    metadata: {
      kind: "http-status-and-retry-after",
      status: 429,
      retryAfterMilliseconds: 7_000,
    },
  });
  assert.equal(leaked.kind, "failure");
});

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "failure") {
    throw new Error("Expected protocol parsing to succeed.");
  }

  return result.value;
}
