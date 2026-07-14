import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlaybackProviderRegistry,
  type PlaybackProviderPort,
  type PlaybackProviderRegistry,
} from "../../../browser/providers/registry.ts";
import { ProviderId } from "../../../domain/playback.ts";

test("a provider registry resolves registered providers and rejects an unregistered provider", () => {
  const spotify = playbackProvider("spotify");
  const alternateSource = playbackProvider("alternate-source");
  const registry = expectRegistry(
    createPlaybackProviderRegistry([spotify, alternateSource]),
  );

  const resolvedSpotify = registry.resolve(spotify.providerId);
  assert.equal(resolvedSpotify.kind, "success");
  if (resolvedSpotify.kind === "success") {
    assert.strictEqual(resolvedSpotify.value, spotify);
  }

  const resolvedAlternateSource = registry.resolve(alternateSource.providerId);
  assert.equal(resolvedAlternateSource.kind, "success");
  if (resolvedAlternateSource.kind === "success") {
    assert.strictEqual(resolvedAlternateSource.value, alternateSource);
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
    playbackProvider("spotify"),
    playbackProvider("spotify"),
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

function playbackProvider(value: string): PlaybackProviderPort {
  const provider: PlaybackProviderPort = {
    providerId: providerId(value),
    async fetchCurrentlyPlaying(): Promise<never> {
      throw new Error("The registry test does not fetch playback.");
    },
  };

  return Object.freeze(provider);
}

function providerId(value: string): ProviderId {
  const parsed = ProviderId.create(value);
  if (parsed.kind === "success") {
    return parsed.value;
  }

  throw new Error("Expected a valid provider identifier fixture.");
}
