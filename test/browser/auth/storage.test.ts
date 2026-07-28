import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  AuthorizationAttemptTimestamp,
  PendingAuthorizationAttempt,
  PkceState,
  PkceStateCandidate,
  PkceVerifier,
  type DisplayReturnConfiguration,
} from "../../../browser/auth/pkce-values.ts";
import { parseDisplayReturnConfiguration } from "../../../browser/auth/pkce.ts";
import { createIndexedDbSpotifyAuthStorage } from "../../../browser/auth/storage.ts";
import { type SpotifyAuthStoragePort } from "../../../browser/auth/spotify-auth-storage-contract.ts";
import { SpotifyRefreshToken } from "../../../browser/auth/spotify-token-values.ts";
import { createControlledAuthorizationIndexedDbFixture } from "./controlled-indexed-db.ts";

const pendingAuthorizationAttemptsStoreName = "pending-authorization-attempts";
const spotifyConnectionsStoreName = "spotify-connections";
const firstState = "A".repeat(43);
const secondState = "B".repeat(43);
const thirdState = "C".repeat(43);
const verifierValue = "A".repeat(86);

test("independently saved pending PKCE attempts can each be consumed once", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const first = pendingAuthorizationAttempt(firstState, 1_000_000);
  const second = pendingAuthorizationAttempt(secondState, 1_000_001);

  await storage.savePendingAuthorizationAttempt(first);
  await storage.savePendingAuthorizationAttempt(second);

  const unmatched = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(thirdState),
    observedAt: timestamp(1_000_001),
  });
  assert.deepEqual(unmatched, { kind: "rejected", reason: "missing-attempt" });

  const firstConsumed = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_000_001),
  });

  assert.equal(firstConsumed.kind, "consumed");
  if (firstConsumed.kind === "consumed") {
    assert.equal(firstConsumed.attempt.state.toStorageValue(), firstState);
  }

  const firstReplay = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_000_001),
  });
  assert.deepEqual(firstReplay, {
    kind: "rejected",
    reason: "missing-attempt",
  });

  const secondConsumed = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(secondState),
    observedAt: timestamp(1_000_001),
  });
  assert.equal(secondConsumed.kind, "consumed");
  if (secondConsumed.kind === "consumed") {
    assert.equal(secondConsumed.attempt.state.toStorageValue(), secondState);
  }

  const secondReplay = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(secondState),
    observedAt: timestamp(1_000_001),
  });
  assert.deepEqual(secondReplay, {
    kind: "rejected",
    reason: "missing-attempt",
  });
});

test("concurrent pending PKCE consumes yield exactly one successful authorization", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const attempt = pendingAuthorizationAttempt(firstState, 1_000_000);
  const options = Object.freeze({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_000_001),
  });

  await storage.savePendingAuthorizationAttempt(attempt);
  const results = await Promise.all([
    storage.consumePendingAuthorizationAttempt(options),
    storage.consumePendingAuthorizationAttempt(options),
  ]);
  const consumedCount = results.filter(
    (result) => result.kind === "consumed",
  ).length;

  assert.equal(consumedCount, 1);
  assert.deepEqual(
    results.map((result) =>
      result.kind === "consumed" ? result.kind : result.reason,
    ),
    ["consumed", "missing-attempt"],
  );
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);
});

test("pending PKCE records expire and are deleted at the exact ten-minute boundary", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const attempt = pendingAuthorizationAttempt(firstState, 1_000_000);

  await storage.savePendingAuthorizationAttempt(attempt);
  const expired = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_600_000),
  });
  const replay = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_600_000),
  });

  assert.deepEqual(expired, { kind: "rejected", reason: "expired" });
  assert.deepEqual(replay, { kind: "rejected", reason: "missing-attempt" });
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);
});

test("malformed and provider-mismatched pending PKCE records are removed", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const attempt = pendingAuthorizationAttempt(firstState, 1_000_000);

  await storage.readSpotifyRefreshToken();
  fixture.seedRecord({
    storeName: pendingAuthorizationAttemptsStoreName,
    key: pendingKey(firstState),
    value: Object.freeze({ provider: "spotify", state: firstState }),
  });
  const malformed = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_000_001),
  });

  assert.deepEqual(malformed, {
    kind: "rejected",
    reason: "invalid-stored-attempt",
  });
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);

  fixture.seedRecord({
    storeName: pendingAuthorizationAttemptsStoreName,
    key: pendingKey(firstState),
    value: storedPendingAuthorizationValue(attempt, "another-provider"),
  });
  const providerMismatch = await storage.consumePendingAuthorizationAttempt({
    state: stateCandidate(firstState),
    observedAt: timestamp(1_000_001),
  });

  assert.deepEqual(providerMismatch, {
    kind: "rejected",
    reason: "provider-mismatch",
  });
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);
});

test("refresh tokens save, replace, read, and delete", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const initial = refreshToken("initial-refresh-token");
  const replacement = refreshToken("replacement-refresh-token");

  await assertMissingRefreshToken(storage);
  await storage.saveSpotifyRefreshToken(initial);
  await assertStoredRefreshToken(storage, "initial-refresh-token");
  await storage.saveSpotifyRefreshToken(replacement);
  await assertStoredRefreshToken(storage, "replacement-refresh-token");

  await storage.deleteSpotifyRefreshToken();
  await assertMissingRefreshToken(storage);
  assert.deepEqual(fixture.records(spotifyConnectionsStoreName), []);
});

test("malformed refresh-token records are removed when read", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);

  await storage.readSpotifyRefreshToken();
  fixture.seedRecord({
    storeName: spotifyConnectionsStoreName,
    key: "spotify",
    value: Object.freeze({ provider: "spotify", refreshToken: "" }),
  });

  await assertMissingRefreshToken(storage);
  assert.deepEqual(fixture.records(spotifyConnectionsStoreName), []);
});

test("clearing Spotify authorization atomically removes pending attempts and the refresh token", async () => {
  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const first = pendingAuthorizationAttempt(firstState, 1_000_000);
  const second = pendingAuthorizationAttempt(secondState, 1_000_001);

  await storage.savePendingAuthorizationAttempt(first);
  await storage.savePendingAuthorizationAttempt(second);
  await storage.saveSpotifyRefreshToken(refreshToken("stored-refresh-token"));
  fixture.resetCommittedTransactions();

  await storage.clearSpotifyAuthorization();

  assert.equal(fixture.committedTransactions().length, 1);
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);
  assert.deepEqual(fixture.records(spotifyConnectionsStoreName), []);
  await assertMissingRefreshToken(storage);
  assert.deepEqual(
    await storage.consumePendingAuthorizationAttempt({
      state: stateCandidate(firstState),
      observedAt: timestamp(1_000_001),
    }),
    { kind: "rejected", reason: "missing-attempt" },
  );
});

test("open, request, and transaction failures preserve IndexedDB context and causes", async () => {
  const failedOpenFixture = createControlledAuthorizationIndexedDbFixture();
  const openRequestCause = new Error("controlled open request failure");

  failedOpenFixture.failNextOpenRequest(openRequestCause);
  await assert.rejects(
    createIndexedDbSpotifyAuthStorage(
      failedOpenFixture.port,
    ).readSpotifyRefreshToken(),
    contextualIndexedDbFailure("IndexedDB request failed.", openRequestCause),
  );

  const fixture = createControlledAuthorizationIndexedDbFixture();
  const storage = createIndexedDbSpotifyAuthStorage(fixture.port);
  const getRequestCause = new Error("controlled get request failure");
  const transactionCause = new Error("controlled transaction failure");

  await storage.readSpotifyRefreshToken();
  fixture.failNextGetRequest(getRequestCause);
  await assert.rejects(
    storage.readSpotifyRefreshToken(),
    contextualIndexedDbFailure("IndexedDB request failed.", getRequestCause),
  );

  fixture.failNextTransaction(transactionCause);
  await assert.rejects(
    storage.savePendingAuthorizationAttempt(
      pendingAuthorizationAttempt(thirdState, 1_000_000),
    ),
    contextualIndexedDbFailure(
      "IndexedDB transaction failed.",
      transactionCause,
    ),
  );
  assert.deepEqual(fixture.records(pendingAuthorizationAttemptsStoreName), []);
});

function pendingAuthorizationAttempt(
  state: string,
  createdAt: number,
): PendingAuthorizationAttempt {
  return PendingAuthorizationAttempt.create({
    state: parsedState(state),
    verifier: parsedVerifier(verifierValue),
    createdAt: timestamp(createdAt),
    returnTo: displayReturnConfiguration(),
  });
}

function storedPendingAuthorizationValue(
  attempt: PendingAuthorizationAttempt,
  provider: string,
): object {
  return {
    provider,
    state: attempt.state.toStorageValue(),
    verifier: attempt.verifier.toStorageValue(),
    createdAt: attempt.createdAt.toEpochMilliseconds(),
    expiresAt: attempt.expiresAt.toEpochMilliseconds(),
    returnTo: {
      width: Number(attempt.returnTo.width.toQueryParameter()),
      setup: attempt.returnTo.setup.kind === "setup-requested",
    },
  };
}

function pendingKey(state: string): readonly ["spotify", string] {
  const key: ["spotify", string] = ["spotify", state];

  return Object.freeze(key);
}

function parsedState(value: string): PkceState {
  const result = PkceState.parse(value);
  if (result.kind === "failure") {
    throw new Error("Expected a valid PKCE state.");
  }

  return result.value;
}

function stateCandidate(value: string): PkceStateCandidate {
  const result = PkceStateCandidate.parse(value);
  if (result.kind === "failure") {
    throw new Error("Expected a valid PKCE state candidate.");
  }

  return result.value;
}

function parsedVerifier(value: string): PkceVerifier {
  const result = PkceVerifier.parse(value);
  if (result.kind === "failure") {
    throw new Error("Expected a valid PKCE verifier.");
  }

  return result.value;
}

function timestamp(value: number): AuthorizationAttemptTimestamp {
  const result = AuthorizationAttemptTimestamp.parse(value);
  if (result.kind === "failure") {
    throw new Error("Expected a valid authorization timestamp.");
  }

  return result.value;
}

function displayReturnConfiguration(): DisplayReturnConfiguration {
  const result = parseDisplayReturnConfiguration({ width: 1_280, setup: true });
  if (result.kind === "failure") {
    throw new Error("Expected a valid display return configuration.");
  }

  return result.value;
}

function refreshToken(value: string): SpotifyRefreshToken {
  const result = SpotifyRefreshToken.parse(value);
  if (result.kind === "failure") {
    throw new Error("Expected a valid Spotify refresh token.");
  }

  return result.value;
}

async function assertStoredRefreshToken(
  storage: SpotifyAuthStoragePort,
  expectedRefreshToken: string,
): Promise<void> {
  const result = await storage.readSpotifyRefreshToken();
  assert.equal(result.kind, "found");
  if (result.kind === "found") {
    assert.equal(result.refreshToken.toStorageValue(), expectedRefreshToken);
  }
}

async function assertMissingRefreshToken(
  storage: SpotifyAuthStoragePort,
): Promise<void> {
  assert.deepEqual(await storage.readSpotifyRefreshToken(), {
    kind: "missing",
  });
}

function contextualIndexedDbFailure(
  expectedMessage: string,
  expectedCause: Error,
): (error: unknown) => boolean {
  return (error: unknown): boolean => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, expectedMessage);
    assert.equal(error.cause, expectedCause);

    return true;
  };
}
