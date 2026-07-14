import type {
  PlaybackState,
  ProviderId,
  Result,
} from "../../domain/playback.ts";
import type { PlaybackCredential } from "../auth/provider.ts";

export type PlaybackProviderRequest = {
  readonly accessToken: PlaybackCredential;
  readonly signal: AbortSignal;
};

export type PlaybackRetryAfter =
  | {
      readonly kind: "valid";
      readonly delayMilliseconds: number;
    }
  | {
      readonly kind: "invalid-or-missing";
    };

export type PlaybackProviderResult =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "malformed-response";
    }
  | {
      readonly kind: "network-failure";
    }
  | {
      readonly kind: "playback";
      readonly state: PlaybackState;
    }
  | {
      readonly kind: "permission-denied";
      readonly status: 403;
    }
  | {
      readonly kind: "rate-limited";
      readonly status: 429;
      readonly retryAfter: PlaybackRetryAfter;
    }
  | {
      readonly kind: "server-failure";
      readonly status: number;
    }
  | {
      readonly kind: "unauthorized";
      readonly status: 401;
    }
  | {
      readonly kind: "unexpected-response";
      readonly status: number;
    };

export type PlaybackProviderPort = {
  readonly providerId: ProviderId;
  readonly fetchCurrentlyPlaying: (
    request: PlaybackProviderRequest,
  ) => Promise<PlaybackProviderResult>;
};

export type DuplicatePlaybackProviderRegistration = {
  readonly kind: "duplicate-playback-provider-registration";
  readonly providerId: ProviderId;
};

export type UnregisteredPlaybackProviderFailure = {
  readonly kind: "unregistered-playback-provider";
  readonly providerId: ProviderId;
};

export type PlaybackProviderRegistry = {
  readonly resolve: (
    providerId: ProviderId,
  ) => Result<PlaybackProviderPort, UnregisteredPlaybackProviderFailure>;
};

export function createPlaybackProviderRegistry(
  providers: ReadonlyArray<PlaybackProviderPort>,
): Result<PlaybackProviderRegistry, DuplicatePlaybackProviderRegistration> {
  const registeredProviders: PlaybackProviderPort[] = [];

  for (const provider of providers) {
    if (hasProvider(registeredProviders, provider.providerId)) {
      const error: DuplicatePlaybackProviderRegistration = Object.freeze({
        kind: "duplicate-playback-provider-registration",
        providerId: provider.providerId,
      });

      return Object.freeze({ kind: "failure", error });
    }

    registeredProviders.push(provider);
  }

  const immutableRegisteredProviders = Object.freeze(registeredProviders);
  const registry: PlaybackProviderRegistry = {
    resolve(
      providerId,
    ): Result<PlaybackProviderPort, UnregisteredPlaybackProviderFailure> {
      for (const provider of immutableRegisteredProviders) {
        if (hasSameProviderId(provider.providerId, providerId)) {
          return Object.freeze({ kind: "success", value: provider });
        }
      }

      const error: UnregisteredPlaybackProviderFailure = Object.freeze({
        kind: "unregistered-playback-provider",
        providerId,
      });

      return Object.freeze({ kind: "failure", error });
    },
  };

  return Object.freeze({ kind: "success", value: Object.freeze(registry) });
}

function hasProvider(
  providers: ReadonlyArray<PlaybackProviderPort>,
  providerId: ProviderId,
): boolean {
  for (const provider of providers) {
    if (hasSameProviderId(provider.providerId, providerId)) {
      return true;
    }
  }

  return false;
}

function hasSameProviderId(first: ProviderId, second: ProviderId): boolean {
  return first.value === second.value;
}
