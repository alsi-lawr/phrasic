import type { SpotifyPublicConfiguration } from "../config.ts";

type ValueParseSuccess<Value> = {
  readonly kind: "success";
  readonly value: Value;
};

type ValueParseFailure<Failure> = {
  readonly kind: "failure";
  readonly error: Failure;
};

type ValueParseResult<Value, Failure> =
  ValueParseSuccess<Value> | ValueParseFailure<Failure>;

export const authorizationAttemptLifetimeMilliseconds = 10 * 60 * 1_000;
const pkceStateByteLength = 32;
const pkceVerifierByteLength = 64;
const sha256DigestByteLength = 32;
const minimumDisplayWidth = 320;
const maximumDisplayWidth = 7_680;
const maximumAuthorizationCodeLength = 4_096;
const pkceVerifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/;
const pkceStatePattern = /^[A-Za-z0-9_-]{43}$/;
const spotifyAuthorizeEndpoint = "https://accounts.spotify.com/authorize";
const spotifyCurrentlyPlayingScope = "user-read-currently-playing";

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
  readonly fill: (destination: Uint8Array) => void;
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
    Object.freeze(this);
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
    Object.freeze(this);
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
    Object.freeze(this);
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
    Object.freeze(this);
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
    Object.freeze(this);
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
    Object.freeze(this);
  }

  static parse(
    input: unknown,
  ): ValueParseResult<DisplayWidth, DisplayReturnConfigurationParseFailure> {
    if (typeof input !== "number" || !Number.isInteger(input)) {
      return failedDisplayConfiguration("$.width", "expected-integer");
    }

    if (input < minimumDisplayWidth || input > maximumDisplayWidth) {
      return failedDisplayConfiguration("$.width", "width-out-of-range");
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
    Object.freeze(this);
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
    Object.freeze(this);
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
  const randomness: PkceRandomnessPort = Object.freeze({
    fill(destination: Uint8Array): void {
      webCrypto.getRandomValues(destination);
    },
  });
  const sha256: PkceSha256Port = Object.freeze({
    async digest(source: Uint8Array): Promise<Uint8Array> {
      const browserDigestSource = new Uint8Array(source);
      const digest = await webCrypto.subtle.digest(
        "SHA-256",
        browserDigestSource,
      );
      return new Uint8Array(digest);
    },
  });

  return Object.freeze({ randomness, sha256 });
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

  return Object.freeze(attempt);
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
): ValueParseResult<
  DisplayReturnConfiguration,
  DisplayReturnConfigurationParseFailure
> {
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
    return failedDisplayConfiguration("$.setup", "expected-boolean");
  }

  const setup = setupValue.value
    ? requestedDisplaySetupMode()
    : notRequestedDisplaySetupMode();
  const configuration: DisplayReturnConfiguration = Object.freeze({
    width: width.value,
    setup,
  });

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

    return Object.freeze(denied);
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

  return Object.freeze(success);
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

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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
): ValueParseResult<object, DisplayReturnConfigurationParseFailure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failedDisplayConfiguration(path, "expected-object");
  }

  return succeeded(input);
}

function rejectUnexpectedDisplayConfigurationFields(
  source: object,
): ValueParseResult<object, DisplayReturnConfigurationParseFailure> {
  const allowedFields: ReadonlyArray<string> = ["setup", "width"];
  const fields = Object.getOwnPropertyNames(source);
  for (const field of fields) {
    if (!allowedFields.includes(field)) {
      return failedDisplayConfiguration("$", "unexpected-field");
    }
  }

  if (Object.getOwnPropertySymbols(source).length > 0) {
    return failedDisplayConfiguration("$", "unexpected-field");
  }

  return succeeded(source);
}

function readDisplayConfigurationProperty(
  source: object,
  fieldName: string,
  path: "$.setup" | "$.width",
): ValueParseResult<unknown, DisplayReturnConfigurationParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failedDisplayConfiguration(path, "missing-value");
  }

  if (!("value" in descriptor)) {
    return failedDisplayConfiguration(path, "expected-data-property");
  }

  return succeeded(descriptor.value);
}

function requestedDisplaySetupMode(): DisplaySetupMode {
  const setup: DisplaySetupMode = {
    kind: "setup-requested",
  };

  return Object.freeze(setup);
}

function notRequestedDisplaySetupMode(): DisplaySetupMode {
  const setup: DisplaySetupMode = {
    kind: "setup-not-requested",
  };

  return Object.freeze(setup);
}

function parseCallbackStateCandidate(
  parameters: URLSearchParams,
): CallbackStateCandidateOutcome {
  const values = parameters.getAll("state");
  if (values.length === 0) {
    return frozenCallbackStateOutcome({ kind: "missing-state" });
  }

  if (values.length !== 1) {
    return frozenCallbackStateOutcome({ kind: "malformed-state" });
  }

  const candidate = PkceStateCandidate.parse(values[0]);
  if (candidate.kind === "failure") {
    return frozenCallbackStateOutcome({ kind: "malformed-state" });
  }

  return frozenCallbackStateOutcome({
    kind: "state-candidate",
    value: candidate.value,
  });
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

  return Object.freeze(callback);
}

function failedPkceValue(
  value: PkceValueParseFailure["value"],
): ValueParseFailure<PkceValueParseFailure> {
  if (value === "pkce-state") {
    return failed(
      Object.freeze({
        kind: "invalid-pkce-value",
        value,
        code: "expected-pkce-state",
      }),
    );
  }

  return failed(
    Object.freeze({
      kind: "invalid-pkce-value",
      value,
      code: "expected-pkce-verifier",
    }),
  );
}

function failedTimestamp(): ValueParseFailure<AuthorizationAttemptTimestampParseFailure> {
  const error: AuthorizationAttemptTimestampParseFailure = {
    kind: "invalid-authorization-attempt-timestamp",
    code: "expected-non-negative-safe-integer",
  };

  return failed(Object.freeze(error));
}

function failedDisplayConfiguration(
  path: DisplayReturnConfigurationParseFailure["path"],
  code: DisplayReturnConfigurationParseFailure["code"],
): ValueParseFailure<DisplayReturnConfigurationParseFailure> {
  const error: DisplayReturnConfigurationParseFailure = {
    kind: "invalid-display-return-configuration",
    path,
    code,
  };

  return failed(Object.freeze(error));
}

function failedAuthorizationCode(): ValueParseFailure<SpotifyAuthorizationCodeParseFailure> {
  const error: SpotifyAuthorizationCodeParseFailure = {
    kind: "invalid-spotify-authorization-code",
    code: "expected-non-empty-code",
  };

  return failed(Object.freeze(error));
}

function frozenCallbackStateOutcome(
  outcome: CallbackStateCandidateOutcome,
): CallbackStateCandidateOutcome {
  return Object.freeze(outcome);
}

function succeeded<Value>(value: Value): ValueParseSuccess<Value> {
  const result: ValueParseSuccess<Value> = {
    kind: "success",
    value,
  };

  return Object.freeze(result);
}

function failed<Failure>(error: Failure): ValueParseFailure<Failure> {
  const result: ValueParseFailure<Failure> = {
    kind: "failure",
    error,
  };

  return Object.freeze(result);
}
