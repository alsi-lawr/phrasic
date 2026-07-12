import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessToken,
  AccessTokenExpiresInSeconds,
  AccessTokenRefreshDelayMilliseconds,
  AuthorizationCode,
  RefreshToken,
  type Result,
} from "../domain/playback.ts";
import type { PlaybackStreamOutcome } from "../domain/playback-stream.ts";
import {
  SpotifyTrackListener,
  type SpotifyTrackListenerDependencies,
  type SpotifyTrackListenerPlaybackPoller,
  type SpotifyTrackListenerRefreshScheduler,
  type SpotifyTrackListenerTokenService,
} from "../services/SpotifyClient/SpotifyTrackListener.ts";
import type {
  SpotifyAccessTokenRefreshResponse,
  SpotifyAuthorizationCodeTokenResponse,
  SpotifyTokenResponseParseFailure,
} from "../services/SpotifyClient/SpotifyTokenResponse.ts";

test("the listener reports malformed authorization-code token responses as safe failures", async () => {
  const scheduler = manualRefreshScheduler();
  const tokenService: SpotifyTrackListenerTokenService = {
    exchangeAuthorizationCode: async () =>
      failed<
        SpotifyAuthorizationCodeTokenResponse,
        SpotifyTokenResponseParseFailure
      >({
        kind: "invalid-spotify-token-response",
        exchange: "authorization-code",
        path: "$.access_token",
        code: "expected-non-empty-string",
      }),
    refreshAccessToken: async () =>
      succeeded<
        SpotifyAccessTokenRefreshResponse,
        SpotifyTokenResponseParseFailure
      >(refreshResponse("unused-access-token", 60)),
  };
  const poller = playbackPoller();
  const listener = SpotifyTrackListener.createWithDependencies(
    listenerDependencies(tokenService, poller.poller, scheduler.scheduler),
  );

  listener.setAuthorizationCode(authorizationCode());
  await settleAsyncWork();

  assert.deepEqual(await listener.pollPlayback(), {
    kind: "failure",
    state: {
      kind: "failure",
      error: {
        kind: "provider-failed",
        reason: "malformed-response",
      },
    },
  });
  assert.equal(poller.accessTokens.length, 0);
  assert.equal(scheduler.scheduled.length, 0);
});

test("the listener reports network refresh failures as safe failures instead of empty playback", async () => {
  const scheduler = manualRefreshScheduler();
  const tokenService: SpotifyTrackListenerTokenService = {
    exchangeAuthorizationCode: async () =>
      succeeded<
        SpotifyAuthorizationCodeTokenResponse,
        SpotifyTokenResponseParseFailure
      >(authorizationCodeResponse()),
    refreshAccessToken: async () => {
      throw new Error("refresh-token-secret");
    },
  };
  const poller = playbackPoller();
  const listener = SpotifyTrackListener.createWithDependencies(
    listenerDependencies(tokenService, poller.poller, scheduler.scheduler),
  );

  listener.setRefreshToken(refreshToken());
  await settleAsyncWork();

  const outcome = await listener.pollPlayback();
  assert.deepEqual(outcome, {
    kind: "failure",
    state: {
      kind: "failure",
      error: {
        kind: "provider-failed",
        reason: "network",
      },
    },
  });
  assert.equal(JSON.stringify(outcome).includes("refresh-token-secret"), false);
  assert.equal(poller.accessTokens.length, 0);
  assert.equal(scheduler.scheduled.length, 0);
});

test("the listener exposes authorization-required lifecycle states for rejected refresh credentials", async () => {
  const scheduler = manualRefreshScheduler();
  const authorizationFailure: unknown = {
    isAxiosError: true,
    response: { status: 401 },
  };
  const tokenService: SpotifyTrackListenerTokenService = {
    exchangeAuthorizationCode: async () =>
      succeeded<
        SpotifyAuthorizationCodeTokenResponse,
        SpotifyTokenResponseParseFailure
      >(authorizationCodeResponse()),
    refreshAccessToken: async () => {
      throw authorizationFailure;
    },
  };
  const poller = playbackPoller();
  const listener = SpotifyTrackListener.createWithDependencies(
    listenerDependencies(tokenService, poller.poller, scheduler.scheduler),
  );

  listener.setRefreshToken(refreshToken());
  await settleAsyncWork();

  assert.deepEqual(await listener.pollPlayback(), {
    kind: "changed",
    state: {
      kind: "authorization-required",
      reason: "authorization-revoked",
    },
  });
  assert.equal(poller.accessTokens.length, 0);
  assert.equal(scheduler.scheduled.length, 0);
});

test("the listener schedules one token refresh at the converted expiry boundary without timers", async () => {
  const scheduler = manualRefreshScheduler();
  const tokenService: SpotifyTrackListenerTokenService = {
    exchangeAuthorizationCode: async () =>
      succeeded<
        SpotifyAuthorizationCodeTokenResponse,
        SpotifyTokenResponseParseFailure
      >(authorizationCodeResponse()),
    refreshAccessToken: async () =>
      succeeded<
        SpotifyAccessTokenRefreshResponse,
        SpotifyTokenResponseParseFailure
      >(refreshResponse("access-token-1", 3_600)),
  };
  const poller = playbackPoller();
  const listener = SpotifyTrackListener.createWithDependencies(
    listenerDependencies(tokenService, poller.poller, scheduler.scheduler),
  );

  listener.setRefreshToken(refreshToken());
  await settleAsyncWork();

  assert.equal(scheduler.scheduled.length, 1);
  assert.equal(scheduler.scheduled[0]?.delay.value, 3_600_000);
  assert.deepEqual(await listener.pollPlayback(), { kind: "empty" });
  assert.equal(poller.accessTokens[0]?.value, "access-token-1");

  scheduler.scheduled[0]?.refresh();
  await settleAsyncWork();

  assert.equal(scheduler.scheduled.length, 2);
  assert.equal(scheduler.scheduled[0]?.isCancelled(), true);
  assert.equal(scheduler.scheduled[1]?.delay.value, 3_600_000);
});

type ManualRefresh = {
  readonly delay: AccessTokenRefreshDelayMilliseconds;
  readonly refresh: () => void;
  readonly isCancelled: () => boolean;
};

function manualRefreshScheduler(): {
  readonly scheduler: SpotifyTrackListenerRefreshScheduler;
  readonly scheduled: ReadonlyArray<ManualRefresh>;
} {
  const scheduled: ManualRefresh[] = [];
  const scheduler: SpotifyTrackListenerRefreshScheduler = Object.freeze({
    schedule: (delay, refresh) => {
      let cancelled = false;
      const manualRefresh: ManualRefresh = Object.freeze({
        delay,
        refresh,
        isCancelled: (): boolean => cancelled,
      });
      scheduled.push(manualRefresh);
      return Object.freeze({
        cancel: (): void => {
          cancelled = true;
        },
      });
    },
  });

  return Object.freeze({ scheduler, scheduled });
}

function playbackPoller(): {
  readonly poller: SpotifyTrackListenerPlaybackPoller;
  readonly accessTokens: ReadonlyArray<AccessToken>;
} {
  const accessTokens: AccessToken[] = [];
  const poller: SpotifyTrackListenerPlaybackPoller = Object.freeze({
    pollPlayback: async (
      accessToken: AccessToken,
    ): Promise<PlaybackStreamOutcome> => {
      accessTokens.push(accessToken);
      return Object.freeze({ kind: "empty" });
    },
  });

  return Object.freeze({ poller, accessTokens });
}

function listenerDependencies(
  tokenService: SpotifyTrackListenerTokenService,
  playbackPoller: SpotifyTrackListenerPlaybackPoller,
  refreshScheduler: SpotifyTrackListenerRefreshScheduler,
): SpotifyTrackListenerDependencies {
  return Object.freeze({ tokenService, playbackPoller, refreshScheduler });
}

function authorizationCode(): AuthorizationCode {
  return expectSuccess(AuthorizationCode.create("authorization-code"));
}

function refreshToken(): RefreshToken {
  return expectSuccess(RefreshToken.create("refresh-token"));
}

function authorizationCodeResponse(): SpotifyAuthorizationCodeTokenResponse {
  return Object.freeze({
    accessToken: expectSuccess(AccessToken.create("authorization-access")),
    expiresInSeconds: expectSuccess(AccessTokenExpiresInSeconds.create(3_600)),
    refreshToken: refreshToken(),
  });
}

function refreshResponse(
  accessToken: string,
  expiresInSeconds: number,
): SpotifyAccessTokenRefreshResponse {
  return Object.freeze({
    accessToken: expectSuccess(AccessToken.create(accessToken)),
    expiresInSeconds: expectSuccess(
      AccessTokenExpiresInSeconds.create(expiresInSeconds),
    ),
  });
}

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}

function failed<Value, Failure>(error: Failure): Result<Value, Failure> {
  return Object.freeze({ kind: "failure", error });
}

function succeeded<Value, Failure>(value: Value): Result<Value, Failure> {
  return Object.freeze({ kind: "success", value });
}
