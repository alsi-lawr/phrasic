import {
  maximumPlatformTimerDelayMilliseconds,
  type Result,
} from "../../domain/playback.ts";
import {
  parsePlaybackWireState,
  type PlaybackWireState,
} from "../../domain/playback-stream.ts";

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

export type PlaybackWorkerPlaybackState = {
  readonly kind: "playback-state";
  readonly state: PlaybackWireState;
};

export type PlaybackWorkerEvent =
  | PlaybackWorkerAuthorizationRedirect
  | PlaybackWorkerFatalInitializationFailure
  | PlaybackWorkerPlaybackState
  | PlaybackWorkerSafeDiagnostic;

export type PlaybackWorkerEventParseFailure = {
  readonly kind: "invalid-playback-worker-event";
  readonly code: WorkerProtocolParseCode;
};

type FailureFactory<Failure> = {
  readonly create: (code: WorkerProtocolParseCode) => Failure;
};

const noDiagnosticMetadata: PlaybackWorkerDiagnosticMetadata = Object.freeze({
  kind: "none",
});

export function parsePlaybackWorkerCommand(
  input: unknown,
): Result<PlaybackWorkerCommand, PlaybackWorkerCommandParseFailure> {
  const failures: FailureFactory<PlaybackWorkerCommandParseFailure> = {
    create: commandParseFailure,
  };

  try {
    const source = parseObject(input, failures);
    if (source.kind === "failure") {
      return source;
    }

    const kind = readRequiredString(source.value, "kind", failures);
    if (kind.kind === "failure") {
      return kind;
    }

    switch (kind.value) {
      case "initialize":
        return parseInitializeCommand(source.value, failures);
      case "begin-authorization":
        return parseBeginAuthorizationCommand(source.value, failures);
      case "consume-callback":
        return parseConsumeCallbackCommand(source.value, failures);
      case "retry":
        return parseNoArgumentCommand(source.value, "retry", failures);
      case "visibility-change":
        return parseVisibilityChangeCommand(source.value, failures);
      case "logout":
        return parseNoArgumentCommand(source.value, "logout", failures);
      case "dispose":
        return parseNoArgumentCommand(source.value, "dispose", failures);
      default:
        return failed(failures.create("invalid-kind"));
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

export function parsePlaybackWorkerEvent(
  input: unknown,
): Result<PlaybackWorkerEvent, PlaybackWorkerEventParseFailure> {
  const failures: FailureFactory<PlaybackWorkerEventParseFailure> = {
    create: eventParseFailure,
  };

  try {
    const source = parseObject(input, failures);
    if (source.kind === "failure") {
      return source;
    }

    const kind = readRequiredString(source.value, "kind", failures);
    if (kind.kind === "failure") {
      return kind;
    }

    switch (kind.value) {
      case "authorization-redirect":
        return parseAuthorizationRedirectEvent(source.value, failures);
      case "playback-state":
        return parsePlaybackStateEvent(source.value, failures);
      case "safe-diagnostic":
        return parseSafeDiagnosticEvent(source.value, failures);
      case "fatal-initialization-failure":
        return parseFatalInitializationFailureEvent(source.value, failures);
      default:
        return failed(failures.create("invalid-kind"));
    }
  } catch {
    return failed(eventParseFailure("expected-object"));
  }
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
  failures: FailureFactory<PlaybackWorkerCommandParseFailure>,
): Result<PlaybackWorkerInitializeCommand, PlaybackWorkerCommandParseFailure> {
  const exact = parseExactObject(
    source,
    ["kind", "applicationUrl", "configuration"],
    failures,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const applicationUrl = readRequiredNonEmptyString(
    exact.value,
    "applicationUrl",
    failures,
  );
  if (applicationUrl.kind === "failure") {
    return applicationUrl;
  }

  const configuration = readRequiredDataProperty(
    exact.value,
    "configuration",
    failures,
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
  failures: FailureFactory<PlaybackWorkerCommandParseFailure>,
): Result<
  PlaybackWorkerBeginAuthorizationCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(source, ["kind", "returnTo"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const returnTo = readRequiredDataProperty(exact.value, "returnTo", failures);
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
  failures: FailureFactory<PlaybackWorkerCommandParseFailure>,
): Result<
  PlaybackWorkerConsumeCallbackCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(source, ["kind", "callbackUrl"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const callbackUrl = readRequiredNonEmptyString(
    exact.value,
    "callbackUrl",
    failures,
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
  failures: FailureFactory<PlaybackWorkerCommandParseFailure>,
): Result<
  | PlaybackWorkerDisposeCommand
  | PlaybackWorkerLogoutCommand
  | PlaybackWorkerRetryCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(source, ["kind"], failures);
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

  return failed(failures.create("invalid-kind"));
}

function parseVisibilityChangeCommand(
  source: object,
  failures: FailureFactory<PlaybackWorkerCommandParseFailure>,
): Result<
  PlaybackWorkerVisibilityChangeCommand,
  PlaybackWorkerCommandParseFailure
> {
  const exact = parseExactObject(source, ["kind", "visibility"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const visibility = readRequiredString(exact.value, "visibility", failures);
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
      return failed(failures.create("invalid-value"));
  }
}

function parseAuthorizationRedirectEvent(
  source: object,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<
  PlaybackWorkerAuthorizationRedirect,
  PlaybackWorkerEventParseFailure
> {
  const exact = parseExactObject(source, ["kind", "url"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const url = readRequiredNonEmptyString(exact.value, "url", failures);
  if (url.kind === "failure") {
    return url;
  }

  const event: PlaybackWorkerAuthorizationRedirect = {
    kind: "authorization-redirect",
    url: url.value,
  };

  return succeeded(Object.freeze(event));
}

function parsePlaybackStateEvent(
  source: object,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<PlaybackWorkerPlaybackState, PlaybackWorkerEventParseFailure> {
  const exact = parseExactObject(source, ["kind", "state"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const stateValue = readRequiredDataProperty(exact.value, "state", failures);
  if (stateValue.kind === "failure") {
    return stateValue;
  }

  const state = parsePlaybackWireState(stateValue.value);
  if (state.kind === "failure") {
    return failed(failures.create("invalid-value"));
  }

  const event: PlaybackWorkerPlaybackState = {
    kind: "playback-state",
    state: state.value,
  };

  return succeeded(Object.freeze(event));
}

function parseSafeDiagnosticEvent(
  source: object,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<PlaybackWorkerSafeDiagnostic, PlaybackWorkerEventParseFailure> {
  const exact = parseExactObject(
    source,
    ["kind", "operation", "code", "metadata"],
    failures,
  );
  if (exact.kind === "failure") {
    return exact;
  }

  const operationValue = readRequiredString(exact.value, "operation", failures);
  if (operationValue.kind === "failure") {
    return operationValue;
  }

  const operation = parseDiagnosticOperation(operationValue.value, failures);
  if (operation.kind === "failure") {
    return operation;
  }

  const codeValue = readRequiredString(exact.value, "code", failures);
  if (codeValue.kind === "failure") {
    return codeValue;
  }

  const code = parseDiagnosticCode(codeValue.value, failures);
  if (code.kind === "failure") {
    return code;
  }

  const metadataValue = readRequiredDataProperty(
    exact.value,
    "metadata",
    failures,
  );
  if (metadataValue.kind === "failure") {
    return metadataValue;
  }

  const metadata = parseDiagnosticMetadata(metadataValue.value, failures);
  if (metadata.kind === "failure") {
    return metadata;
  }

  return succeeded(
    createPlaybackWorkerSafeDiagnostic({
      operation: operation.value,
      code: code.value,
      metadata: metadata.value,
    }),
  );
}

function parseFatalInitializationFailureEvent(
  source: object,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<
  PlaybackWorkerFatalInitializationFailure,
  PlaybackWorkerEventParseFailure
> {
  const exact = parseExactObject(source, ["kind", "code"], failures);
  if (exact.kind === "failure") {
    return exact;
  }

  const code = readRequiredString(exact.value, "code", failures);
  if (code.kind === "failure") {
    return code;
  }

  switch (code.value) {
    case "browser-capability-unavailable":
    case "invalid-public-configuration":
    case "worker-initialization-failed":
      return succeeded(
        createPlaybackWorkerFatalInitializationFailure(code.value),
      );
    default:
      return failed(failures.create("invalid-value"));
  }
}

function parseDiagnosticOperation(
  value: string,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<PlaybackWorkerDiagnosticOperation, PlaybackWorkerEventParseFailure> {
  switch (value) {
    case "authorization":
    case "command":
    case "initialization":
    case "playback-poll":
    case "scheduler":
    case "storage":
    case "token-refresh":
      return succeeded(value);
    default:
      return failed(failures.create("invalid-value"));
  }
}

function parseDiagnosticCode(
  value: string,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<PlaybackWorkerDiagnosticCode, PlaybackWorkerEventParseFailure> {
  switch (value) {
    case "authorization-denied":
    case "authorization-provider-failure":
    case "authorization-required":
    case "authorization-transient-failure":
    case "command-not-allowed":
    case "invalid-callback-url":
    case "invalid-command":
    case "invalid-display-return-configuration":
    case "invalid-public-configuration":
    case "invalid-retry-after":
    case "invalid-runtime-transition":
    case "playback-network-failure":
    case "playback-payload-invalid":
    case "playback-permission-denied":
    case "playback-rate-limited":
    case "playback-server-failure":
    case "playback-unauthorized":
    case "runtime-operation-failed":
    case "scheduler-failure":
    case "storage-failure":
    case "unexpected-playback-status":
    case "unsupported-playback-result":
      return succeeded(value);
    default:
      return failed(failures.create("invalid-value"));
  }
}

function parseDiagnosticMetadata(
  input: unknown,
  failures: FailureFactory<PlaybackWorkerEventParseFailure>,
): Result<PlaybackWorkerDiagnosticMetadata, PlaybackWorkerEventParseFailure> {
  const source = parseObject(input, failures);
  if (source.kind === "failure") {
    return source;
  }

  const kind = readRequiredString(source.value, "kind", failures);
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "none": {
      const exact = parseExactObject(source.value, ["kind"], failures);
      if (exact.kind === "failure") {
        return exact;
      }

      return succeeded(noPlaybackWorkerDiagnosticMetadata());
    }
    case "http-status": {
      const exact = parseExactObject(
        source.value,
        ["kind", "status"],
        failures,
      );
      if (exact.kind === "failure") {
        return exact;
      }

      const status = readRequiredSafeHttpStatus(
        exact.value,
        "status",
        failures,
      );
      if (status.kind === "failure") {
        return status;
      }

      const metadata: PlaybackWorkerDiagnosticMetadata = {
        kind: "http-status",
        status: status.value,
      };
      return succeeded(Object.freeze(metadata));
    }
    case "retry-after": {
      const exact = parseExactObject(
        source.value,
        ["kind", "retryAfterMilliseconds"],
        failures,
      );
      if (exact.kind === "failure") {
        return exact;
      }

      const retryAfterMilliseconds = readRequiredRetryAfterMilliseconds(
        exact.value,
        "retryAfterMilliseconds",
        failures,
      );
      if (retryAfterMilliseconds.kind === "failure") {
        return retryAfterMilliseconds;
      }

      const metadata: PlaybackWorkerDiagnosticMetadata = {
        kind: "retry-after",
        retryAfterMilliseconds: retryAfterMilliseconds.value,
      };
      return succeeded(Object.freeze(metadata));
    }
    case "http-status-and-retry-after": {
      const exact = parseExactObject(
        source.value,
        ["kind", "status", "retryAfterMilliseconds"],
        failures,
      );
      if (exact.kind === "failure") {
        return exact;
      }

      const status = readRequiredSafeHttpStatus(
        exact.value,
        "status",
        failures,
      );
      if (status.kind === "failure") {
        return status;
      }

      const retryAfterMilliseconds = readRequiredRetryAfterMilliseconds(
        exact.value,
        "retryAfterMilliseconds",
        failures,
      );
      if (retryAfterMilliseconds.kind === "failure") {
        return retryAfterMilliseconds;
      }

      const metadata: PlaybackWorkerDiagnosticMetadata = {
        kind: "http-status-and-retry-after",
        status: status.value,
        retryAfterMilliseconds: retryAfterMilliseconds.value,
      };
      return succeeded(Object.freeze(metadata));
    }
    default:
      return failed(failures.create("invalid-value"));
  }
}

function parseObject<Failure>(
  input: unknown,
  failures: FailureFactory<Failure>,
): Result<object, Failure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failed(failures.create("expected-object"));
  }

  return succeeded(input);
}

function parseExactObject<Failure>(
  source: object,
  allowedFields: ReadonlyArray<string>,
  failures: FailureFactory<Failure>,
): Result<object, Failure> {
  const fieldNames = Object.getOwnPropertyNames(source);
  for (const fieldName of fieldNames) {
    if (!allowedFields.includes(fieldName)) {
      return failed(failures.create("unexpected-field"));
    }
  }

  if (Object.getOwnPropertySymbols(source).length > 0) {
    return failed(failures.create("unexpected-field"));
  }

  return succeeded(source);
}

function readRequiredDataProperty<Failure>(
  source: object,
  fieldName: string,
  failures: FailureFactory<Failure>,
): Result<unknown, Failure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined) {
    return failed(failures.create("missing-value"));
  }

  if (!("value" in descriptor)) {
    return failed(failures.create("expected-data-property"));
  }

  return succeeded(descriptor.value);
}

function readRequiredString<Failure>(
  source: object,
  fieldName: string,
  failures: FailureFactory<Failure>,
): Result<string, Failure> {
  const value = readRequiredDataProperty(source, fieldName, failures);
  if (value.kind === "failure") {
    return value;
  }

  if (typeof value.value !== "string") {
    return failed(failures.create("invalid-value"));
  }

  return succeeded(value.value);
}

function readRequiredNonEmptyString<Failure>(
  source: object,
  fieldName: string,
  failures: FailureFactory<Failure>,
): Result<string, Failure> {
  const value = readRequiredString(source, fieldName, failures);
  if (value.kind === "failure") {
    return value;
  }

  if (value.value.trim().length === 0) {
    return failed(failures.create("expected-non-empty-string"));
  }

  return value;
}

function readRequiredSafeHttpStatus<Failure>(
  source: object,
  fieldName: string,
  failures: FailureFactory<Failure>,
): Result<number, Failure> {
  const value = readRequiredDataProperty(source, fieldName, failures);
  if (value.kind === "failure") {
    return value;
  }

  if (
    typeof value.value !== "number" ||
    !Number.isSafeInteger(value.value) ||
    value.value < 100 ||
    value.value > 599
  ) {
    return failed(failures.create("invalid-value"));
  }

  return succeeded(value.value);
}

function readRequiredRetryAfterMilliseconds<Failure>(
  source: object,
  fieldName: string,
  failures: FailureFactory<Failure>,
): Result<number, Failure> {
  const value = readRequiredDataProperty(source, fieldName, failures);
  if (value.kind === "failure") {
    return value;
  }

  if (
    typeof value.value !== "number" ||
    !Number.isSafeInteger(value.value) ||
    value.value < 0 ||
    value.value > maximumPlatformTimerDelayMilliseconds
  ) {
    return failed(failures.create("expected-non-negative-safe-integer"));
  }

  return succeeded(value.value);
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

function eventParseFailure(
  code: WorkerProtocolParseCode,
): PlaybackWorkerEventParseFailure {
  const failure: PlaybackWorkerEventParseFailure = {
    kind: "invalid-playback-worker-event",
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
