import axios from "axios";
import type { AuthorizationCode, RefreshToken } from "../../domain/playback";
import type { PlaybackStreamOutcome } from "../../domain/playback-stream";
import type { SpotifyServiceConfiguration } from "./SpotifyServiceConfiguration";
import { RefreshTokenService } from "./SpotifyRefreshService";
import { SpotifyTrackAgent } from "./SpotifyTrackAgent";

export class SpotifyTrackListener {
  private accessToken: string | undefined;
  private refreshToken: RefreshToken | undefined;
  private refreshInterval: ReturnType<typeof setInterval> | undefined;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly trackPollService: SpotifyTrackAgent;

  public constructor(configuration: SpotifyServiceConfiguration) {
    this.refreshTokenService = new RefreshTokenService(
      configuration.refresh,
      configuration.authorization,
    );
    this.trackPollService = new SpotifyTrackAgent(configuration.trackAgent);
  }

  public setAuthorizationCode(authorizationCode: AuthorizationCode): void {
    this.stopRefreshSchedule();
    void this.getFirstAccessToken(authorizationCode);
  }

  public setRefreshToken(refreshToken: RefreshToken): void {
    this.refreshToken = refreshToken;
    this.scheduleRefresh(1_000);
  }

  public static createWithAuthorizationCode(
    authorizationCode: AuthorizationCode,
    configuration: SpotifyServiceConfiguration,
  ): SpotifyTrackListener {
    const trackListener = new SpotifyTrackListener(configuration);
    trackListener.setAuthorizationCode(authorizationCode);

    return trackListener;
  }

  public static createWithRefreshToken(
    refreshToken: RefreshToken,
    configuration: SpotifyServiceConfiguration,
  ): SpotifyTrackListener {
    const trackListener = new SpotifyTrackListener(configuration);
    trackListener.setRefreshToken(refreshToken);

    return trackListener;
  }

  public async pollPlayback(): Promise<PlaybackStreamOutcome> {
    if (this.accessToken === undefined) {
      return this.trackPollService.reportEmptyPlayback();
    }

    return this.trackPollService.pollPlayback(this.accessToken);
  }

  public dispose(): void {
    this.stopRefreshSchedule();
    this.accessToken = undefined;
    this.refreshToken = undefined;
  }

  private async getFirstAccessToken(
    authorizationCode: AuthorizationCode,
  ): Promise<void> {
    try {
      const tokenExchange =
        await this.refreshTokenService.exchangeAuthorizationCode(
          authorizationCode,
        );
      if (tokenExchange.kind === "failure") {
        console.error({ operation: "spotify-auth-code-exchange" });
        return;
      }

      this.accessToken = tokenExchange.value.accessToken;
      this.setRefreshToken(tokenExchange.value.refreshToken);
    } catch (error: unknown) {
      logSpotifyError("spotify-auth-code-exchange", error);
    }
  }

  private async getNewAccessToken(): Promise<void> {
    const refreshToken = this.refreshToken;
    if (refreshToken === undefined) {
      console.error({ operation: "spotify-access-token-refresh" });
      return;
    }

    try {
      const tokenExchange =
        await this.refreshTokenService.refreshAccessToken(refreshToken);
      if (tokenExchange.kind === "failure") {
        console.error({ operation: "spotify-access-token-refresh" });
        return;
      }

      this.accessToken = tokenExchange.value.accessToken;
      this.scheduleRefresh(tokenExchange.value.expiresIn);
    } catch (error: unknown) {
      logSpotifyError("spotify-access-token-refresh", error);
    }
  }

  private scheduleRefresh(delayMilliseconds: number): void {
    this.stopRefreshSchedule();
    this.refreshInterval = setInterval((): void => {
      void this.getNewAccessToken();
    }, delayMilliseconds);
  }

  private stopRefreshSchedule(): void {
    if (this.refreshInterval !== undefined) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = undefined;
  }
}

function logSpotifyError(
  operation: "spotify-access-token-refresh" | "spotify-auth-code-exchange",
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
