import fs from "node:fs";
import path from "node:path";
import { failurePlaybackWireState } from "@/domain/playback-stream";
import type { PlaybackWireState } from "@/domain/playback-stream";
import { providerFailure } from "@/domain/playback";
import type { AuthorizationCode, RefreshToken } from "@/domain/playback";
import { RefreshTokenService } from "./SpotifyRefreshService";
import {
  SpotifyTrackListener,
  type SpotifyTrackListenerDependencies,
  type SpotifyTrackListenerPlaybackPoller,
  type SpotifyTrackListenerRefreshScheduler,
} from "./SpotifyTrackListener";
import { parseSpotifyServiceConfiguration } from "./SpotifyServiceConfiguration";
import type { SpotifyServiceConfiguration } from "./SpotifyServiceConfiguration";
import { SpotifyTrackAgent } from "./SpotifyTrackAgent";

class SpotifyTrackServiceController {
  private isRunning = false;
  private spotifyTrackListener: SpotifyTrackListener | undefined;
  private readonly configuration: SpotifyServiceConfiguration;

  public constructor(configuration: SpotifyServiceConfiguration) {
    this.configuration = configuration;
  }

  public startServiceFromAuthorizationCode(
    authorizationCode: AuthorizationCode,
  ): void {
    this.stopExistingListener();
    this.isRunning = true;
    this.spotifyTrackListener =
      SpotifyTrackListener.createWithAuthorizationCode(
        authorizationCode,
        createSpotifyTrackListenerDependencies(this.configuration),
      );
  }

  public startServiceFromRefreshToken(refreshToken: RefreshToken): void {
    this.stopExistingListener();
    this.isRunning = true;
    this.spotifyTrackListener = SpotifyTrackListener.createWithRefreshToken(
      refreshToken,
      createSpotifyTrackListenerDependencies(this.configuration),
    );
  }

  public async pollPlayback(): Promise<PlaybackWireState> {
    if (!this.isRunning || this.spotifyTrackListener === undefined) {
      return failurePlaybackWireState(providerFailure("network"));
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
    const authorization = this.configuration.authorization;
    const scopes = authorization.scopes.join(" ");

    return `${authorization.authorizationAddress}?client_id=${authorization.spotifyClientId}&response_type=${authorization.responseType}&redirect_uri=${authorization.callbackAddress}&scope=${scopes}`;
  }

  public getTimeoutMs(): number {
    return this.configuration.trackAgent.spotifyTrackRefreshIntervalMs;
  }

  private stopExistingListener(): void {
    this.spotifyTrackListener?.dispose();
    this.spotifyTrackListener = undefined;
  }
}

const defaultRefreshScheduler: SpotifyTrackListenerRefreshScheduler =
  Object.freeze({
    schedule: (delay, refresh) => {
      const timeout = setTimeout(refresh, delay.value);
      return Object.freeze({
        cancel: (): void => {
          clearTimeout(timeout);
        },
      });
    },
  });

function createSpotifyTrackListenerDependencies(
  configuration: SpotifyServiceConfiguration,
): SpotifyTrackListenerDependencies {
  const trackPollService = new SpotifyTrackAgent(configuration.trackAgent);
  const playbackPoller: SpotifyTrackListenerPlaybackPoller = Object.freeze({
    pollPlayback: (accessToken): Promise<PlaybackWireState> =>
      trackPollService.pollPlayback(accessToken.value),
  });
  const dependencies: SpotifyTrackListenerDependencies = {
    tokenService: new RefreshTokenService(
      configuration.refresh,
      configuration.authorization,
    ),
    playbackPoller,
    refreshScheduler: defaultRefreshScheduler,
  };

  return Object.freeze(dependencies);
}

class SingletonWrapper {
  private static instance: SpotifyTrackServiceController | undefined;

  public static getInstance(): SpotifyTrackServiceController {
    if (SingletonWrapper.instance === undefined) {
      SingletonWrapper.instance = new SpotifyTrackServiceController(
        loadSpotifyServiceConfiguration(),
      );
    }

    return SingletonWrapper.instance;
  }
}

export const spotifyTrackService: SpotifyTrackServiceController =
  SingletonWrapper.getInstance();

function loadSpotifyServiceConfiguration(): SpotifyServiceConfiguration {
  let source: unknown;
  try {
    source = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "appconfig.json"), "utf8"),
    );
  } catch (error: unknown) {
    throw configurationLoadError(error);
  }

  const configuration = parseSpotifyServiceConfiguration(source);
  if (configuration.kind === "failure") {
    throw new Error(
      `Invalid Spotify service configuration at ${configuration.error.path}`,
    );
  }

  return configuration.value;
}

function configurationLoadError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error("Unable to load Spotify service configuration", {
      cause: error,
    });
  }

  return new Error("Unable to load Spotify service configuration");
}
