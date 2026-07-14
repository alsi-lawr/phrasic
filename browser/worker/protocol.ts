import {
  maximumPlatformTimerDelayMilliseconds,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";

export type PlaybackWorkerInitializeCommand = {
  readonly kind: "initialize";
  readonly applicationUrl: string;
  readonly configuration: unknown;
};

export type PlaybackWorkerBeginAuthorizationCommand = {
  readonly kind: "begin-authorization";
  readonly returnTo: unknown;
};

export type PlaybackWorkerConsumeCallbackCommand = {
  readonly kind: "consume-callback";
  readonly callbackUrl: string;
};

export type PlaybackWorkerRetryCommand = {
  readonly kind: "retry";
};

export type PlaybackWorkerVisibilityChangeCommand = {
  readonly kind: "visibility-change";
  readonly visibility: "hidden" | "visible";
};

export type PlaybackWorkerLogoutCommand = {
  readonly kind: "logout";
};

export type PlaybackWorkerDisposeCommand = {
  readonly kind: "dispose";
};

export type PlaybackWorkerCommand =
  | PlaybackWorkerBeginAuthorizationCommand
  | PlaybackWorkerConsumeCallbackCommand
  | PlaybackWorkerDisposeCommand
  | PlaybackWorkerInitializeCommand
  | PlaybackWorkerLogoutCommand
  | PlaybackWorkerRetryCommand
  | PlaybackWorkerVisibilityChangeCommand;

type WorkerProtocolParseCode =
  | "expected-data-property"
  | "expected-non-empty-string"
  | "expected-non-negative-safe-integer"
  | "expected-object"
  | "invalid-kind"
  | "invalid-value"
  | "missing-value"
  | "unexpected-field";

export type PlaybackWorkerCommandParseFailure = {
  readonly kind: "invalid-playback-worker-command";
  readonly code: WorkerProtocolParseCode;
};

export type PlaybackWorkerDiagnosticOperation =
  | "authorization"
  | "command"
  | "initialization"
  | "playback-poll"
  | "scheduler"
  | "storage"
  | "token-refresh";

export type PlaybackWorkerDiagnosticCode =
  | "authorization-denied"
  | "authorization-provider-failure"
  | "authorization-required"
  | "authorization-transient-failure"
  | "command-not-allowed"
  | "invalid-callback-url"
  | "invalid-command"
  | "invalid-display-return-configuration"
  | "invalid-public-configuration"
  | "invalid-retry-after"
  | "invalid-runtime-transition"
  | "playback-network-failure"
  | "playback-payload-invalid"
  | "playback-permission-denied"
  | "playback-rate-limited"
  | "playback-server-failure"
  | "playback-unauthorized"
  | "runtime-operation-failed"
  | "scheduler-failure"
  | "storage-failure"
  | "unexpected-playback-status"
  | "unsupported-playback-result";

export type PlaybackWorkerDiagnosticMetadata =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "http-status";
      readonly status: number;
    }
  | {
      readonly kind: "retry-after";
      readonly retryAfterMilliseconds: number;
    }
  | {
      readonly kind: "http-status-and-retry-after";
      readonly status: number;
      readonly retryAfterMilliseconds: number;
    };

export type PlaybackWorkerSafeDiagnostic = {
  readonly kind: "safe-diagnostic";
  readonly operation: PlaybackWorkerDiagnosticOperation;
  readonly code: PlaybackWorkerDiagnosticCode;
  readonly metadata: PlaybackWorkerDiagnosticMetadata;
};

export type PlaybackWorkerFatalInitializationFailure = {
  readonly kind: "fatal-initialization-failure";
  readonly code:
    | "browser-capability-unavailable"
    | "invalid-public-configuration"
    | "worker-initialization-failed";
};

export type PlaybackWorkerAuthorizationRedirect = {
  readonly kind: "authorization-redirect";
  readonly url: string;
};

export type PlaybackWorkerCallbackUrlRestored = {
  readonly kind: "callback-url-restored";
  readonly url: string;
};

export type PlaybackWorkerPlaybackState = {
  readonly kind: "playback-state";
  readonly state: PlaybackState;
};

export type PlaybackWorkerEvent =
  | PlaybackWorkerAuthorizationRedirect
  | PlaybackWorkerCallbackUrlRestored
  | PlaybackWorkerFatalInitializationFailure
  | PlaybackWorkerPlaybackState
  | PlaybackWorkerSafeDiagnostic;

const noDiagnosticMetadata: PlaybackWorkerDiagnosticMetadata = Object.freeze({
  kind: "none",
});

export function parsePlaybackWorkerCommand(
  input: unknown,
): Result<PlaybackWorkerCommand, PlaybackWorkerCommandParseFailure> {
  try {
    const source = parseObject(input, commandParseFailure);
    if (source.kind === "failure") {
      return source;
    }

    const kind = readRequiredString(source.value, "kind", commandParseFailure);
    if (kind.kind === "failure") {
      return kind;
    }

    switch (kind.value) {
      case "initialize":
        return parseInitializeCommand(source.value);
      case "begin-authorization":
        return parseBeginAuthorizationCommand(source.value);
      case "consume-callback":
        return parseConsumeCallbackCommand(source.value);
      case "retry":
        return parseNoArgumentCommand(source.value, "retry");
      case "visibility-change":
        return parseVisibilityChangeCommand(source.value);
      case "logout":
        return parseNoArgumentCommand(source.value, "logout");
      case "dispose":
        return parseNoArgumentCommand(source.value, "dispose");
      default:
        return failed(commandParseFailure("invalid-kind"));
    }
  } catch {
    return failed(commandParseFailure("expected-object"));
  }
}

export function createPlaybackWorkerSafeDiagnostic(options: {
  readonly operation: PlaybackWorkerDiagnosticOperation;
  readonly code: PlaybackWorkerDiagnosticCode;
  readonly metadata: PlaybackWorkerDiagnosticMetadata;
}): PlaybackWorkerSafeDiagnostic {
  const diagnostic: PlaybackWorkerSafeDiagnostic = {
    kind: "safe-diagnostic",
    operation: options.operation,
    code: options.code,
    metadata: sanitizeDiagnosticMetadata(options.metadata),
  };

  return Object.freeze(diagnostic);
}

export function noPlaybackWorkerDiagnosticMetadata(): PlaybackWorkerDiagnosticMetadata {
  return noDiagnosticMetadata;
}

export function createPlaybackWorkerFatalInitializationFailure(
  code: PlaybackWorkerFatalInitializationFailure["code"],
): PlaybackWorkerFatalInitializationFailure {
  const failure: PlaybackWorkerFatalInitializationFailure = {
    kind: "fatal-initialization-failure",
    code,
  };

  return Object.freeze(failure);
}

function parseInitializeCommand(
  source: object,
): Result<PlaybackWorkerInitializeCommand, PlaybackWorkerCommandParseFailure> {
  const exact = parseExactObject(
    source,
    ["kind", "applicationUrl", "configuration"],
    commandParseFailure,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const applicationUrl = readRequiredNonEmptyString(
    exact.value,
    "applicationUrl",
    commandParseFailure,
  );
  if (applicationUrl.kind === "failure") {
    return applicationUrl;
  }

  const configuration = readRequiredDataProperty(
    exact.value,
    "configuration",
    commandParseFailure,
  );
  if (configuration.kind === "failure") {
    return configuration;
  }

  const command: PlaybackWorkerInitializeCommand = {
    kind: "initialize",
    applicationUrl: applicationUrl.value,
    configuration: configuration.value,
  };

  return succeeded(Object.freeze(command));
}

function parseBeginAuthorizationCommand(
  source: object,
): Result<
  PlaybackWorkerBeginAuthorizationCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(
    source,
    ["kind", "returnTo"],
    commandParseFailure,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const returnTo = readRequiredDataProperty(
    exact.value,
    "returnTo",
    commandParseFailure,
  );
  if (returnTo.kind === "failure") {
    return returnTo;
  }

  const command: PlaybackWorkerBeginAuthorizationCommand = {
    kind: "begin-authorization",
    returnTo: returnTo.value,
  };

  return succeeded(Object.freeze(command));
}

function parseConsumeCallbackCommand(
  source: object,
): Result<
  PlaybackWorkerConsumeCallbackCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(
    source,
    ["kind", "callbackUrl"],
    commandParseFailure,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const callbackUrl = readRequiredNonEmptyString(
    exact.value,
    "callbackUrl",
    commandParseFailure,
  );
  if (callbackUrl.kind === "failure") {
    return callbackUrl;
  }

  const command: PlaybackWorkerConsumeCallbackCommand = {
    kind: "consume-callback",
    callbackUrl: callbackUrl.value,
  };

  return succeeded(Object.freeze(command));
}

function parseNoArgumentCommand(
  source: object,
  kind: "dispose" | "logout" | "retry",
): Result<
  | PlaybackWorkerDisposeCommand
  | PlaybackWorkerLogoutCommand
  | PlaybackWorkerRetryCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(source, ["kind"], commandParseFailure);
  if (exact.kind === "failure") {
    return exact;
  }

  switch (kind) {
    case "dispose": {
      const command: PlaybackWorkerDisposeCommand = { kind: "dispose" };
      return succeeded(Object.freeze(command));
    }
    case "logout": {
      const command: PlaybackWorkerLogoutCommand = { kind: "logout" };
      return succeeded(Object.freeze(command));
    }
    case "retry": {
      const command: PlaybackWorkerRetryCommand = { kind: "retry" };
      return succeeded(Object.freeze(command));
    }
  }

  return failed(commandParseFailure("invalid-kind"));
}

function parseVisibilityChangeCommand(
  source: object,
): Result<
  PlaybackWorkerVisibilityChangeCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(
    source,
    ["kind", "visibility"],
    commandParseFailure,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const visibility = readRequiredString(
    exact.value,
    "visibility",
    commandParseFailure,
  );
  if (visibility.kind === "failure") {
    return visibility;
  }

  switch (visibility.value) {
    case "hidden":
    case "visible": {
      const command: PlaybackWorkerVisibilityChangeCommand = {
        kind: "visibility-change",
        visibility: visibility.value,
      };
      return succeeded(Object.freeze(command));
    }
    default:
      return failed(commandParseFailure("invalid-value"));
  }
}

function parseObject<Failure>(
  input: unknown,
  createFailure: (code: WorkerProtocolParseCode) => Failure,
): Result<object, Failure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(createFailure("expected-object"));
  }

  return succeeded(input);
}

function parseExactObject<Failure>(
  source: object,
  allowedFields: ReadonlyArray<string>,
  createFailure: (code: WorkerProtocolParseCode) => Failure,
): Result<object, Failure> {
  const fieldNames = Object.getOwnPropertyNames(source);
  for (const fieldName of fieldNames) {
    if (!allowedFields.includes(fieldName)) {
      return failed(createFailure("unexpected-field"));
    }
  }

  if (Object.getOwnPropertySymbols(source).length > 0) {
    return failed(createFailure("unexpected-field"));
  }

  return succeeded(source);
}

function readRequiredDataProperty<Failure>(
  source: object,
  fieldName: string,
  createFailure: (code: WorkerProtocolParseCode) => Failure,
): Result<unknown, Failure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failed(createFailure("missing-value"));
  }

  if (!("value" in descriptor)) {
    return failed(createFailure("expected-data-property"));
  }

  return succeeded(descriptor.value);
}

function readRequiredString<Failure>(
  source: object,
  fieldName: string,
  createFailure: (code: WorkerProtocolParseCode) => Failure,
): Result<string, Failure> {
  const value = readRequiredDataProperty(source, fieldName, createFailure);
  if (value.kind === "failure") {
    return value;
  }

  if (typeof value.value !== "string") {
    return failed(createFailure("invalid-value"));
  }

  return succeeded(value.value);
}

function readRequiredNonEmptyString<Failure>(
  source: object,
  fieldName: string,
  createFailure: (code: WorkerProtocolParseCode) => Failure,
): Result<string, Failure> {
  const value = readRequiredString(source, fieldName, createFailure);
  if (value.kind === "failure") {
    return value;
  }

  if (value.value.trim().length === 0) {
    return failed(createFailure("expected-non-empty-string"));
  }

  return value;
}

function sanitizeDiagnosticMetadata(
  metadata: PlaybackWorkerDiagnosticMetadata,
): PlaybackWorkerDiagnosticMetadata {
  switch (metadata.kind) {
    case "none":
      return noPlaybackWorkerDiagnosticMetadata();
    case "http-status":
      if (!isSafeHttpStatus(metadata.status)) {
        return noPlaybackWorkerDiagnosticMetadata();
      }

      return Object.freeze({
        kind: "http-status",
        status: metadata.status,
      });
    case "retry-after":
      if (!isSafeRetryAfterMilliseconds(metadata.retryAfterMilliseconds)) {
        return noPlaybackWorkerDiagnosticMetadata();
      }

      return Object.freeze({
        kind: "retry-after",
        retryAfterMilliseconds: metadata.retryAfterMilliseconds,
      });
    case "http-status-and-retry-after":
      if (
        !isSafeHttpStatus(metadata.status) ||
        !isSafeRetryAfterMilliseconds(metadata.retryAfterMilliseconds)
      ) {
        return noPlaybackWorkerDiagnosticMetadata();
      }

      return Object.freeze({
        kind: "http-status-and-retry-after",
        status: metadata.status,
        retryAfterMilliseconds: metadata.retryAfterMilliseconds,
      });
  }

  return noPlaybackWorkerDiagnosticMetadata();
}

function isSafeHttpStatus(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599;
}

function isSafeRetryAfterMilliseconds(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maximumPlatformTimerDelayMilliseconds
  );
}

function commandParseFailure(
  code: WorkerProtocolParseCode,
): PlaybackWorkerCommandParseFailure {
  const failure: PlaybackWorkerCommandParseFailure = {
    kind: "invalid-playback-worker-command",
    code,
  };

  return Object.freeze(failure);
}

function succeeded<Value>(value: Value): Result<Value, never> {
  return Object.freeze({ kind: "success", value });
}

function failed<Failure>(error: Failure): Result<never, Failure> {
  return Object.freeze({ kind: "failure", error });
}
