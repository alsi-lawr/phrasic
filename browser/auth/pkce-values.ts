import { failed, succeeded, type Result } from "../../domain/result.ts";
import type { SpotifyPublicConfiguration } from "../config.ts";

type ValueParseResult<Value, Failure> = Result<Value, Failure>;
type ValueParseFailure<Failure> = Result<never, Failure>;

export const authorizationAttemptLifetimeMilliseconds = 10 * 60 * 1_000;
const sha256DigestByteLength = 32;
const minimumDisplayWidth = 320;
const maximumDisplayWidth = 7_680;
const maximumAuthorizationCodeLength = 4_096;
const pkceVerifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/;
const pkceStatePattern = /^[A-Za-z0-9_-]{43}$/;

export type PkceValueParseFailure =
  | {
      readonly kind: "invalid-pkce-value";
      readonly value: "pkce-state";
      readonly code: "expected-pkce-state";
    }
  | {
      readonly kind: "invalid-pkce-value";
      readonly value: "pkce-verifier";
      readonly code: "expected-pkce-verifier";
    };

export type AuthorizationAttemptTimestampParseFailure = {
  readonly kind: "invalid-authorization-attempt-timestamp";
  readonly code: "expected-non-negative-safe-integer";
};

export type DisplayReturnConfigurationParseFailure = {
  readonly kind: "invalid-display-return-configuration";
  readonly path: "$" | "$.setup" | "$.width";
  readonly code:
    | "expected-boolean"
    | "expected-data-property"
    | "expected-integer"
    | "expected-object"
    | "missing-value"
    | "unexpected-field"
    | "width-out-of-range";
};

export type PkceRandomnessPort = {
  readonly fill: (destination: Uint8Array<ArrayBuffer>) => void;
};

export type PkceSha256Port = {
  readonly digest: (source: Uint8Array) => Promise<Uint8Array>;
};

export type BrowserPkceCryptoPort = {
  readonly randomness: PkceRandomnessPort;
  readonly sha256: PkceSha256Port;
};

export class PkceVerifier {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<PkceVerifier, PkceValueParseFailure> {
    if (typeof input !== "string" || !pkceVerifierPattern.test(input)) {
      return failedPkceValue("pkce-verifier");
    }

    return succeeded(new PkceVerifier(input));
  }

  toChallengeSource(): string {
    return this.value;
  }

  toStorageValue(): string {
    return this.value;
  }
}

export class PkceState {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<PkceState, PkceValueParseFailure> {
    if (typeof input !== "string" || !pkceStatePattern.test(input)) {
      return failedPkceValue("pkce-state");
    }

    return succeeded(new PkceState(input));
  }

  toAuthorizationParameter(): string {
    return this.value;
  }

  toStorageValue(): string {
    return this.value;
  }
}

export class PkceStateCandidate {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<PkceStateCandidate, PkceValueParseFailure> {
    if (typeof input !== "string" || !pkceStatePattern.test(input)) {
      return failedPkceValue("pkce-state");
    }

    return succeeded(new PkceStateCandidate(input));
  }

  toStorageKey(): string {
    return this.value;
  }
}

export class PkceChallenge {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static fromSha256Digest(digest: Uint8Array): PkceChallenge {
    if (digest.byteLength !== sha256DigestByteLength) {
      throw new Error("PKCE SHA-256 did not return a 32-byte digest.");
    }

    return new PkceChallenge(encodeBase64Url(digest));
  }

  toAuthorizationParameter(): string {
    return this.value;
  }
}

export class AuthorizationAttemptTimestamp {
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<
    AuthorizationAttemptTimestamp,
    AuthorizationAttemptTimestampParseFailure
  > {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < 0
    ) {
      return failedTimestamp();
    }

    return succeeded(new AuthorizationAttemptTimestamp(input));
  }

  toEpochMilliseconds(): number {
    return this.value;
  }
}

export class DisplayWidth {
  private readonly value: number;

  private constructor(value: number) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<DisplayWidth, DisplayReturnConfigurationParseFailure> {
    if (typeof input !== "number" || !Number.isInteger(input)) {
      return failed(
        displayReturnConfigurationFailure("$.width", "expected-integer"),
      );
    }

    if (input < minimumDisplayWidth || input > maximumDisplayWidth) {
      return failed(
        displayReturnConfigurationFailure("$.width", "width-out-of-range"),
      );
    }

    return succeeded(new DisplayWidth(input));
  }

  toQueryParameter(): string {
    return `${this.value}`;
  }
}

export type DisplaySetupMode =
  | {
      readonly kind: "setup-not-requested";
    }
  | {
      readonly kind: "setup-requested";
    };

export type DisplayReturnConfiguration = {
  readonly width: DisplayWidth;
  readonly setup: DisplaySetupMode;
};

export class PendingAuthorizationAttempt {
  private readonly pendingState: PkceState;
  private readonly pendingVerifier: PkceVerifier;
  private readonly pendingCreatedAt: AuthorizationAttemptTimestamp;
  private readonly pendingExpiresAt: AuthorizationAttemptTimestamp;
  private readonly pendingReturnTo: DisplayReturnConfiguration;

  private constructor(options: PendingAuthorizationAttemptProperties) {
    this.pendingState = options.state;
    this.pendingVerifier = options.verifier;
    this.pendingCreatedAt = options.createdAt;
    this.pendingExpiresAt = options.expiresAt;
    this.pendingReturnTo = options.returnTo;
  }

  static create(
    options: PendingAuthorizationAttemptOptions,
  ): PendingAuthorizationAttempt {
    return new PendingAuthorizationAttempt({
      ...options,
      expiresAt: expirationFor(options.createdAt),
    });
  }

  get state(): PkceState {
    return this.pendingState;
  }

  get verifier(): PkceVerifier {
    return this.pendingVerifier;
  }

  get createdAt(): AuthorizationAttemptTimestamp {
    return this.pendingCreatedAt;
  }

  get expiresAt(): AuthorizationAttemptTimestamp {
    return this.pendingExpiresAt;
  }

  get returnTo(): DisplayReturnConfiguration {
    return this.pendingReturnTo;
  }
}

export type PendingAuthorizationAttemptOptions = {
  readonly state: PkceState;
  readonly verifier: PkceVerifier;
  readonly createdAt: AuthorizationAttemptTimestamp;
  readonly returnTo: DisplayReturnConfiguration;
};

type PendingAuthorizationAttemptProperties =
  PendingAuthorizationAttemptOptions & {
    readonly expiresAt: AuthorizationAttemptTimestamp;
  };

export type PkceAuthorizationAttempt = {
  readonly pending: PendingAuthorizationAttempt;
  readonly challenge: PkceChallenge;
};

export type PkceAuthorizationAttemptOptions = {
  readonly crypto: BrowserPkceCryptoPort;
  readonly createdAt: AuthorizationAttemptTimestamp;
  readonly returnTo: DisplayReturnConfiguration;
};

export type SpotifyAuthorizationUrlOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly attempt: PkceAuthorizationAttempt;
};

export type QueryStrippedDisplayReturnUrlOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly returnTo: DisplayReturnConfiguration;
};

export class SpotifyAuthorizationCode {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static parse(
    input: unknown,
  ): ValueParseResult<
    SpotifyAuthorizationCode,
    SpotifyAuthorizationCodeParseFailure
  > {
    if (
      typeof input !== "string" ||
      input.trim().length === 0 ||
      input.length > maximumAuthorizationCodeLength
    ) {
      return failedAuthorizationCode();
    }

    return succeeded(new SpotifyAuthorizationCode(input));
  }

  toTokenExchangeParameter(): string {
    return this.value;
  }
}

export type SpotifyAuthorizationCodeParseFailure = {
  readonly kind: "invalid-spotify-authorization-code";
  readonly code: "expected-non-empty-code";
};

function expirationFor(
  createdAt: AuthorizationAttemptTimestamp,
): AuthorizationAttemptTimestamp {
  const expiresAt =
    createdAt.toEpochMilliseconds() + authorizationAttemptLifetimeMilliseconds;
  const parsedExpiresAt = AuthorizationAttemptTimestamp.parse(expiresAt);
  if (parsedExpiresAt.kind === "failure") {
    throw new Error(
      "PKCE authorization attempt expiry is outside the valid range.",
    );
  }

  return parsedExpiresAt.value;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function failedPkceValue(
  value: PkceValueParseFailure["value"],
): ValueParseFailure<PkceValueParseFailure> {
  if (value === "pkce-state") {
    return failed({
      kind: "invalid-pkce-value",
      value,
      code: "expected-pkce-state",
    });
  }

  return failed({
    kind: "invalid-pkce-value",
    value,
    code: "expected-pkce-verifier",
  });
}

function failedTimestamp(): ValueParseFailure<AuthorizationAttemptTimestampParseFailure> {
  const error: AuthorizationAttemptTimestampParseFailure = {
    kind: "invalid-authorization-attempt-timestamp",
    code: "expected-non-negative-safe-integer",
  };

  return failed(error);
}

export function displayReturnConfigurationFailure(
  path: DisplayReturnConfigurationParseFailure["path"],
  code: DisplayReturnConfigurationParseFailure["code"],
): DisplayReturnConfigurationParseFailure {
  const error: DisplayReturnConfigurationParseFailure = {
    kind: "invalid-display-return-configuration",
    path,
    code,
  };

  return error;
}

function failedAuthorizationCode(): ValueParseFailure<SpotifyAuthorizationCodeParseFailure> {
  const error: SpotifyAuthorizationCodeParseFailure = {
    kind: "invalid-spotify-authorization-code",
    code: "expected-non-empty-code",
  };

  return failed(error);
}
