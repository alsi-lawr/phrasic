import { failed, succeeded, type Result } from "./result.ts";

export type ValueValidationError = {
  readonly kind: "invalid-value";
  readonly value:
    | "display-text"
    | "original-artwork-url"
    | "playback-duration-milliseconds"
    | "playback-position-milliseconds"
    | "provider-collection-id"
    | "provider-id"
    | "provider-item-id"
    | "provider-link";
  readonly reason:
    | "empty-string"
    | "expected-non-negative-integer"
    | "expected-string"
    | "invalid-url";
};

declare const providerIdBrand: unique symbol;
declare const providerItemIdBrand: unique symbol;
declare const providerCollectionIdBrand: unique symbol;
declare const displayTextBrand: unique symbol;
declare const originalArtworkUrlBrand: unique symbol;
declare const playbackPositionMillisecondsBrand: unique symbol;
declare const playbackDurationMillisecondsBrand: unique symbol;

export type ProviderId = string & {
  readonly [providerIdBrand]: "ProviderId";
};
export type ProviderItemId = string & {
  readonly [providerItemIdBrand]: "ProviderItemId";
};
export type ProviderCollectionId = string & {
  readonly [providerCollectionIdBrand]: "ProviderCollectionId";
};
export type DisplayText = string & {
  readonly [displayTextBrand]: "DisplayText";
};
export type OriginalArtworkUrl = string & {
  readonly [originalArtworkUrlBrand]: "OriginalArtworkUrl";
};
export type PlaybackPositionMilliseconds = number & {
  readonly [playbackPositionMillisecondsBrand]: "PlaybackPositionMilliseconds";
};
export type PlaybackDurationMilliseconds = number & {
  readonly [playbackDurationMillisecondsBrand]: "PlaybackDurationMilliseconds";
};

export function parseProviderId(
  input: unknown,
): Result<ProviderId, ValueValidationError> {
  const result = validateNonEmptyString("provider-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderId);
}

export function parseProviderItemId(
  input: unknown,
): Result<ProviderItemId, ValueValidationError> {
  const result = validateNonEmptyString("provider-item-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderItemId);
}

export function parseProviderCollectionId(
  input: unknown,
): Result<ProviderCollectionId, ValueValidationError> {
  const result = validateNonEmptyString("provider-collection-id", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as ProviderCollectionId);
}

export const maximumPlatformTimerDelayMilliseconds = 2_147_483_647;

export function parsePlaybackPositionMilliseconds(
  input: unknown,
): Result<PlaybackPositionMilliseconds, ValueValidationError> {
  const result = validateNonNegativeInteger(
    "playback-position-milliseconds",
    input,
  );
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as PlaybackPositionMilliseconds);
}

export function parsePlaybackDurationMilliseconds(
  input: unknown,
): Result<PlaybackDurationMilliseconds, ValueValidationError> {
  const result = validateNonNegativeInteger(
    "playback-duration-milliseconds",
    input,
  );
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as PlaybackDurationMilliseconds);
}

export function parseDisplayText(
  input: unknown,
): Result<DisplayText, ValueValidationError> {
  const result = validateNonEmptyString("display-text", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as DisplayText);
}

export function parseOriginalArtworkUrl(
  input: unknown,
): Result<OriginalArtworkUrl, ValueValidationError> {
  const result = validateHttpUrl("original-artwork-url", input);
  if (result.kind === "failure") {
    return result;
  }

  return succeeded(result.value as OriginalArtworkUrl);
}

function validateNonEmptyString(
  value: ValueValidationError["value"],
  input: unknown,
): Result<string, ValueValidationError> {
  if (typeof input !== "string") {
    return failed(invalidValue(value, "expected-string"));
  }

  if (input.trim().length === 0) {
    return failed(invalidValue(value, "empty-string"));
  }

  return succeeded(input);
}

function validateNonNegativeInteger(
  value: ValueValidationError["value"],
  input: unknown,
): Result<number, ValueValidationError> {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 0) {
    return failed(invalidValue(value, "expected-non-negative-integer"));
  }

  return succeeded(input);
}

export function validateHttpUrl(
  value: ValueValidationError["value"],
  input: unknown,
): Result<string, ValueValidationError> {
  const text = validateNonEmptyString(value, input);
  if (text.kind === "failure") {
    return text;
  }

  try {
    const url = new URL(text.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return failed(invalidValue(value, "invalid-url"));
    }

    return succeeded(url.href);
  } catch {
    return failed(invalidValue(value, "invalid-url"));
  }
}

function invalidValue(
  value: ValueValidationError["value"],
  reason: ValueValidationError["reason"],
): ValueValidationError {
  const error: ValueValidationError = {
    kind: "invalid-value",
    value,
    reason,
  };
  return error;
}
