import {
  AuthorizationAttemptTimestamp,
  authorizationAttemptLifetimeMilliseconds,
  PendingAuthorizationAttempt,
  PkceState,
  PkceVerifier,
  type DisplayReturnConfiguration,
} from "./pkce-values.ts";
import { parseDisplayReturnConfiguration } from "./pkce.ts";
import { spotifyAuthorizationStorageProvider } from "./indexeddb-authorization.ts";
import { SpotifyRefreshToken } from "./spotify-token-values.ts";
import type { SpotifyPendingAuthorizationAttemptConsumeResult } from "./spotify-auth-storage-contract.ts";

type ParseSuccess<Value> = {
  readonly kind: "success";
  readonly value: Value;
};

type ParseFailure = {
  readonly kind: "failure";
};

type ParseResult<Value> = ParseSuccess<Value> | ParseFailure;

type StoredPendingAuthorizationAttempt = {
  readonly provider: "spotify";
  readonly state: string;
  readonly verifier: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly returnTo: {
    readonly width: number;
    readonly setup: boolean;
  };
};

type StoredSpotifyRefreshToken = {
  readonly provider: "spotify";
  readonly refreshToken: string;
};

export type ParsedStoredPendingAuthorizationAttempt =
  | {
      readonly kind: "success";
      readonly value: PendingAuthorizationAttempt;
    }
  | {
      readonly kind: "failure";
      readonly result: SpotifyPendingAuthorizationAttemptConsumeResult;
    };

export function storedPendingAuthorizationAttempt(
  attempt: PendingAuthorizationAttempt,
): StoredPendingAuthorizationAttempt {
  const returnTo = storedDisplayReturnConfiguration(attempt.returnTo);
  const record: StoredPendingAuthorizationAttempt = {
    provider: spotifyAuthorizationStorageProvider,
    state: attempt.state.toStorageValue(),
    verifier: attempt.verifier.toStorageValue(),
    createdAt: attempt.createdAt.toEpochMilliseconds(),
    expiresAt: attempt.expiresAt.toEpochMilliseconds(),
    returnTo,
  };

  return record;
}

function storedDisplayReturnConfiguration(
  returnTo: DisplayReturnConfiguration,
): StoredPendingAuthorizationAttempt["returnTo"] {
  const configuration: StoredPendingAuthorizationAttempt["returnTo"] = {
    width: Number(returnTo.width.toQueryParameter()),
    setup: returnTo.setup.kind === "setup-requested",
  };

  return configuration;
}

export function storedSpotifyRefreshToken(
  refreshToken: SpotifyRefreshToken,
): StoredSpotifyRefreshToken {
  const record: StoredSpotifyRefreshToken = {
    provider: spotifyAuthorizationStorageProvider,
    refreshToken: refreshToken.toStorageValue(),
  };

  return record;
}

export function parseStoredPendingAuthorizationAttempt(
  input: unknown,
): ParsedStoredPendingAuthorizationAttempt {
  const source = parseStoredObject(input);
  if (source.kind === "failure") {
    return invalidStoredPendingAttemptResult();
  }

  if (
    !hasOnlyOwnFields(source.value, [
      "createdAt",
      "expiresAt",
      "provider",
      "returnTo",
      "state",
      "verifier",
    ])
  ) {
    return invalidStoredPendingAttemptResult();
  }

  const provider = readStoredDataProperty(source.value, "provider");
  if (provider.kind === "failure") {
    return invalidStoredPendingAttemptResult();
  }

  if (provider.value !== spotifyAuthorizationStorageProvider) {
    return providerMismatchPendingAttemptResult();
  }

  const state = readStoredDataProperty(source.value, "state");
  const verifier = readStoredDataProperty(source.value, "verifier");
  const createdAt = readStoredDataProperty(source.value, "createdAt");
  const expiresAt = readStoredDataProperty(source.value, "expiresAt");
  const returnTo = readStoredDataProperty(source.value, "returnTo");
  if (
    state.kind === "failure" ||
    verifier.kind === "failure" ||
    createdAt.kind === "failure" ||
    expiresAt.kind === "failure" ||
    returnTo.kind === "failure"
  ) {
    return invalidStoredPendingAttemptResult();
  }

  const parsedState = PkceState.parse(state.value);
  const parsedVerifier = PkceVerifier.parse(verifier.value);
  const parsedCreatedAt = AuthorizationAttemptTimestamp.parse(createdAt.value);
  const parsedExpiresAt = AuthorizationAttemptTimestamp.parse(expiresAt.value);
  const parsedReturnTo = parseDisplayReturnConfiguration(returnTo.value);
  if (
    parsedState.kind === "failure" ||
    parsedVerifier.kind === "failure" ||
    parsedCreatedAt.kind === "failure" ||
    parsedExpiresAt.kind === "failure" ||
    parsedReturnTo.kind === "failure"
  ) {
    return invalidStoredPendingAttemptResult();
  }

  if (
    parsedCreatedAt.value.toEpochMilliseconds() >
    Number.MAX_SAFE_INTEGER - authorizationAttemptLifetimeMilliseconds
  ) {
    return invalidStoredPendingAttemptResult();
  }

  const attempt = PendingAuthorizationAttempt.create({
    state: parsedState.value,
    verifier: parsedVerifier.value,
    createdAt: parsedCreatedAt.value,
    returnTo: parsedReturnTo.value,
  });
  if (
    attempt.expiresAt.toEpochMilliseconds() !==
    parsedExpiresAt.value.toEpochMilliseconds()
  ) {
    return invalidStoredPendingAttemptResult();
  }

  const result: ParsedStoredPendingAuthorizationAttempt = {
    kind: "success",
    value: attempt,
  };

  return result;
}

export function parseStoredSpotifyRefreshToken(
  input: unknown,
): ParseResult<SpotifyRefreshToken> {
  const source = parseStoredObject(input);
  if (source.kind === "failure") {
    return parseFailure();
  }

  if (!hasOnlyOwnFields(source.value, ["provider", "refreshToken"])) {
    return parseFailure();
  }

  const provider = readStoredDataProperty(source.value, "provider");
  const refreshToken = readStoredDataProperty(source.value, "refreshToken");
  if (provider.kind === "failure" || refreshToken.kind === "failure") {
    return parseFailure();
  }

  if (provider.value !== spotifyAuthorizationStorageProvider) {
    return parseFailure();
  }

  const parsedRefreshToken = SpotifyRefreshToken.parse(refreshToken.value);
  if (parsedRefreshToken.kind === "failure") {
    return parseFailure();
  }

  return succeeded(parsedRefreshToken.value);
}

function parseStoredObject(input: unknown): ParseResult<object> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return parseFailure();
  }

  return succeeded(input);
}

function hasOnlyOwnFields(
  source: object,
  allowedFields: ReadonlyArray<string>,
): boolean {
  for (const fieldName of Object.getOwnPropertyNames(source)) {
    if (!allowedFields.includes(fieldName)) {
      return false;
    }
  }

  return Object.getOwnPropertySymbols(source).length === 0;
}

function readStoredDataProperty(
  source: object,
  fieldName: string,
): ParseResult<unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined || !("value" in descriptor)) {
    return parseFailure();
  }

  return succeeded(descriptor.value);
}

function invalidStoredPendingAttemptResult(): ParsedStoredPendingAuthorizationAttempt {
  return {
    kind: "failure",
    result: {
      kind: "rejected",
      reason: "invalid-stored-attempt",
    },
  };
}

function providerMismatchPendingAttemptResult(): ParsedStoredPendingAuthorizationAttempt {
  return {
    kind: "failure",
    result: {
      kind: "rejected",
      reason: "provider-mismatch",
    },
  };
}

function succeeded<Value>(value: Value): ParseSuccess<Value> {
  return { kind: "success", value };
}

function parseFailure(): ParseFailure {
  return { kind: "failure" };
}
