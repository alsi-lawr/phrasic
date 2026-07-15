import type { SpotifyPublicConfiguration } from "../config.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import {
  AuthorizationAttemptTimestamp,
  displayReturnConfigurationFailure,
  DisplayWidth,
  encodeBase64Url,
  PendingAuthorizationAttempt,
  PkceChallenge,
  PkceState,
  PkceStateCandidate,
  PkceVerifier,
  SpotifyAuthorizationCode,
  type DisplayReturnConfiguration,
  type DisplayReturnConfigurationParseFailure,
  type DisplaySetupMode,
  type BrowserPkceCryptoPort,
  type PkceAuthorizationAttempt,
  type PkceAuthorizationAttemptOptions,
  type PkceRandomnessPort,
  type PkceSha256Port,
  type QueryStrippedDisplayReturnUrlOptions,
  type SpotifyAuthorizationUrlOptions,
} from "./pkce-values.ts";

const pkceStateByteLength = 32;
const pkceVerifierByteLength = 64;
const spotifyAuthorizeEndpoint = "https://accounts.spotify.com/authorize";
const spotifyCurrentlyPlayingScope = "user-read-currently-playing";

export type CallbackStateCandidateOutcome =
  | {
      readonly kind: "malformed-state";
    }
  | {
      readonly kind: "missing-state";
    }
  | {
      readonly kind: "state-candidate";
      readonly value: PkceStateCandidate;
    };

export type SpotifyAuthorizationCallback =
  | {
      readonly kind: "denied";
      readonly state: CallbackStateCandidateOutcome;
    }
  | {
      readonly kind: "malformed";
      readonly state: CallbackStateCandidateOutcome;
      readonly code:
        | "duplicate-query-parameter"
        | "invalid-callback-location"
        | "invalid-code"
        | "invalid-provider-error"
        | "invalid-state"
        | "mixed-response"
        | "missing-response"
        | "unexpected-query-parameter";
    }
  | {
      readonly kind: "success";
      readonly code: SpotifyAuthorizationCode;
      readonly state: PkceStateCandidate;
    };

export type SpotifyAuthorizationCallbackOptions = {
  readonly configuration: SpotifyPublicConfiguration;
  readonly callbackUrl: URL;
};

export function createBrowserPkceCryptoPort(
  webCrypto: Crypto,
): BrowserPkceCryptoPort {
  const randomness: PkceRandomnessPort = {
    fill(destination: Uint8Array<ArrayBuffer>): void {
      webCrypto.getRandomValues(destination);
    },
  };
  const sha256: PkceSha256Port = {
    async digest(source: Uint8Array): Promise<Uint8Array> {
      const browserDigestSource = new Uint8Array(source);
      const digest = await webCrypto.subtle.digest(
        "SHA-256",
        browserDigestSource,
      );
      return new Uint8Array(digest);
    },
  };

  return { randomness, sha256 };
}

export async function createPkceAuthorizationAttempt(
  options: PkceAuthorizationAttemptOptions,
): Promise<PkceAuthorizationAttempt> {
  const verifier = generatePkceVerifier(options.crypto.randomness);
  const state = generatePkceState(options.crypto.randomness);
  const challenge = await derivePkceChallenge({
    verifier,
    sha256: options.crypto.sha256,
  });
  const pending = PendingAuthorizationAttempt.create({
    state,
    verifier,
    createdAt: options.createdAt,
    returnTo: options.returnTo,
  });
  const attempt: PkceAuthorizationAttempt = {
    pending,
    challenge,
  };

  return attempt;
}

async function derivePkceChallenge(options: {
  readonly verifier: PkceVerifier;
  readonly sha256: PkceSha256Port;
}): Promise<PkceChallenge> {
  const source = new TextEncoder().encode(options.verifier.toChallengeSource());
  const digest = await options.sha256.digest(new Uint8Array(source));

  return PkceChallenge.fromSha256Digest(digest);
}

export function isPendingAuthorizationAttemptExpired(options: {
  readonly pending: PendingAuthorizationAttempt;
  readonly observedAt: AuthorizationAttemptTimestamp;
}): boolean {
  return (
    options.observedAt.toEpochMilliseconds() >=
    options.pending.expiresAt.toEpochMilliseconds()
  );
}

export function matchesPendingAuthorizationAttemptState(options: {
  readonly pending: PendingAuthorizationAttempt;
  readonly candidate: PkceStateCandidate;
}): boolean {
  const expected = options.pending.state.toStorageValue();
  const candidate = options.candidate.toStorageKey();

  if (expected.length !== candidate.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
  }

  return difference === 0;
}

export function buildSpotifyAuthorizationUrl(
  options: SpotifyAuthorizationUrlOptions,
): string {
  const authorizationUrl = new URL(spotifyAuthorizeEndpoint);
  const parameters = authorizationUrl.searchParams;

  parameters.set(
    "client_id",
    options.configuration.spotify.clientId.toAuthorizationParameter(),
  );
  parameters.set("response_type", "code");
  parameters.set(
    "redirect_uri",
    options.configuration.spotify.redirectUri.toAuthorizationParameter(),
  );
  parameters.set("code_challenge_method", "S256");
  parameters.set(
    "code_challenge",
    options.attempt.challenge.toAuthorizationParameter(),
  );
  parameters.set(
    "state",
    options.attempt.pending.state.toAuthorizationParameter(),
  );
  parameters.set("scope", spotifyCurrentlyPlayingScope);

  return authorizationUrl.toString();
}

export function buildQueryStrippedDisplayReturnUrl(
  options: QueryStrippedDisplayReturnUrlOptions,
): string {
  const displayUrl = new URL(
    options.configuration.spotify.redirectUri.toAuthorizationParameter(),
  );
  displayUrl.searchParams.set(
    "width",
    options.returnTo.width.toQueryParameter(),
  );
  appendSetupParameter(displayUrl.searchParams, options.returnTo.setup);

  return displayUrl.toString();
}

export function parseDisplayReturnConfiguration(
  input: unknown,
): Result<DisplayReturnConfiguration, DisplayReturnConfigurationParseFailure> {
  const source = parseDisplayConfigurationObject(input, "$");
  if (source.kind === "failure") {
    return source;
  }

  const fields = rejectUnexpectedDisplayConfigurationFields(source.value);
  if (fields.kind === "failure") {
    return fields;
  }

  const widthValue = readDisplayConfigurationProperty(
    source.value,
    "width",
    "$.width",
  );
  if (widthValue.kind === "failure") {
    return widthValue;
  }

  const width = DisplayWidth.parse(widthValue.value);
  if (width.kind === "failure") {
    return width;
  }

  const setupValue = readDisplayConfigurationProperty(
    source.value,
    "setup",
    "$.setup",
  );
  if (setupValue.kind === "failure") {
    return setupValue;
  }

  if (typeof setupValue.value !== "boolean") {
    return failed(
      displayReturnConfigurationFailure("$.setup", "expected-boolean"),
    );
  }

  const setup = setupValue.value
    ? requestedDisplaySetupMode()
    : notRequestedDisplaySetupMode();
  const configuration: DisplayReturnConfiguration = {
    width: width.value,
    setup,
  };

  return succeeded(configuration);
}

export function parseSpotifyAuthorizationCallback(
  options: SpotifyAuthorizationCallbackOptions,
): SpotifyAuthorizationCallback {
  const state = parseCallbackStateCandidate(options.callbackUrl.searchParams);

  if (
    !options.configuration.spotify.redirectUri.matchesCallbackUrl(
      options.callbackUrl,
    )
  ) {
    return malformedCallback(state, "invalid-callback-location");
  }

  if (hasUnexpectedCallbackParameter(options.callbackUrl.searchParams)) {
    return malformedCallback(state, "unexpected-query-parameter");
  }

  if (hasRepeatedCallbackParameter(options.callbackUrl.searchParams)) {
    return malformedCallback(state, "duplicate-query-parameter");
  }

  const hasCode = options.callbackUrl.searchParams.has("code");
  const hasError = options.callbackUrl.searchParams.has("error");
  const hasErrorDetails =
    options.callbackUrl.searchParams.has("error_description") ||
    options.callbackUrl.searchParams.has("error_uri");

  if (hasCode && (hasError || hasErrorDetails)) {
    return malformedCallback(state, "mixed-response");
  }

  if (hasError) {
    const providerError = options.callbackUrl.searchParams.getAll("error")[0];
    if (providerError === undefined || providerError.trim().length === 0) {
      return malformedCallback(state, "invalid-provider-error");
    }

    const denied: SpotifyAuthorizationCallback = {
      kind: "denied",
      state,
    };

    return denied;
  }

  if (!hasCode) {
    return malformedCallback(state, "missing-response");
  }

  if (state.kind !== "state-candidate") {
    return malformedCallback(state, "invalid-state");
  }

  const codeValue = options.callbackUrl.searchParams.getAll("code")[0];
  if (codeValue === undefined) {
    return malformedCallback(state, "invalid-code");
  }

  const code = SpotifyAuthorizationCode.parse(codeValue);
  if (code.kind === "failure") {
    return malformedCallback(state, "invalid-code");
  }

  const success: SpotifyAuthorizationCallback = {
    kind: "success",
    code: code.value,
    state: state.value,
  };

  return success;
}

function generatePkceVerifier(randomness: PkceRandomnessPort): PkceVerifier {
  const encoded = generateRandomBase64Url(pkceVerifierByteLength, randomness);
  const verifier = PkceVerifier.parse(encoded);
  if (verifier.kind === "failure") {
    throw new Error("Generated an invalid PKCE verifier.");
  }

  return verifier.value;
}

function generatePkceState(randomness: PkceRandomnessPort): PkceState {
  const encoded = generateRandomBase64Url(pkceStateByteLength, randomness);
  const state = PkceState.parse(encoded);
  if (state.kind === "failure") {
    throw new Error("Generated an invalid PKCE state.");
  }

  return state.value;
}

function generateRandomBase64Url(
  byteLength: number,
  randomness: PkceRandomnessPort,
): string {
  const bytes = new Uint8Array(byteLength);
  randomness.fill(bytes);

  return encodeBase64Url(bytes);
}

function appendSetupParameter(
  parameters: URLSearchParams,
  setup: DisplaySetupMode,
): void {
  switch (setup.kind) {
    case "setup-not-requested":
      return;
    case "setup-requested":
      parameters.set("setup", "1");
      return;
  }

  const unhandledSetup: never = setup;
  throw new Error(`Unhandled display setup mode: ${unhandledSetup}`);
}

function parseDisplayConfigurationObject(
  input: unknown,
  path: "$",
): Result<object, DisplayReturnConfigurationParseFailure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(displayReturnConfigurationFailure(path, "expected-object"));
  }

  return succeeded(input);
}

function rejectUnexpectedDisplayConfigurationFields(
  source: object,
): Result<object, DisplayReturnConfigurationParseFailure> {
  const allowedFields: ReadonlyArray<string> = ["setup", "width"];
  const fields = Object.getOwnPropertyNames(source);
  for (const field of fields) {
    if (!allowedFields.includes(field)) {
      return failed(displayReturnConfigurationFailure("$", "unexpected-field"));
    }
  }

  if (Object.getOwnPropertySymbols(source).length > 0) {
    return failed(displayReturnConfigurationFailure("$", "unexpected-field"));
  }

  return succeeded(source);
}

function readDisplayConfigurationProperty(
  source: object,
  fieldName: string,
  path: "$.setup" | "$.width",
): Result<unknown, DisplayReturnConfigurationParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failed(displayReturnConfigurationFailure(path, "missing-value"));
  }

  if (!("value" in descriptor)) {
    return failed(
      displayReturnConfigurationFailure(path, "expected-data-property"),
    );
  }

  return succeeded(descriptor.value);
}

function requestedDisplaySetupMode(): DisplaySetupMode {
  const setup: DisplaySetupMode = {
    kind: "setup-requested",
  };

  return setup;
}

function notRequestedDisplaySetupMode(): DisplaySetupMode {
  const setup: DisplaySetupMode = {
    kind: "setup-not-requested",
  };

  return setup;
}

function parseCallbackStateCandidate(
  parameters: URLSearchParams,
): CallbackStateCandidateOutcome {
  const values = parameters.getAll("state");
  if (values.length === 0) {
    return { kind: "missing-state" };
  }

  if (values.length !== 1) {
    return { kind: "malformed-state" };
  }

  const candidate = PkceStateCandidate.parse(values[0]);
  if (candidate.kind === "failure") {
    return { kind: "malformed-state" };
  }

  return {
    kind: "state-candidate",
    value: candidate.value,
  };
}

function hasUnexpectedCallbackParameter(parameters: URLSearchParams): boolean {
  const allowedParameters: ReadonlyArray<string> = [
    "code",
    "error",
    "error_description",
    "error_uri",
    "state",
  ];

  let hasUnexpectedParameter = false;
  parameters.forEach((_value, parameter) => {
    if (!allowedParameters.includes(parameter)) {
      hasUnexpectedParameter = true;
    }
  });

  return hasUnexpectedParameter;
}

function hasRepeatedCallbackParameter(parameters: URLSearchParams): boolean {
  const callbackParameters: ReadonlyArray<string> = [
    "code",
    "error",
    "error_description",
    "error_uri",
    "state",
  ];

  for (const parameter of callbackParameters) {
    if (parameters.getAll(parameter).length > 1) {
      return true;
    }
  }

  return false;
}

function malformedCallback(
  state: CallbackStateCandidateOutcome,
  code: Extract<
    SpotifyAuthorizationCallback,
    { readonly kind: "malformed" }
  >["code"],
): SpotifyAuthorizationCallback {
  const callback: SpotifyAuthorizationCallback = {
    kind: "malformed",
    state,
    code,
  };

  return callback;
}
