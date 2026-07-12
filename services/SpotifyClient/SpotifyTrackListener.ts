import axios from "axios";
import {
  AccessTokenRefreshDelayMilliseconds,
  providerFailure,
  unavailableLastPlaybackItem,
  type AccessToken,
  type AccessTokenExpiresInSeconds,
  type AuthorizationCode,
  type AuthorizationRequiredReason,
  type PlaybackFailure,
  type RefreshToken,
  type Result,
} from "../../domain/playback.ts";
import {
  authorizingPlaybackWireState,
  authorizationRequiredPlaybackWireState,
  failurePlaybackWireState,
  initializingPlaybackWireState,
  reconnectingPlaybackWireState,
  type PlaybackWireState,
} from "../../domain/playback-stream.ts";
import type {
  SpotifyAccessTokenRefreshResponse,
  SpotifyAuthorizationCodeTokenResponse,
  SpotifyTokenResponseParseFailure,
} from "./SpotifyTokenResponse.ts";

export type SpotifyTrackListenerTokenService = {
  readonly exchangeAuthorizationCode: (
    authorizationCode: AuthorizationCode,
  ) => Promise<
    Result<
      SpotifyAuthorizationCodeTokenResponse,
      SpotifyTokenResponseParseFailure
    >
  >;
  readonly refreshAccessToken: (
    refreshToken: RefreshToken,
  ) => Promise<
    Result<SpotifyAccessTokenRefreshResponse, SpotifyTokenResponseParseFailure>
  >;
};

export type SpotifyTrackListenerPlaybackPoller = {
  readonly pollPlayback: (
    accessToken: AccessToken,
  ) => Promise<PlaybackWireState>;
};

export type SpotifyTrackListenerRefreshSchedule = {
  readonly cancel: () => void;
};

export type SpotifyTrackListenerRefreshScheduler = {
  readonly schedule: (
    delay: AccessTokenRefreshDelayMilliseconds,
    refresh: () => void,
  ) => SpotifyTrackListenerRefreshSchedule;
};

export type SpotifyTrackListenerDependencies = {
  readonly tokenService: SpotifyTrackListenerTokenService;
  readonly playbackPoller: SpotifyTrackListenerPlaybackPoller;
  readonly refreshScheduler: SpotifyTrackListenerRefreshScheduler;
};

type SpotifyTrackListenerState =
  | {
      readonly kind: "initializing";
    }
  | {
      readonly kind: "authorization-required";
      readonly reason: AuthorizationRequiredReason;
    }
  | {
      readonly kind: "authorizing";
    }
  | {
      readonly kind: "reconnecting";
    }
  | {
      readonly kind: "ready";
      readonly accessToken: AccessToken;
    }
  | {
      readonly kind: "failure";
      readonly error: PlaybackFailure;
    };

type SpotifyTokenExchangeOperation =
  "spotify-access-token-refresh" | "spotify-auth-code-exchange";

type TokenExchangeFailure =
  | {
      readonly kind: "authorization-required";
      readonly reason: AuthorizationRequiredReason;
    }
  | {
      readonly kind: "failure";
      readonly error: PlaybackFailure;
    };

export class SpotifyTrackListener {
  private refreshToken: RefreshToken | undefined;
  private refreshSchedule: SpotifyTrackListenerRefreshSchedule | undefined;
  private state: SpotifyTrackListenerState;
  private tokenExchangeGeneration = 0;
  private readonly tokenService: SpotifyTrackListenerTokenService;
  private readonly playbackPoller: SpotifyTrackListenerPlaybackPoller;
  private readonly refreshScheduler: SpotifyTrackListenerRefreshScheduler;

  private constructor(dependencies: SpotifyTrackListenerDependencies) {
    this.tokenService = dependencies.tokenService;
    this.playbackPoller = dependencies.playbackPoller;
    this.refreshScheduler = dependencies.refreshScheduler;
    this.state = initializingListenerState();
  }

  public static createWithDependencies(
    dependencies: SpotifyTrackListenerDependencies,
  ): SpotifyTrackListener {
    return new SpotifyTrackListener(dependencies);
  }

  public static createWithAuthorizationCode(
    authorizationCode: AuthorizationCode,
    dependencies: SpotifyTrackListenerDependencies,
  ): SpotifyTrackListener {
    const trackListener =
      SpotifyTrackListener.createWithDependencies(dependencies);
    trackListener.setAuthorizationCode(authorizationCode);

    return trackListener;
  }

  public static createWithRefreshToken(
    refreshToken: RefreshToken,
    dependencies: SpotifyTrackListenerDependencies,
  ): SpotifyTrackListener {
    const trackListener =
      SpotifyTrackListener.createWithDependencies(dependencies);
    trackListener.setRefreshToken(refreshToken);

    return trackListener;
  }

  public setAuthorizationCode(authorizationCode: AuthorizationCode): void {
    const generation = this.beginTokenExchange();
    this.refreshToken = undefined;
    this.state = authorizingListenerState();
    void this.exchangeAuthorizationCode(authorizationCode, generation);
  }

  public setRefreshToken(refreshToken: RefreshToken): void {
    const generation = this.beginTokenExchange();
    this.refreshToken = refreshToken;
    this.state = reconnectingListenerState();
    void this.refreshAccessToken(generation);
  }

  public async pollPlayback(): Promise<PlaybackWireState> {
    switch (this.state.kind) {
      case "initializing":
        return initializingPlaybackWireState();
      case "authorization-required":
        return authorizationRequiredPlaybackWireState(this.state.reason);
      case "authorizing":
        return authorizingPlaybackWireState();
      case "reconnecting":
        return reconnectingPlaybackWireState(unavailableLastPlaybackItem());
      case "ready":
        return this.playbackPoller.pollPlayback(this.state.accessToken);
      case "failure":
        return failurePlaybackWireState(this.state.error);
    }

    return assertNever(this.state);
  }

  public dispose(): void {
    this.stopRefreshSchedule();
    this.tokenExchangeGeneration += 1;
    this.refreshToken = undefined;
    this.state = initializingListenerState();
  }

  private beginTokenExchange(): number {
    this.stopRefreshSchedule();
    this.tokenExchangeGeneration += 1;
    return this.tokenExchangeGeneration;
  }

  private async exchangeAuthorizationCode(
    authorizationCode: AuthorizationCode,
    generation: number,
  ): Promise<void> {
    try {
      const tokenExchange =
        await this.tokenService.exchangeAuthorizationCode(authorizationCode);
      if (!this.isCurrentTokenExchange(generation)) {
        return;
      }

      if (tokenExchange.kind === "failure") {
        this.state = failedListenerState(providerFailure("malformed-response"));
        logSpotifyMalformedTokenResponse("spotify-auth-code-exchange");
        return;
      }

      this.refreshToken = tokenExchange.value.refreshToken;
      this.setAccessToken(
        tokenExchange.value.accessToken,
        tokenExchange.value.expiresInSeconds,
        generation,
      );
    } catch (error: unknown) {
      if (!this.isCurrentTokenExchange(generation)) {
        return;
      }

      this.applyTokenExchangeFailure("spotify-auth-code-exchange", error);
    }
  }

  private async refreshAccessToken(generation: number): Promise<void> {
    if (!this.isCurrentTokenExchange(generation)) {
      return;
    }

    const refreshToken = this.refreshToken;
    if (refreshToken === undefined) {
      this.state = authorizationRequiredListenerState("authorization-expired");
      return;
    }

    this.state = reconnectingListenerState();

    try {
      const tokenExchange =
        await this.tokenService.refreshAccessToken(refreshToken);
      if (!this.isCurrentTokenExchange(generation)) {
        return;
      }

      if (tokenExchange.kind === "failure") {
        this.state = failedListenerState(providerFailure("malformed-response"));
        logSpotifyMalformedTokenResponse("spotify-access-token-refresh");
        return;
      }

      this.setAccessToken(
        tokenExchange.value.accessToken,
        tokenExchange.value.expiresInSeconds,
        generation,
      );
    } catch (error: unknown) {
      if (!this.isCurrentTokenExchange(generation)) {
        return;
      }

      this.applyTokenExchangeFailure("spotify-access-token-refresh", error);
    }
  }

  private setAccessToken(
    accessToken: AccessToken,
    expiresIn: AccessTokenExpiresInSeconds,
    generation: number,
  ): void {
    this.state = readyListenerState(accessToken);
    this.scheduleRefresh(expiresIn, generation);
  }

  private scheduleRefresh(
    expiresIn: AccessTokenExpiresInSeconds,
    generation: number,
  ): void {
    this.stopRefreshSchedule();
    const delay = refreshDelayForTokenLifetime(expiresIn);
    this.refreshSchedule = this.refreshScheduler.schedule(delay, (): void => {
      void this.refreshAccessToken(generation);
    });
  }

  private stopRefreshSchedule(): void {
    this.refreshSchedule?.cancel();
    this.refreshSchedule = undefined;
  }

  private isCurrentTokenExchange(generation: number): boolean {
    return generation === this.tokenExchangeGeneration;
  }

  private applyTokenExchangeFailure(
    operation: SpotifyTokenExchangeOperation,
    error: unknown,
  ): void {
    const failure = tokenExchangeFailureFromUnknown(operation, error);
    switch (failure.kind) {
      case "authorization-required":
        this.state = authorizationRequiredListenerState(failure.reason);
        break;
      case "failure":
        this.state = failedListenerState(failure.error);
        break;
    }

    logSpotifyTokenExchangeFailure(operation, error);
  }
}

function refreshDelayForTokenLifetime(
  expiresIn: AccessTokenExpiresInSeconds,
): AccessTokenRefreshDelayMilliseconds {
  return AccessTokenRefreshDelayMilliseconds.fromExpiresInSeconds(expiresIn);
}

function initializingListenerState(): SpotifyTrackListenerState {
  return Object.freeze({ kind: "initializing" });
}

function authorizationRequiredListenerState(
  reason: AuthorizationRequiredReason,
): SpotifyTrackListenerState {
  return Object.freeze({ kind: "authorization-required", reason });
}

function authorizingListenerState(): SpotifyTrackListenerState {
  return Object.freeze({ kind: "authorizing" });
}

function reconnectingListenerState(): SpotifyTrackListenerState {
  return Object.freeze({ kind: "reconnecting" });
}

function readyListenerState(
  accessToken: AccessToken,
): SpotifyTrackListenerState {
  return Object.freeze({ kind: "ready", accessToken });
}

function failedListenerState(
  error: PlaybackFailure,
): SpotifyTrackListenerState {
  return Object.freeze({ kind: "failure", error });
}

function tokenExchangeFailureFromUnknown(
  operation: SpotifyTokenExchangeOperation,
  error: unknown,
): TokenExchangeFailure {
  if (!axios.isAxiosError(error)) {
    return Object.freeze({
      kind: "failure",
      error: providerFailure("network"),
    });
  }

  const providerStatus = error.response?.status;
  if (
    providerStatus === 400 ||
    providerStatus === 401 ||
    providerStatus === 403
  ) {
    return Object.freeze({
      kind: "authorization-required",
      reason:
        operation === "spotify-auth-code-exchange"
          ? "not-authorized"
          : "authorization-revoked",
    });
  }

  if (providerStatus === 429) {
    return Object.freeze({
      kind: "failure",
      error: providerFailure("rate-limited"),
    });
  }

  if (providerStatus !== undefined && providerStatus >= 500) {
    return Object.freeze({
      kind: "failure",
      error: providerFailure("server-error"),
    });
  }

  return Object.freeze({ kind: "failure", error: providerFailure("network") });
}

function logSpotifyTokenExchangeFailure(
  operation: SpotifyTokenExchangeOperation,
  error: unknown,
): void {
  if (!axios.isAxiosError(error)) {
    console.error({ operation });
    return;
  }

  const providerStatus = error.response?.status;
  if (typeof providerStatus === "number") {
    console.error({ operation, providerStatus });
    return;
  }

  console.error({ operation });
}

function logSpotifyMalformedTokenResponse(
  operation: SpotifyTokenExchangeOperation,
): void {
  console.error({ operation });
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Spotify track listener state: ${String(value)}`);
}
