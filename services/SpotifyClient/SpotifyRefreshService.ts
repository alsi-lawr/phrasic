import axios from "axios";
import type { AxiosRequestConfig } from "axios";
import type {
  AuthorizationCode,
  RefreshToken,
  Result,
} from "../../domain/playback";
import { storeRefreshToken } from "../SpotifyAuthHook";
import {
  parseSpotifyAccessTokenRefreshResponse,
  parseSpotifyAuthorizationCodeTokenResponse,
} from "./SpotifyTokenResponse";
import type {
  SpotifyAccessTokenRefreshResponse,
  SpotifyAuthorizationCodeTokenResponse,
  SpotifyTokenResponseParseFailure,
} from "./SpotifyTokenResponse";
import type {
  SpotifyAuthorizationConfiguration,
  SpotifyRefreshConfiguration,
} from "./SpotifyServiceConfiguration";

export class RefreshTokenService {
  private readonly refreshConfiguration: SpotifyRefreshConfiguration;
  private readonly callbackAddress: string;
  private readonly spotifyAuthKey: string;

  public constructor(
    refreshConfiguration: SpotifyRefreshConfiguration,
    authorizationConfiguration: SpotifyAuthorizationConfiguration,
  ) {
    this.refreshConfiguration = refreshConfiguration;
    this.callbackAddress = authorizationConfiguration.callbackAddress;
    this.spotifyAuthKey = `${authorizationConfiguration.spotifyClientId}:${authorizationConfiguration.spotifyClientSecret}`;
  }

  public async exchangeAuthorizationCode(
    authorizationCode: AuthorizationCode,
  ): Promise<
    Result<
      SpotifyAuthorizationCodeTokenResponse,
      SpotifyTokenResponseParseFailure
    >
  > {
    const response = await axios.post<unknown>(
      this.refreshConfiguration.authTokenRefreshAddress,
      this.authorizationCodeParameters(authorizationCode),
      this.requestHeaders(),
    );
    const tokenResponse = parseSpotifyAuthorizationCodeTokenResponse(
      response.data,
    );
    if (tokenResponse.kind === "failure") {
      return tokenResponse;
    }

    await storeRefreshToken(tokenResponse.value.refreshToken);
    return tokenResponse;
  }

  public async refreshAccessToken(
    refreshToken: RefreshToken,
  ): Promise<
    Result<SpotifyAccessTokenRefreshResponse, SpotifyTokenResponseParseFailure>
  > {
    const response = await axios.post<unknown>(
      this.refreshConfiguration.authTokenRefreshAddress,
      this.refreshTokenParameters(refreshToken),
      this.requestHeaders(),
    );

    return parseSpotifyAccessTokenRefreshResponse(response.data);
  }

  private authorizationCodeParameters(
    authorizationCode: AuthorizationCode,
  ): URLSearchParams {
    return new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode.value,
      redirect_uri: this.callbackAddress,
    });
  }

  private refreshTokenParameters(refreshToken: RefreshToken): URLSearchParams {
    return new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken.value,
    });
  }

  private requestHeaders(): AxiosRequestConfig<URLSearchParams> {
    return {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(this.spotifyAuthKey).toString("base64")}`,
        "User-Agent": "NowPlaying/1.0.0",
      },
    };
  }
}
