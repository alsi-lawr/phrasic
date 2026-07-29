import type {
  AuthorizationAttemptTimestamp,
  PendingAuthorizationAttempt,
  PkceStateCandidate,
} from "./pkce-values.ts";
import type { SpotifyRefreshToken } from "./spotify-token-values.ts";

export type SpotifyPendingAuthorizationAttemptConsumeOptions = {
  readonly state: PkceStateCandidate;
  readonly observedAt: AuthorizationAttemptTimestamp;
};

export type SpotifyPendingAuthorizationAttemptConsumeResult =
  | {
      readonly kind: "consumed";
      readonly attempt: PendingAuthorizationAttempt;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "expired"
        | "invalid-stored-attempt"
        | "missing-attempt"
        | "provider-mismatch"
        | "state-mismatch";
    };

export type SpotifyRefreshTokenReadResult =
  | {
      readonly kind: "found";
      readonly refreshToken: SpotifyRefreshToken;
    }
  | {
      readonly kind: "missing";
    };

export type SpotifyAuthStoragePort = {
  readonly savePendingAuthorizationAttempt: (
    attempt: PendingAuthorizationAttempt,
  ) => Promise<void>;
  readonly consumePendingAuthorizationAttempt: (
    options: SpotifyPendingAuthorizationAttemptConsumeOptions,
  ) => Promise<SpotifyPendingAuthorizationAttemptConsumeResult>;
  readonly readSpotifyRefreshToken: () => Promise<SpotifyRefreshTokenReadResult>;
  readonly saveSpotifyRefreshToken: (
    refreshToken: SpotifyRefreshToken,
  ) => Promise<void>;
  readonly deleteSpotifyRefreshToken: () => Promise<void>;
  readonly clearSpotifyAuthorization: () => Promise<void>;
};
