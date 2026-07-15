import {
  maximumPlatformTimerDelayMilliseconds,
  type PlaybackState,
} from "../../domain/playback.ts";
import type { AuthorizationReturnTarget } from "../auth/provider.ts";

export type PlaybackWorkerInitializeCommand = {
  readonly kind: "initialize";
  readonly applicationUrl: string;
  readonly configuration: unknown;
};

export type PlaybackWorkerBeginAuthorizationCommand = {
  readonly kind: "begin-authorization";
  readonly returnTo: AuthorizationReturnTarget;
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

const noDiagnosticMetadata: PlaybackWorkerDiagnosticMetadata = {
  kind: "none",
};

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

  return diagnostic;
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

  return failure;
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

      return {
        kind: "http-status",
        status: metadata.status,
      };
    case "retry-after":
      if (!isSafeRetryAfterMilliseconds(metadata.retryAfterMilliseconds)) {
        return noPlaybackWorkerDiagnosticMetadata();
      }

      return {
        kind: "retry-after",
        retryAfterMilliseconds: metadata.retryAfterMilliseconds,
      };
    case "http-status-and-retry-after":
      if (
        !isSafeHttpStatus(metadata.status) ||
        !isSafeRetryAfterMilliseconds(metadata.retryAfterMilliseconds)
      ) {
        return noPlaybackWorkerDiagnosticMetadata();
      }

      return {
        kind: "http-status-and-retry-after",
        status: metadata.status,
        retryAfterMilliseconds: metadata.retryAfterMilliseconds,
      };
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
