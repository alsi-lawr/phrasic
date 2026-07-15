import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "../../../browser/config.ts";
import {
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
  parseDisplayReturnConfiguration,
} from "../../../browser/auth/pkce.ts";
import {
  type BrowserPkceCryptoPort,
  type DisplayReturnConfiguration,
  type PendingAuthorizationAttempt,
} from "../../../browser/auth/pkce-values.ts";
import {
  beginSpotifyAuthorization,
  consumeSpotifyAuthorizationCallback,
  createBrowserAuthClockPort,
  logoutSpotifyAuthorization,
  refreshSpotifyConnection,
  type BrowserAuthClockPort,
  type SpotifyAuthorizationRedirect,
} from "../../../browser/auth/session.ts";
import {
  type SpotifyAuthStoragePort,
  type SpotifyPendingAuthorizationAttemptConsumeOptions,
  type SpotifyPendingAuthorizationAttemptConsumeResult,
  type SpotifyRefreshTokenReadResult,
} from "../../../browser/auth/spotify-auth-storage-contract.ts";
import { SpotifyRefreshToken } from "../../../browser/auth/spotify-token-values.ts";
import {
  type SpotifyAuthFetchPort,
  type SpotifyAuthFetchRequest,
  type SpotifyAuthFetchResult,
  type SpotifyAuthFetchResponse,
  type SpotifyAuthJsonReadResult,
} from "../../../browser/auth/spotify-auth-fetch.ts";

type StoredRefreshToken =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "stored";
      readonly refreshToken: SpotifyRefreshToken;
    };

type ClockFixture = {
  readonly clock: BrowserAuthClockPort;
  readonly setEpochMilliseconds: (value: number) => void;
};

type BegunAuthorization = {
  readonly redirect: SpotifyAuthorizationRedirect;
  readonly state: string;
};

const applicationUrl = new URL("https://nowplaying.example/nowplaying");
const validState = "A".repeat(43);
const validVerifier = "A".repeat(86);

test("successful PKCE callback persists only pending values and the refresh token", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([
    jsonFetchResponse(200, {
      access_token: "initial-access-token",
      expires_in: 3_600,
      refresh_token: "initial-refresh-token",
    }),
  ]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`code=authorization-code&state=${begun.state}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.equal(result.kind, "connected");
  if (result.kind === "connected") {
    assert.equal(result.accessToken.toMemoryValue(), "initial-access-token");
    assert.equal(result.expiresIn.toSeconds(), 3_600);
    assert.equal(result.expiresIn.toMilliseconds(), 3_600_000);
    assert.equal(result.returnTo.width.toQueryParameter(), "1280");
  }
  assert.equal(storage.pendingAttemptCount, 0);
  assert.equal(await storedRefreshToken(storage), "initial-refresh-token");
  assert.deepEqual(storage.persistedValues, [
    validState,
    validVerifier,
    "initial-refresh-token",
  ]);
  assert.equal(storage.persistedValues.includes("initial-access-token"), false);

  const request = onlyFetchRequest(fetch);
  assert.equal(
    request.url.toString(),
    "https://accounts.spotify.com/api/token",
  );
  assert.equal(request.method, "POST");
  assert.equal(request.contentType, "application/x-www-form-urlencoded");
  assert.deepEqual(Array.from(new URLSearchParams(request.body).entries()), [
    ["client_id", "browser-client-id"],
    ["grant_type", "authorization_code"],
    ["code", "authorization-code"],
    ["redirect_uri", "https://nowplaying.example/spotify/"],
    ["code_verifier", validVerifier],
  ]);
});

test("provider denial consumes the matching pending authorization without calling the token endpoint", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`error=access_denied&state=${begun.state}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.equal(result.kind, "authorization-denied");
  assert.equal(storage.pendingAttemptCount, 0);
  assert.equal(fetch.requestCount, 0);
  await assertMissingRefreshToken(storage);
});

test("malformed callbacks do not exchange code or consume a pending attempt", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(
      `code=authorization-code&state=${begun.state}&unexpected=true`,
    ),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "malformed-callback",
    code: "unexpected-query-parameter",
  });
  assert.equal(storage.pendingAttemptCount, 1);
  assert.equal(fetch.requestCount, 0);
});

test("a callback state mismatch leaves the authentic pending attempt available and requires authorization", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`code=authorization-code&state=${"B".repeat(43)}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "authorization-required",
    reason: "invalid-pending-authorization",
  });
  assert.equal(storage.pendingAttemptCount, 1);
  assert.equal(fetch.requestCount, 0);
});

test("a replayed successful callback is rejected after its one-time pending attempt is consumed", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([
    jsonFetchResponse(200, {
      access_token: "initial-access-token",
      expires_in: 3_600,
      refresh_token: "initial-refresh-token",
    }),
  ]);
  const options = {
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`code=authorization-code&state=${begun.state}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  };

  const first = await consumeSpotifyAuthorizationCallback(options);
  const replay = await consumeSpotifyAuthorizationCallback(options);

  assert.equal(first.kind, "connected");
  assert.deepEqual(replay, {
    kind: "authorization-required",
    reason: "invalid-pending-authorization",
  });
  assert.equal(fetch.requestCount, 1);
});

test("pending authorization attempts expire at the exact ten-minute boundary", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  clock.setEpochMilliseconds(1_600_000);
  const fetch = new FakeSpotifyAuthFetch([]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`code=authorization-code&state=${begun.state}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "authorization-required",
    reason: "expired-pending-authorization",
  });
  assert.equal(storage.pendingAttemptCount, 0);
  assert.equal(fetch.requestCount, 0);
});

test("malformed token JSON becomes a safe provider failure without persisting a refresh token", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  const begun = await beginAuthorization(storage, clock.clock);
  const fetch = new FakeSpotifyAuthFetch([
    jsonFetchResponse(200, {
      access_token: "initial-access-token",
      expires_in: "3600",
      refresh_token: "initial-refresh-token",
    }),
  ]);

  const result = await consumeSpotifyAuthorizationCallback({
    configuration: browserConfiguration(),
    callbackUrl: callbackUrl(`code=authorization-code&state=${begun.state}`),
    clock: clock.clock,
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "provider-failure",
    code: "invalid-token-response",
    returnTo: displayReturnConfiguration(),
  });
  assert.equal(storage.pendingAttemptCount, 0);
  await assertMissingRefreshToken(storage);
});

test("refresh rotates a new refresh token and retains the existing token when Spotify omits rotation", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  await seedRefreshToken(storage, "initial-refresh-token");
  const fetch = new FakeSpotifyAuthFetch([
    jsonFetchResponse(200, {
      access_token: "first-access-token",
      expires_in: 3_600,
      refresh_token: "rotated-refresh-token",
    }),
    jsonFetchResponse(200, {
      access_token: "second-access-token",
      expires_in: 1_800,
    }),
  ]);
  const options = {
    configuration: browserConfiguration(),
    fetch,
    signal: new AbortController().signal,
    storage,
  };

  const rotated = await refreshSpotifyConnection(options);
  const retained = await refreshSpotifyConnection(options);

  assert.equal(rotated.kind, "success");
  if (rotated.kind === "success") {
    assert.equal(rotated.accessToken.toMemoryValue(), "first-access-token");
    assert.equal(rotated.expiresIn.toMilliseconds(), 3_600_000);
  }
  assert.equal(retained.kind, "success");
  if (retained.kind === "success") {
    assert.equal(retained.accessToken.toMemoryValue(), "second-access-token");
    assert.equal(retained.expiresIn.toMilliseconds(), 1_800_000);
  }
  assert.equal(await storedRefreshToken(storage), "rotated-refresh-token");
  assert.deepEqual(storage.persistedValues, [
    "initial-refresh-token",
    "rotated-refresh-token",
  ]);
  assert.deepEqual(
    fetch.requests.map((request) =>
      new URLSearchParams(request.body).get("refresh_token"),
    ),
    ["initial-refresh-token", "rotated-refresh-token"],
  );
  assert.deepEqual(
    fetch.requests.map((request) =>
      new URLSearchParams(request.body).get("client_id"),
    ),
    ["browser-client-id", "browser-client-id"],
  );
});

test("invalid_grant deletes the stored refresh token and requires authorization", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  await seedRefreshToken(storage, "stored-refresh-token");
  const fetch = new FakeSpotifyAuthFetch([
    jsonFetchResponse(400, {
      error: "invalid_grant",
    }),
  ]);

  const result = await refreshSpotifyConnection({
    configuration: browserConfiguration(),
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "authorization-required",
    reason: "invalid-credentials",
  });
  await assertMissingRefreshToken(storage);
});

test("transient token failures retain the stored refresh token", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  await seedRefreshToken(storage, "stored-refresh-token");
  const fetch = new FakeSpotifyAuthFetch([networkFailure()]);

  const result = await refreshSpotifyConnection({
    configuration: browserConfiguration(),
    fetch,
    signal: new AbortController().signal,
    storage,
  });

  assert.deepEqual(result, {
    kind: "transient-failure",
  });
  assert.equal(await storedRefreshToken(storage), "stored-refresh-token");
});

test("logout clears pending authorization attempts and the refresh token in one storage operation", async () => {
  const storage = new InMemorySpotifyAuthStorage();
  const clock = clockFixture(1_000_000);
  await beginAuthorization(storage, clock.clock);
  await seedRefreshToken(storage, "stored-refresh-token");

  const result = await logoutSpotifyAuthorization(storage);

  assert.deepEqual(result, {
    kind: "logged-out",
  });
  assert.equal(storage.pendingAttemptCount, 0);
  assert.equal(storage.clearOperationCount, 1);
  await assertMissingRefreshToken(storage);
});

class InMemorySpotifyAuthStorage implements SpotifyAuthStoragePort {
  private pendingAttempts: ReadonlyArray<PendingAuthorizationAttempt> = [];
  private storedRefreshToken: StoredRefreshToken = Object.freeze({
    kind: "empty",
  });
  private storedValues: Array<string> = [];
  private clearOperations = 0;

  get pendingAttemptCount(): number {
    return this.pendingAttempts.length;
  }

  get persistedValues(): ReadonlyArray<string> {
    return Object.freeze([...this.storedValues]);
  }

  get clearOperationCount(): number {
    return this.clearOperations;
  }

  async savePendingAuthorizationAttempt(
    attempt: PendingAuthorizationAttempt,
  ): Promise<void> {
    const remainingAttempts = this.pendingAttempts.filter(
      (existing) =>
        existing.state.toStorageValue() !== attempt.state.toStorageValue(),
    );
    this.pendingAttempts = Object.freeze([...remainingAttempts, attempt]);
    this.storedValues.push(
      attempt.state.toStorageValue(),
      attempt.verifier.toStorageValue(),
    );
  }

  async consumePendingAuthorizationAttempt(
    options: SpotifyPendingAuthorizationAttemptConsumeOptions,
  ): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
    const attempt = this.pendingAttempts.find((pending) =>
      matchesPendingAuthorizationAttemptState({
        pending,
        candidate: options.state,
      }),
    );
    if (attempt === undefined) {
      return frozenRejectedPendingAttempt("missing-attempt");
    }

    this.pendingAttempts = Object.freeze(
      this.pendingAttempts.filter((pending) => pending !== attempt),
    );
    if (
      isPendingAuthorizationAttemptExpired({
        pending: attempt,
        observedAt: options.observedAt,
      })
    ) {
      return frozenRejectedPendingAttempt("expired");
    }

    return frozenConsumedPendingAttempt(attempt);
  }

  async readSpotifyRefreshToken(): Promise<SpotifyRefreshTokenReadResult> {
    if (this.storedRefreshToken.kind === "empty") {
      return Object.freeze({ kind: "missing" });
    }

    return Object.freeze({
      kind: "found",
      refreshToken: this.storedRefreshToken.refreshToken,
    });
  }

  async saveSpotifyRefreshToken(
    refreshToken: SpotifyRefreshToken,
  ): Promise<void> {
    this.storedRefreshToken = Object.freeze({
      kind: "stored",
      refreshToken,
    });
    this.storedValues.push(refreshToken.toStorageValue());
  }

  async deleteSpotifyRefreshToken(): Promise<void> {
    this.storedRefreshToken = Object.freeze({ kind: "empty" });
  }

  async clearSpotifyAuthorization(): Promise<void> {
    this.pendingAttempts = Object.freeze([]);
    this.storedRefreshToken = Object.freeze({ kind: "empty" });
    this.clearOperations += 1;
  }
}

class FakeSpotifyAuthFetch implements SpotifyAuthFetchPort {
  private queuedResults: Array<SpotifyAuthFetchResult>;
  private observedRequests: Array<SpotifyAuthFetchRequest> = [];

  constructor(results: ReadonlyArray<SpotifyAuthFetchResult>) {
    this.queuedResults = [...results];
  }

  get requestCount(): number {
    return this.observedRequests.length;
  }

  get requests(): ReadonlyArray<SpotifyAuthFetchRequest> {
    return Object.freeze([...this.observedRequests]);
  }

  async fetch(
    request: SpotifyAuthFetchRequest,
  ): Promise<SpotifyAuthFetchResult> {
    this.observedRequests.push(request);
    const result = this.queuedResults.shift();
    if (result === undefined) {
      throw new Error("Unexpected Spotify token request.");
    }

    return result;
  }
}

async function beginAuthorization(
  storage: SpotifyAuthStoragePort,
  clock: BrowserAuthClockPort,
): Promise<BegunAuthorization> {
  const redirect = await beginSpotifyAuthorization({
    configuration: browserConfiguration(),
    crypto: deterministicCrypto(),
    clock,
    storage,
    returnTo: displayReturnConfiguration(),
  });
  const state = new URL(redirect.url).searchParams.get("state");
  if (state === null) {
    throw new Error("Expected an authorization redirect with PKCE state.");
  }

  const begun: BegunAuthorization = {
    redirect,
    state,
  };

  return Object.freeze(begun);
}

function browserConfiguration(): SpotifyPublicConfiguration {
  const configuration = parseSpotifyPublicConfiguration(
    {
      spotify: {
        clientId: "browser-client-id",
        redirectUri: "https://nowplaying.example/spotify/",
      },
    },
    { applicationUrl },
  );
  if (configuration.kind === "failure") {
    throw new Error("Expected browser configuration to be valid.");
  }

  return configuration.value;
}

function callbackUrl(parameters: string): URL {
  return new URL(`https://nowplaying.example/spotify/?${parameters}`);
}

function clockFixture(initialEpochMilliseconds: number): ClockFixture {
  let epochMilliseconds = initialEpochMilliseconds;
  const fixture: ClockFixture = {
    clock: createBrowserAuthClockPort(() => epochMilliseconds),
    setEpochMilliseconds(value: number): void {
      epochMilliseconds = value;
    },
  };

  return Object.freeze(fixture);
}

function deterministicCrypto(): BrowserPkceCryptoPort {
  const crypto: BrowserPkceCryptoPort = {
    randomness: {
      fill(destination: Uint8Array): void {
        destination.fill(0);
      },
    },
    sha256: {
      async digest(source: Uint8Array): Promise<Uint8Array> {
        void source;
        return new Uint8Array(32);
      },
    },
  };

  return Object.freeze({
    randomness: Object.freeze(crypto.randomness),
    sha256: Object.freeze(crypto.sha256),
  });
}

function displayReturnConfiguration(): DisplayReturnConfiguration {
  const configuration = parseDisplayReturnConfiguration({
    width: 1_280,
    setup: true,
  });
  if (configuration.kind === "failure") {
    throw new Error("Expected display return configuration to be valid.");
  }

  return configuration.value;
}

function jsonFetchResponse(
  status: number,
  value: unknown,
): SpotifyAuthFetchResult {
  const response: SpotifyAuthFetchResponse = {
    status,
    async readJson(): Promise<SpotifyAuthJsonReadResult> {
      const result: SpotifyAuthJsonReadResult = {
        kind: "json",
        value,
      };

      return Object.freeze(result);
    },
  };

  return Object.freeze({
    kind: "response",
    response: Object.freeze(response),
  });
}

function networkFailure(): SpotifyAuthFetchResult {
  return Object.freeze({ kind: "network-failure" });
}

function onlyFetchRequest(
  fetch: FakeSpotifyAuthFetch,
): SpotifyAuthFetchRequest {
  const requests = fetch.requests;
  if (requests.length !== 1) {
    throw new Error("Expected exactly one Spotify token request.");
  }

  const request = requests[0];
  if (request === undefined) {
    throw new Error("Expected Spotify token request.");
  }

  return request;
}

async function seedRefreshToken(
  storage: SpotifyAuthStoragePort,
  value: string,
): Promise<void> {
  const parsed = SpotifyRefreshToken.parse(value);
  if (parsed.kind === "failure") {
    throw new Error("Expected test refresh token to be valid.");
  }

  await storage.saveSpotifyRefreshToken(parsed.value);
}

async function storedRefreshToken(
  storage: SpotifyAuthStoragePort,
): Promise<string> {
  const refreshToken = await storage.readSpotifyRefreshToken();
  if (refreshToken.kind === "missing") {
    throw new Error("Expected a stored Spotify refresh token.");
  }

  return refreshToken.refreshToken.toStorageValue();
}

async function assertMissingRefreshToken(
  storage: SpotifyAuthStoragePort,
): Promise<void> {
  const refreshToken = await storage.readSpotifyRefreshToken();
  assert.deepEqual(refreshToken, {
    kind: "missing",
  });
}

function frozenConsumedPendingAttempt(
  attempt: PendingAuthorizationAttempt,
): SpotifyPendingAuthorizationAttemptConsumeResult {
  return Object.freeze({
    kind: "consumed",
    attempt,
  });
}

function frozenRejectedPendingAttempt(
  reason: Extract<
    SpotifyPendingAuthorizationAttemptConsumeResult,
    { readonly kind: "rejected" }
  >["reason"],
): SpotifyPendingAuthorizationAttemptConsumeResult {
  return Object.freeze({
    kind: "rejected",
    reason,
  });
}
