import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackProviderRegistry,
  type PlaybackProviderPort,
  type PlaybackProviderRegistry,
} from "../../../browser/providers/registry.ts";
import { createSpotifyPlaybackProvider } from "../../../browser/providers/spotify.ts";
import { createBrowserRequestDeadlinePort } from "../../../browser/request-deadline.ts";
import { ProviderId } from "../../../domain/playback.ts";
import { ManualRequestDeadlineScheduler } from "../request-deadline.fixture.ts";

test("a Spotify-only registry resolves its sole provider and rejects a distinct provider", () => {
  const spotify = spotifyPlaybackProvider();
  const registry = expectRegistry(createPlaybackProviderRegistry([spotify]));

  const resolvedSpotify = registry.resolve(spotify.providerId);
  assert.equal(resolvedSpotify.kind, "success");
  if (resolvedSpotify.kind === "success") {
    assert.strictEqual(resolvedSpotify.value, spotify);
  }

  const missingProviderId = providerId("unregistered-provider");
  const missingProvider = registry.resolve(missingProviderId);
  assert.equal(missingProvider.kind, "failure");
  if (missingProvider.kind === "failure") {
    assert.equal(missingProvider.error.kind, "unregistered-playback-provider");
    assert.strictEqual(missingProvider.error.providerId, missingProviderId);
  }
});

test("a provider registry rejects duplicate provider registrations", () => {
  const registration = createPlaybackProviderRegistry([
    spotifyPlaybackProvider(),
    spotifyPlaybackProvider(),
  ]);

  assert.equal(registration.kind, "failure");
  if (registration.kind === "failure") {
    assert.equal(
      registration.error.kind,
      "duplicate-playback-provider-registration",
    );
    assert.equal(registration.error.providerId.value, "spotify");
  }
});

function expectRegistry(
  result: ReturnType<typeof createPlaybackProviderRegistry>,
): PlaybackProviderRegistry {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a unique playback provider registry.");
}

function spotifyPlaybackProvider(): PlaybackProviderPort {
  const fetchImplementation: typeof globalThis.fetch =
    async (): Promise<Response> => {
      throw new Error(
        "The registry test does not issue Spotify playback requests.",
      );
    };

  return createSpotifyPlaybackProvider({
    fetchImplementation,
    requestDeadline: createBrowserRequestDeadlinePort(
      new ManualRequestDeadlineScheduler(),
    ),
    timeoutMilliseconds: 25,
  });
}

function providerId(value: string): ProviderId {
  const parsed = ProviderId.create(value);
  if (parsed.kind === "success") {
    return parsed.value;
  }

  throw new Error("Expected a valid provider identifier fixture.");
}
