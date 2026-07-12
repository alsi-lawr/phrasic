import fs from "node:fs";
import path from "node:path";
import {
  failurePlaybackWireState,
  type PlaybackStreamOutcome,
} from "@/domain/playback-stream";
import { providerFailure } from "@/domain/playback";
import type { AuthCode, RefreshToken } from "@/types/Auth";
import type { SpotifyProperties } from "@/types/SpotifyProperties";
import { SpotifyTrackListener } from "./SpotifyTrackListener";

class SpotifyTrackServiceController {
  private isRunning = false;
  private spotifyTrackListener: SpotifyTrackListener | undefined;
  private readonly config: SpotifyProperties;

  public constructor(config: SpotifyProperties) {
    this.config = config;
  }

  public startServiceFromAuthCode(authCode: AuthCode): void {
    this.stopExistingListener();
    this.isRunning = true;
    this.spotifyTrackListener = SpotifyTrackListener.createWithAuthCode(
      authCode,
      this.config.refresh,
      this.config.trackAgent,
      this.config.authorization.callbackAddress,
      `${this.config.authorization.spotifyClientId}:${this.config.authorization.spotifyClientSecret}`,
    );
  }

  public startServiceFromRefreshToken(refreshToken: RefreshToken): void {
    this.stopExistingListener();
    this.isRunning = true;
    this.spotifyTrackListener = SpotifyTrackListener.createWithRefreshToken(
      refreshToken,
      this.config.refresh,
      this.config.trackAgent,
      this.config.authorization.callbackAddress,
      `${this.config.authorization.spotifyClientId}:${this.config.authorization.spotifyClientSecret}`,
    );
  }

  public async pollPlayback(): Promise<PlaybackStreamOutcome> {
    if (!this.isRunning || this.spotifyTrackListener === undefined) {
      return Object.freeze({
        kind: "failure",
        state: failurePlaybackWireState(providerFailure("network")),
      });
    }

    return this.spotifyTrackListener.pollPlayback();
  }

  public stopService(): void {
    this.stopExistingListener();
    this.isRunning = false;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public getAuthUrl(): string {
    return `${this.config.authorization.authorizationAddress}?client_id=${this.config.authorization.spotifyClientId}&response_type=${this.config.authorization.responseType}&redirect_uri=${this.config.authorization.callbackAddress}&scope=${this.config.authorization.scopes}`;
  }

  public getTimeoutMs(): number {
    return this.config.trackAgent.spotifyTrackRefreshIntervalMs;
  }

  private stopExistingListener(): void {
    this.spotifyTrackListener?.dispose();
    this.spotifyTrackListener = undefined;
  }
}

class SingletonWrapper {
  private static instance: SpotifyTrackServiceController | undefined;

  public static getInstance(): SpotifyTrackServiceController {
    if (SingletonWrapper.instance === undefined) {
      const source: unknown = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "appconfig.json"), "utf8"),
      );
      SingletonWrapper.instance = new SpotifyTrackServiceController(
        parseSpotifyProperties(source),
      );
    }

    return SingletonWrapper.instance;
  }
}

export const spotifyTrackService = SingletonWrapper.getInstance();

function parseSpotifyProperties(input: unknown): SpotifyProperties {
  if (!isSpotifyProperties(input)) {
    throw new Error("Invalid Spotify service configuration");
  }

  return input;
}

function isSpotifyProperties(input: unknown): input is SpotifyProperties {
  if (!isUnknownJsonObject(input)) {
    return false;
  }

  return (
    isAuthorizationProperties(input["authorization"]) &&
    isTrackAgentProperties(input["trackAgent"]) &&
    isRefreshProperties(input["refresh"])
  );
}

function isAuthorizationProperties(input: unknown): boolean {
  if (!isUnknownJsonObject(input)) {
    return false;
  }

  return (
    typeof input["authorizationAddress"] === "string" &&
    typeof input["scopes"] === "string" &&
    typeof input["responseType"] === "string" &&
    typeof input["callbackAddress"] === "string" &&
    typeof input["spotifyClientId"] === "string" &&
    typeof input["spotifyClientSecret"] === "string"
  );
}

function isTrackAgentProperties(input: unknown): boolean {
  if (!isUnknownJsonObject(input)) {
    return false;
  }

  return (
    typeof input["currentlyPlayingAddress"] === "string" &&
    typeof input["spotifyTrackRefreshIntervalMs"] === "number" &&
    (typeof input["artworkSize"] === "string" || input["artworkSize"] === null)
  );
}

function isRefreshProperties(input: unknown): boolean {
  if (!isUnknownJsonObject(input)) {
    return false;
  }

  return (
    typeof input["authTokenRefreshAddress"] === "string" &&
    typeof input["authTokenRefreshIntervalMs"] === "number"
  );
}

function isUnknownJsonObject(input: unknown): input is {
  readonly [key: string]: unknown;
} {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
