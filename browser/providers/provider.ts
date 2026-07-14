import type { PlaybackState, ProviderId } from "../../domain/playback.ts";
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
