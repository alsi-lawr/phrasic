import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "../../../browser/config.ts";
import {
  AuthorizationAttemptTimestamp,
  PkceState,
  PkceStateCandidate,
  PkceVerifier,
  SpotifyAuthorizationCode,
  type BrowserPkceCryptoPort,
  type DisplayReturnConfiguration,
  type DisplayReturnConfigurationParseFailure,
} from "../../../browser/auth/pkce-values.ts";
import {
  buildQueryStrippedDisplayReturnUrl,
  buildSpotifyAuthorizationUrl,
  createBrowserPkceCryptoPort,
  createPkceAuthorizationAttempt,
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
  parseDisplayReturnConfiguration,
  parseSpotifyAuthorizationCallback,
  type SpotifyAuthorizationCallback,
} from "../../../browser/auth/pkce.ts";

type Result<Value, Failure> =
  | {
      readonly kind: "success";
      readonly value: Value;
    }
  | {
      readonly kind: "failure";
      readonly error: Failure;
    };

type MalformedCallback = Extract<
  SpotifyAuthorizationCallback,
  { readonly kind: "malformed" }
>;

type DeterministicCryptoFixture = {
  readonly crypto: BrowserPkceCryptoPort;
  readonly filledByteLengths: ReadonlyArray<number>;
  readonly digestSources: ReadonlyArray<Uint8Array>;
};

const applicationUrl = new URL("https://nowplaying.example/nowplaying");
const validState = "A".repeat(43);
const validVerifier = "A".repeat(86);

test("PKCE values reject malformed states, verifiers, timestamps, and codes", () => {
  assert.deepEqual(expectFailure(PkceVerifier.parse("A".repeat(42))), {
    kind: "invalid-pkce-value",
    value: "pkce-verifier",
    code: "expected-pkce-verifier",
  });
  assert.deepEqual(expectFailure(PkceState.parse("A".repeat(42))), {
    kind: "invalid-pkce-value",
    value: "pkce-state",
    code: "expected-pkce-state",
  });
  assert.deepEqual(
    expectFailure(PkceStateCandidate.parse(`${"A".repeat(42)}+`)),
    {
      kind: "invalid-pkce-value",
      value: "pkce-state",
      code: "expected-pkce-state",
    },
  );
  assert.deepEqual(expectFailure(AuthorizationAttemptTimestamp.parse(-1)), {
    kind: "invalid-authorization-attempt-timestamp",
    code: "expected-non-negative-safe-integer",
  });
  assert.deepEqual(expectFailure(SpotifyAuthorizationCode.parse(null)), {
    kind: "invalid-spotify-authorization-code",
    code: "expected-non-empty-code",
  });
  assert.deepEqual(
    expectFailure(SpotifyAuthorizationCode.parse("a".repeat(4_097))),
    {
      kind: "invalid-spotify-authorization-code",
      code: "expected-non-empty-code",
    },
  );
});

test("browser PKCE crypto ports adapt Web Crypto SHA-256", async () => {
  const crypto = createBrowserPkceCryptoPort(globalThis.crypto);
  const digest = await crypto.sha256.digest(new TextEncoder().encode("abc"));

  assert.deepEqual(
    Array.from(digest),
    [
      0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde,
      0x5d, 0xae, 0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c,
      0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
    ],
  );
});

test("display return configuration validates dimensions and rebuilds a clean return URL", () => {
  const requestedSetup = displayReturnConfiguration({
    width: 1_280,
    setup: true,
  });
  const noSetup = displayReturnConfiguration({ width: 320, setup: false });
  const configuration = browserConfiguration();

  assert.equal(requestedSetup.width.toQueryParameter(), "1280");
  assert.equal(requestedSetup.setup.kind, "setup-requested");
  assert.equal(
    buildQueryStrippedDisplayReturnUrl({
      configuration,
      returnTo: requestedSetup,
    }),
    "https://nowplaying.example/spotify/?width=1280&setup=1",
  );
  assert.equal(
    buildQueryStrippedDisplayReturnUrl({
      configuration,
      returnTo: noSetup,
    }),
    "https://nowplaying.example/spotify/?width=320",
  );

  const invalidConfigurations: ReadonlyArray<{
    readonly source: unknown;
    readonly expected: DisplayReturnConfigurationParseFailure;
  }> = [
    {
      source: null,
      expected: displayFailure("$", "expected-object"),
    },
    {
      source: { width: 319, setup: false },
      expected: displayFailure("$.width", "width-out-of-range"),
    },
    {
      source: { width: 7_681, setup: false },
      expected: displayFailure("$.width", "width-out-of-range"),
    },
    {
      source: { width: 640.5, setup: false },
      expected: displayFailure("$.width", "expected-integer"),
    },
    {
      source: { width: 640, setup: "true" },
      expected: displayFailure("$.setup", "expected-boolean"),
    },
    {
      source: { width: 640, setup: false, debug: true },
      expected: displayFailure("$", "unexpected-field"),
    },
  ];

  for (const invalidConfiguration of invalidConfigurations) {
    assert.deepEqual(
      expectFailure(
        parseDisplayReturnConfiguration(invalidConfiguration.source),
      ),
      invalidConfiguration.expected,
    );
  }
});

test("PKCE attempts use injected cryptography and expire ten minutes after creation", async () => {
  const fixture = deterministicCryptoFixture();
  const returnTo = displayReturnConfiguration({ width: 1_280, setup: true });
  const createdAt = timestamp(1_000_000);
  const attempt = await createPkceAuthorizationAttempt({
    crypto: fixture.crypto,
    createdAt,
    returnTo,
  });

  assert.deepEqual(fixture.filledByteLengths, [64, 32]);
  assert.equal(attempt.pending.verifier.toStorageValue(), validVerifier);
  assert.equal(attempt.pending.state.toStorageValue(), validState);
  assert.equal(attempt.challenge.toAuthorizationParameter(), validState);
  assert.equal(attempt.pending.createdAt.toEpochMilliseconds(), 1_000_000);
  assert.equal(attempt.pending.expiresAt.toEpochMilliseconds(), 1_600_000);
  assert.equal(attempt.pending.returnTo, returnTo);
  assert.deepEqual(
    fixture.digestSources[0],
    new TextEncoder().encode(validVerifier),
  );
  assert.equal(
    isPendingAuthorizationAttemptExpired({
      pending: attempt.pending,
      observedAt: timestamp(1_599_999),
    }),
    false,
  );
  assert.equal(
    isPendingAuthorizationAttemptExpired({
      pending: attempt.pending,
      observedAt: timestamp(1_600_000),
    }),
    true,
  );
  assert.equal(
    matchesPendingAuthorizationAttemptState({
      pending: attempt.pending,
      candidate: stateCandidate(validState),
    }),
    true,
  );
  assert.equal(
    matchesPendingAuthorizationAttemptState({
      pending: attempt.pending,
      candidate: stateCandidate("B".repeat(43)),
    }),
    false,
  );
});

test("Spotify authorization URLs carry the required PKCE parameters", async () => {
  const attempt = await createPkceAuthorizationAttempt({
    crypto: deterministicCryptoFixture().crypto,
    createdAt: timestamp(1_000_000),
    returnTo: displayReturnConfiguration({ width: 1_280, setup: true }),
  });
  const authorizationUrl = new URL(
    buildSpotifyAuthorizationUrl({
      configuration: browserConfiguration(),
      attempt,
    }),
  );

  assert.equal(authorizationUrl.origin, "https://accounts.spotify.com");
  assert.equal(authorizationUrl.pathname, "/authorize");
  assert.deepEqual(Array.from(authorizationUrl.searchParams.entries()), [
    ["client_id", "browser-client-id"],
    ["response_type", "code"],
    ["redirect_uri", "https://nowplaying.example/spotify/"],
    ["code_challenge_method", "S256"],
    ["code_challenge", validState],
    ["state", validState],
    ["scope", "user-read-currently-playing"],
  ]);
});

test("Spotify callback parsing distinguishes successful, denied, and malformed outcomes", () => {
  const configuration = browserConfiguration();
  const successful = parseSpotifyAuthorizationCallback({
    configuration,
    callbackUrl: callbackUrl(`code=authorization-code&state=${validState}`),
  });

  assert.equal(successful.kind, "success");
  if (successful.kind === "success") {
    assert.equal(
      successful.code.toTokenExchangeParameter(),
      "authorization-code",
    );
    assert.equal(successful.state.toStorageKey(), validState);
  }

  const denied = parseSpotifyAuthorizationCallback({
    configuration,
    callbackUrl: callbackUrl(
      `error=access_denied&error_description=declined&state=${validState}`,
    ),
  });

  assert.equal(denied.kind, "denied");
  if (denied.kind === "denied") {
    assert.equal(denied.state.kind, "state-candidate");
    if (denied.state.kind === "state-candidate") {
      assert.equal(denied.state.value.toStorageKey(), validState);
    }
  }

  const malformedScenarios: ReadonlyArray<{
    readonly callbackUrl: URL;
    readonly code: MalformedCallback["code"];
  }> = [
    {
      callbackUrl: new URL(
        `https://nowplaying.example/not-spotify/?code=authorization-code&state=${validState}`,
      ),
      code: "invalid-callback-location",
    },
    {
      callbackUrl: callbackUrl(
        `code=authorization-code&state=${validState}&debug=true`,
      ),
      code: "unexpected-query-parameter",
    },
    {
      callbackUrl: callbackUrl(
        `code=authorization-code&code=another-code&state=${validState}`,
      ),
      code: "duplicate-query-parameter",
    },
    {
      callbackUrl: callbackUrl(
        `code=authorization-code&error=access_denied&state=${validState}`,
      ),
      code: "mixed-response",
    },
    {
      callbackUrl: callbackUrl(`error=&state=${validState}`),
      code: "invalid-provider-error",
    },
    {
      callbackUrl: callbackUrl(`state=${validState}`),
      code: "missing-response",
    },
    {
      callbackUrl: callbackUrl("code=authorization-code"),
      code: "invalid-state",
    },
    {
      callbackUrl: callbackUrl(`code=&state=${validState}`),
      code: "invalid-code",
    },
  ];

  for (const scenario of malformedScenarios) {
    const malformed = expectMalformed(
      parseSpotifyAuthorizationCallback({
        configuration,
        callbackUrl: scenario.callbackUrl,
      }),
    );

    assert.equal(malformed.code, scenario.code);
  }

  const malformedState = expectMalformed(
    parseSpotifyAuthorizationCallback({
      configuration,
      callbackUrl: callbackUrl(
        "code=authorization-code&state=not-a-valid-state",
      ),
    }),
  );
  assert.equal(malformedState.code, "invalid-state");
  assert.equal(malformedState.state.kind, "malformed-state");
});

function browserConfiguration(): SpotifyPublicConfiguration {
  return expectSuccess(
    parseSpotifyPublicConfiguration(
      {
        spotify: {
          clientId: "browser-client-id",
          redirectUri: "https://nowplaying.example/spotify/",
        },
      },
      { applicationUrl },
    ),
  );
}

function callbackUrl(parameters: string): URL {
  return new URL(`https://nowplaying.example/spotify/?${parameters}`);
}

function deterministicCryptoFixture(): DeterministicCryptoFixture {
  const filledByteLengths: Array<number> = [];
  const digestSources: Array<Uint8Array> = [];
  const crypto: BrowserPkceCryptoPort = Object.freeze({
    randomness: Object.freeze({
      fill(destination: Uint8Array): void {
        filledByteLengths.push(destination.byteLength);
        destination.fill(0);
      },
    }),
    sha256: Object.freeze({
      async digest(source: Uint8Array): Promise<Uint8Array> {
        digestSources.push(new Uint8Array(source));
        return new Uint8Array(32);
      },
    }),
  });

  return Object.freeze({ crypto, filledByteLengths, digestSources });
}

function displayFailure(
  path: DisplayReturnConfigurationParseFailure["path"],
  code: DisplayReturnConfigurationParseFailure["code"],
): DisplayReturnConfigurationParseFailure {
  return {
    kind: "invalid-display-return-configuration",
    path,
    code,
  };
}

function displayReturnConfiguration(
  input: unknown,
): DisplayReturnConfiguration {
  return expectSuccess(parseDisplayReturnConfiguration(input));
}

function expectMalformed(
  callback: SpotifyAuthorizationCallback,
): MalformedCallback {
  if (callback.kind === "malformed") {
    return callback;
  }

  throw new Error("Expected a malformed Spotify authorization callback");
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful browser authorization parse");
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed browser authorization parse");
}

function stateCandidate(value: string): PkceStateCandidate {
  return expectSuccess(PkceStateCandidate.parse(value));
}

function timestamp(value: number): AuthorizationAttemptTimestamp {
  return expectSuccess(AuthorizationAttemptTimestamp.parse(value));
}
