import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessToken,
  PlaybackPollDelayMilliseconds,
  type Result,
} from "../domain/playback.ts";
import type { PlaybackWireState } from "../domain/playback-stream.ts";
import {
  SpotifyTrackAgent,
  type SpotifyCurrentlyPlayingResponse,
  type SpotifyCurrentlyPlayingTransport,
} from "../services/SpotifyClient/SpotifyTrackAgent.ts";
import type { SpotifyTrackAgentConfiguration } from "../services/SpotifyClient/SpotifyServiceConfiguration.ts";

test("Spotify playback authorization statuses require authorization", async () => {
  const scenarios: ReadonlyArray<{
    readonly status: number;
    readonly expected: PlaybackWireState;
  }> = [
    {
      status: 401,
      expected: {
        kind: "authorization-required",
        reason: "not-authorized",
      },
    },
    {
      status: 403,
      expected: {
        kind: "authorization-required",
        reason: "permission-required",
      },
    },
  ];

  for (const scenario of scenarios) {
    const agent = new SpotifyTrackAgent(
      configuration(),
      responseTransport({ status: scenario.status, data: null }),
    );

    assert.deepEqual(
      await agent.pollPlayback(accessToken()),
      scenario.expected,
    );
  }
});

test("Spotify playback provider failures retain their provider classifications", async () => {
  const scenarios: ReadonlyArray<{
    readonly status: number;
    readonly expected: PlaybackWireState;
  }> = [
    {
      status: 429,
      expected: {
        kind: "failure",
        error: { kind: "provider-failed", reason: "rate-limited" },
      },
    },
    {
      status: 503,
      expected: {
        kind: "failure",
        error: { kind: "provider-failed", reason: "server-error" },
      },
    },
  ];

  for (const scenario of scenarios) {
    const agent = new SpotifyTrackAgent(
      configuration(),
      responseTransport({ status: scenario.status, data: null }),
    );

    assert.deepEqual(
      await agent.pollPlayback(accessToken()),
      scenario.expected,
    );
  }
});

test("Spotify playback rejects malformed provider payloads without exposing them", async () => {
  const agent = new SpotifyTrackAgent(
    configuration(),
    responseTransport({ status: 200, data: {} }),
  );

  assert.deepEqual(await agent.pollPlayback(accessToken()), {
    kind: "failure",
    error: { kind: "provider-failed", reason: "malformed-response" },
  });
});

test("Spotify playback treats transport rejection as a credential-free network failure", async () => {
  const agent = new SpotifyTrackAgent(
    configuration(),
    rejectedTransport(new Error("access-token-secret")),
  );

  const outcome = await agent.pollPlayback(accessToken());

  assert.deepEqual(outcome, {
    kind: "failure",
    error: { kind: "provider-failed", reason: "network" },
  });
  assert.equal(JSON.stringify(outcome).includes("access-token-secret"), false);
});

function configuration(): SpotifyTrackAgentConfiguration {
  const configuration: SpotifyTrackAgentConfiguration = {
    currentlyPlayingAddress:
      "https://api.spotify.com/v1/me/player/currently-playing",
    playbackPollDelay: expectSuccess(
      PlaybackPollDelayMilliseconds.create(5_000),
    ),
    artworkSize: "large",
  };

  return Object.freeze(configuration);
}

function responseTransport(
  response: SpotifyCurrentlyPlayingResponse,
): SpotifyCurrentlyPlayingTransport {
  return Object.freeze({
    fetchCurrentlyPlaying: async (): Promise<SpotifyCurrentlyPlayingResponse> =>
      response,
  });
}

function rejectedTransport(error: Error): SpotifyCurrentlyPlayingTransport {
  return Object.freeze({
    fetchCurrentlyPlaying:
      async (): Promise<SpotifyCurrentlyPlayingResponse> => {
        throw error;
      },
  });
}

function accessToken(): AccessToken {
  return expectSuccess(AccessToken.create("access-token"));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}
