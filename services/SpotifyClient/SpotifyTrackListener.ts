import {
  RefreshProperties,
  TrackAgentProperties,
} from "@/types/SpotifyProperties";
import { RefreshTokenService } from "./SpotifyRefreshService";
import { SpotifyTrackAgent } from "./SpotifyTrackAgent";
import { AuthCode } from "@/types/Auth";
import { RefreshToken } from "@prisma/client";
import axios from "axios";
import { SpotifyData, SpotifyDataType } from "@/types/Hook";

export class SpotifyTrackListener {
  private accessToken: string | null = null;
  private authCode: string | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshTokenService: RefreshTokenService;
  private trackPollInterval: NodeJS.Timeout | null = null;
  private trackPollService: SpotifyTrackAgent;
  private agentConfig: TrackAgentProperties;

  constructor(
    refreshConfig: RefreshProperties,
    agentConfig: TrackAgentProperties,
    callbackAddress: string,
    spotifyAuthKey: string,
  ) {
    console.log("SpotifyTrackListener initialized");
    this.agentConfig = agentConfig;
    this.refreshTokenService = new RefreshTokenService(
      refreshConfig,
      callbackAddress,
      spotifyAuthKey,
    );
    this.trackPollService = new SpotifyTrackAgent(agentConfig);
  }

  setAuthCode(authCode: AuthCode) {
    console.log("Using auth code");
    this.authCode = authCode.code;
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.getFirstAccessToken();
  }

  setRefreshToken(refreshToken: RefreshToken) {
    console.log("Found existing refresh token");
    this.refreshTokenService.setRefreshToken(refreshToken.token);
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => this.getNewAccessToken(), 1000);
    this.trackPollInterval = setInterval(
      () => this.processTrackChanges(),
      this.agentConfig.spotifyTrackRefreshIntervalMs,
    );
  }

  resetUsingRefreshToken(refreshToken: RefreshToken) {
    this.authCode = null;
    this.setRefreshToken(refreshToken);
  }

  static createWithAuthCode(
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

  static createWithRefreshToken(
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

  async processTrackChanges() {
    if (!this.accessToken) return;
    await this.trackPollService.processUpdate(this.accessToken);
  }

  async getLatest(
    dataType: SpotifyDataType,
    id: string | null,
  ): Promise<SpotifyData | null> {
    return await this.trackPollService.getTrackDiff(dataType, id);
  }

  async getFirstAccessToken() {
    try {
      const refreshResult = await this.refreshTokenService.getNewRefreshToken(
        this.authCode ?? "",
      );
      this.accessToken = refreshResult.access_token;
      this.resetUsingRefreshToken({ token: refreshResult.refresh_token ?? "" });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const providerStatus = error.response?.status;
        if (typeof providerStatus === "number") {
          console.error({
            operation: "spotify-auth-code-exchange",
            providerStatus,
          });
        } else {
          console.error({ operation: "spotify-auth-code-exchange" });
        }
      } else {
        console.error({ operation: "spotify-auth-code-exchange" });
      }
    }
  }

  async getNewAccessToken() {
    this.refreshTokenService
      .getNewAccessToken()
      .then((refreshResult) => {
        this.accessToken = refreshResult.access_token;
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(
          () => this.getNewAccessToken(),
          refreshResult.expires_in,
        );
      })
      .catch((error) => {
        if (axios.isAxiosError(error)) {
          const providerStatus = error.response?.status;
          if (typeof providerStatus === "number") {
            console.error({
              operation: "spotify-access-token-refresh",
              providerStatus,
            });
          } else {
            console.error({ operation: "spotify-access-token-refresh" });
          }
        } else {
          console.error({ operation: "spotify-access-token-refresh" });
        }
      });
  }

  dispose() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.trackPollInterval) clearInterval(this.trackPollInterval);
  }
}
