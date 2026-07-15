import type { ItemConstructionError } from "../../domain/playback-item.ts";
import type { ValueValidationError } from "../../domain/playback-values.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import type {
  SpotifyPlaybackParseFailure,
  SpotifyPlaybackParseFailureCode,
  SpotifyPlaybackPayloadPath,
} from "./spotify-payload-contract.ts";

export type UnknownJsonObject = {
  readonly [key: string]: unknown;
};

export function parseObject(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<UnknownJsonObject, SpotifyPlaybackParseFailure> {
  if (!isUnknownJsonObject(input)) {
    return failed(parseFailure(path, "expected-object"));
  }

  return succeeded(input);
}

export function parseArray(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<ReadonlyArray<unknown>, SpotifyPlaybackParseFailure> {
  if (!isUnknownArray(input)) {
    return failed(parseFailure(path, "expected-array"));
  }

  return succeeded(input);
}

export function parseBoolean(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<boolean, SpotifyPlaybackParseFailure> {
  if (typeof input !== "boolean") {
    return failed(parseFailure(path, "expected-boolean"));
  }

  return succeeded(input);
}

export function parseNonEmptyString(
  input: unknown,
  path: SpotifyPlaybackPayloadPath,
): Result<string, SpotifyPlaybackParseFailure> {
  if (typeof input !== "string") {
    return failed(parseFailure(path, "expected-string"));
  }

  if (input.trim().length === 0) {
    return failed(parseFailure(path, "expected-non-empty-string"));
  }

  return succeeded(input);
}

export function readRequired(
  source: UnknownJsonObject,
  key: string,
  path: SpotifyPlaybackPayloadPath,
): Result<unknown, SpotifyPlaybackParseFailure> {
  if (!Object.hasOwn(source, key)) {
    return failed(parseFailure(path, "missing-value"));
  }

  return succeeded(source[key]);
}

export function mapValueValidation<Value>(
  result: Result<Value, ValueValidationError>,
  path: SpotifyPlaybackPayloadPath,
): Result<Value, SpotifyPlaybackParseFailure> {
  if (result.kind === "failure") {
    return failed(parseFailure(path, validationFailureCode(result.error)));
  }

  return succeeded(result.value);
}

export function mapItemConstruction<Value>(
  result: Result<Value, ItemConstructionError>,
  path: SpotifyPlaybackPayloadPath,
): Result<Value, SpotifyPlaybackParseFailure> {
  if (result.kind === "failure") {
    return failed(parseFailure(path, "invalid-domain-value"));
  }

  return succeeded(result.value);
}

function validationFailureCode(
  error: ValueValidationError,
): SpotifyPlaybackParseFailureCode {
  switch (error.reason) {
    case "empty-string":
      return "expected-non-empty-string";
    case "expected-non-negative-integer":
      return "expected-non-negative-integer";
    case "expected-string":
      return "expected-string";
    case "invalid-url":
      return "expected-http-url";
  }

  return assertNever(error.reason);
}

export function parseFailure(
  path: SpotifyPlaybackPayloadPath,
  code: SpotifyPlaybackParseFailureCode,
): SpotifyPlaybackParseFailure {
  const failure: SpotifyPlaybackParseFailure = {
    kind: "invalid-spotify-playback-payload",
    path,
    code,
  };
  return failure;
}

export function isUnknownJsonObject(
  input: unknown,
): input is UnknownJsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isUnknownArray(input: unknown): input is ReadonlyArray<unknown> {
  return Array.isArray(input);
}

function assertNever(value: never): never {
  throw new Error(
    `Unexpected Spotify payload validation variant: ${String(value)}`,
  );
}
