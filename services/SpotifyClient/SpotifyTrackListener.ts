import axios from "axios";
import type { PlaybackStreamOutcome } from "@/domain/playback-stream";
import type { AuthCode, RefreshToken } from "@/types/Auth";
import type {
  RefreshProperties,
  TrackAgentProperties,
} from "@/types/SpotifyProperties";
import { RefreshTokenService } from "./SpotifyRefreshService";
import { SpotifyTrackAgent } from "./SpotifyTrackAgent";

export class SpotifyTrackListener {
  private accessToken: string | null = null;
  private authCode: string | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly refreshTokenService: RefreshTokenService;
  private readonly trackPollService: SpotifyTrackAgent;

  public constructor(
    refreshConfig: RefreshProperties,
    agentConfig: TrackAgentProperties,
    callbackAddress: string,
    spotifyAuthKey: string,
  ) {
    this.refreshTokenService = new RefreshTokenService(
      refreshConfig,
      callbackAddress,
      spotifyAuthKey,
    );
    this.trackPollService = new SpotifyTrackAgent(agentConfig);
  }

  public setAuthCode(authCode: AuthCode): void {
    this.authCode = authCode.code;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    void this.getFirstAccessToken();
  }

  public setRefreshToken(refreshToken: RefreshToken): void {
    this.refreshTokenService.setRefreshToken(refreshToken.token);
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval((): void => {
      void this.getNewAccessToken();
    }, 1_000);
  }

  public resetUsingRefreshToken(refreshToken: RefreshToken): void {
    this.authCode = null;
    this.setRefreshToken(refreshToken);
  }

  public static createWithAuthCode(
    authCode: AuthCode,
    refreshConfig: RefreshProperties,
    agentConfig: TrackAgentProperties,
    callbackAddress: string,
    spotifyAuthKey: string,
  ): SpotifyTrackListener {
    const trackListener = new SpotifyTrackListener(
      refreshConfig,
      agentConfig,
      callbackAddress,
      spotifyAuthKey,
    );
    trackListener.setAuthCode(authCode);

    return trackListener;
  }

  public static createWithRefreshToken(
    refreshToken: RefreshToken,
    refreshConfig: RefreshProperties,
    agentConfig: TrackAgentProperties,
    callbackAddress: string,
    spotifyAuthKey: string,
  ): SpotifyTrackListener {
    const trackListener = new SpotifyTrackListener(
      refreshConfig,
      agentConfig,
      callbackAddress,
      spotifyAuthKey,
    );
    trackListener.setRefreshToken(refreshToken);

    return trackListener;
  }

  public async pollPlayback(): Promise<PlaybackStreamOutcome> {
    if (this.accessToken === null) {
      return this.trackPollService.reportEmptyPlayback();
    }

    return this.trackPollService.pollPlayback(this.accessToken);
  }

  public async getFirstAccessToken(): Promise<void> {
    const authCode = this.authCode;
    if (authCode === null) {
      console.error({ operation: "spotify-auth-code-exchange" });
      return;
    }

    try {
      const refreshResult =
        await this.refreshTokenService.getNewRefreshToken(authCode);
      if (refreshResult.refresh_token === null) {
        console.error({ operation: "spotify-auth-code-exchange" });
        return;
      }

      this.accessToken = refreshResult.access_token;
      this.resetUsingRefreshToken({ token: refreshResult.refresh_token });
    } catch (error: unknown) {
      logSpotifyError("spotify-auth-code-exchange", error);
    }
  }

  public async getNewAccessToken(): Promise<void> {
    try {
      const refreshResult = await this.refreshTokenService.getNewAccessToken();
      this.accessToken = refreshResult.access_token;
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }

      this.refreshInterval = setInterval((): void => {
        void this.getNewAccessToken();
      }, refreshResult.expires_in);
    } catch (error: unknown) {
      logSpotifyError("spotify-access-token-refresh", error);
    }
  }

  public dispose(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = null;
    this.accessToken = null;
    this.authCode = null;
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
