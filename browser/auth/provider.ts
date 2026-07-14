import type { Result } from "../../domain/playback.ts";

export type PlaybackCredential = {
  readonly toMemoryValue: () => string;
};

export type PlaybackCredentialLifetime = {
  readonly toMilliseconds: () => number;
};

export type AuthorizationReturnTarget = {
  readonly setup: boolean;
  readonly width: number;
};

export type AuthorizationReturnTargetParseFailure = {
  readonly kind: "invalid-authorization-return-target";
};

export function parseAuthorizationReturnTarget(
  input: unknown,
): Result<AuthorizationReturnTarget, AuthorizationReturnTargetParseFailure> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidReturnTarget();
  }

  const fields = Object.getOwnPropertyNames(input);
  if (
    fields.length !== 2 ||
    !fields.includes("setup") ||
    !fields.includes("width") ||
    Object.getOwnPropertySymbols(input).length !== 0
  ) {
    return invalidReturnTarget();
  }

  const setup = Object.getOwnPropertyDescriptor(input, "setup");
  const width = Object.getOwnPropertyDescriptor(input, "width");
  if (
    setup === undefined ||
    !("value" in setup) ||
    typeof setup.value !== "boolean" ||
    width === undefined ||
    !("value" in width) ||
    typeof width.value !== "number" ||
    !Number.isSafeInteger(width.value) ||
    width.value < 320 ||
    width.value > 7_680
  ) {
    return invalidReturnTarget();
  }

  return Object.freeze({
    kind: "success",
    value: Object.freeze({ setup: setup.value, width: width.value }),
  });
}

export type AuthorizationConnectionResult =
  | {
      readonly kind: "success";
      readonly credential: PlaybackCredential;
      readonly lifetime: PlaybackCredentialLifetime;
    }
  | {
      readonly kind: "authorization-required";
      readonly reason:
        "authorization-expired" | "invalid-credentials" | "missing-connection";
    }
  | {
      readonly kind: "transient-failure";
    }
  | {
      readonly kind: "provider-failure";
    };

export type BeginAuthorizationResult =
  | {
      readonly kind: "authorization-redirect";
      readonly url: string;
    }
  | {
      readonly kind: "connected";
      readonly credential: PlaybackCredential;
      readonly lifetime: PlaybackCredentialLifetime;
    }
  | {
      readonly kind: "authorization-denied";
    }
  | {
      readonly kind: "authorization-required";
      readonly reason: "not-authorized";
    }
  | {
      readonly kind: "transient-failure";
    }
  | {
      readonly kind: "provider-failure";
    };

export type ConsumeAuthorizationCallbackResult =
  | {
      readonly kind: "connected";
      readonly credential: PlaybackCredential;
      readonly lifetime: PlaybackCredentialLifetime;
      readonly returnUrl: string;
    }
  | {
      readonly kind: "authorization-denied";
      readonly returnUrl: string;
    }
  | {
      readonly kind: "malformed-callback";
    }
  | {
      readonly kind: "authorization-required";
      readonly returnUrl:
        | { readonly kind: "available"; readonly value: string }
        | { readonly kind: "unavailable" };
    }
  | {
      readonly kind: "transient-failure";
      readonly returnUrl: string;
    }
  | {
      readonly kind: "provider-failure";
      readonly returnUrl: string;
    };

export type AuthorizationSessionPort = {
  readonly beginAuthorization: (options: {
    readonly nowEpochMilliseconds: number;
    readonly returnTo: AuthorizationReturnTarget;
    readonly signal: AbortSignal;
  }) => Promise<BeginAuthorizationResult>;
  readonly cancelPendingWork: () => void;
  readonly consumeCallback: (options: {
    readonly callbackUrl: URL;
    readonly nowEpochMilliseconds: number;
    readonly signal: AbortSignal;
  }) => Promise<ConsumeAuthorizationCallbackResult>;
  readonly logout: () => Promise<void>;
  readonly recoverConnection: (options: {
    readonly signal: AbortSignal;
  }) => Promise<AuthorizationConnectionResult>;
  readonly refreshCredential: (options: {
    readonly signal: AbortSignal;
  }) => Promise<AuthorizationConnectionResult>;
};

export type AuthorizationProviderInitializationFailure = {
  readonly kind: "invalid-provider-configuration";
};

export type AuthorizationProviderPort = {
  readonly initialize: (options: {
    readonly applicationUrl: URL;
    readonly configuration: unknown;
  }) => Result<
    AuthorizationSessionPort,
    AuthorizationProviderInitializationFailure
  >;
};

function invalidReturnTarget(): Result<
  never,
  AuthorizationReturnTargetParseFailure
> {
  return Object.freeze({
    kind: "failure",
    error: Object.freeze({ kind: "invalid-authorization-return-target" }),
  });
}
