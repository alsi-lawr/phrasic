import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSpotifyPlaybackPayload,
  type SpotifyPlaybackParseFailure,
} from "../providers/spotify/playback.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  episodeArtworkUrl,
  invalidExternalLinkPayload,
  localTrackPayload,
  malformedAlbumPayload,
  malformedArtistPayload,
  malformedArtworkEntriesPayload,
  malformedItemPayload,
  malformedTopLevelPayload,
  manyArtworkPayload,
  missingExternalLinkPayload,
  missingPlaybackTypePayload,
  nullImagesPayload,
  nullIsPlayingPayload,
  nullProgressPayload,
  oneArtworkPayload,
  pausedEpisodePayload,
  playingTrackPayload,
  trackArtworkUrl,
  unknownPlaybackTypePayload,
  zeroArtworkPayload,
} from "./spotify-playback.fixture.ts";
import type { PlaybackState, Result, TrackItem } from "../domain/playback.ts";

test("Spotify playback payloads normalize playing tracks with original links and artwork", () => {
  const state = expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
  const track = expectPlayingTrack(state);

  assert.equal(track.providerId.value, "spotify");
  assert.equal(track.itemId.value, "track-1");
  assert.equal(track.title.value, "Track title");
  assert.equal(track.collection.id.value, "album-1");
  assert.equal(track.collection.title.value, "Album title");
  assert.deepEqual(
    track.artists.map((artist) => artist.name.value),
    ["Track artist"],
  );
  assert.deepEqual(
    track.links.map((link) => link.href),
    ["https://open.spotify.com/track/track-1"],
  );
  assert.deepEqual(
    track.collection.links.map((link) => link.href),
    ["https://open.spotify.com/album/album-1"],
  );
  assert.deepEqual(
    track.artists[0]?.links.map((link) => link.href),
    ["https://open.spotify.com/artist/artist-1"],
  );
  assert.equal(track.artwork.kind, "available");
  if (track.artwork.kind === "available") {
    assert.equal(track.artwork.url.value, trackArtworkUrl);
  }

  if (state.kind === "playing") {
    assert.equal(state.snapshot.position.value, 1_250);
    assert.equal(state.snapshot.duration.value, 3_000);
  }
});

test("Spotify playback payloads normalize paused episodes", () => {
  const state = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );

  assert.equal(state.kind, "paused");
  if (state.kind !== "paused") {
    throw new Error("Expected a paused playback state");
  }

  const item = state.snapshot.item;
  assert.equal(item.kind, "episode");
  if (item.kind !== "episode") {
    throw new Error("Expected an episode item");
  }

  assert.equal(item.providerId.value, "spotify");
  assert.equal(item.itemId.value, "episode-1");
  assert.equal(item.title.value, "Episode title");
  assert.equal(item.show.id.value, "show-1");
  assert.equal(item.show.title.value, "Show title");
  assert.equal(item.show.publisher.value, "Show publisher");
  assert.deepEqual(
    item.links.map((link) => link.href),
    ["https://open.spotify.com/episode/episode-1"],
  );
  assert.deepEqual(
    item.show.links.map((link) => link.href),
    ["https://open.spotify.com/show/show-1"],
  );
  assert.equal(item.artwork.kind, "available");
  if (item.artwork.kind === "available") {
    assert.equal(item.artwork.url.value, episodeArtworkUrl);
  }
  assert.equal(state.snapshot.position.value, 2_500);
  assert.equal(state.snapshot.duration.value, 4_000);
});

test("Spotify empty and unsupported playback variants remain explicit", () => {
  const empty = expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload));
  const advertisement = expectSuccess(
    parseSpotifyPlaybackPayload(advertisementPayload),
  );
  const unknown = expectSuccess(
    parseSpotifyPlaybackPayload(unknownPlaybackTypePayload),
  );
  const local = expectSuccess(parseSpotifyPlaybackPayload(localTrackPayload));

  assert.equal(empty.kind, "empty");
  assert.equal(advertisement.kind, "unsupported");
  if (advertisement.kind === "unsupported") {
    assert.equal(advertisement.reason, "advertisement");
  }
  assert.equal(unknown.kind, "unsupported");
  if (unknown.kind === "unsupported") {
    assert.equal(unknown.reason, "unknown-item-type");
  }
  assert.equal(local.kind, "unsupported");
  if (local.kind === "unsupported") {
    assert.equal(local.reason, "local-item");
  }
});

test("Spotify artwork cardinality and malformed entries retain explicit artwork states", () => {
  const zeroArtwork = expectPlayingTrack(
    expectSuccess(parseSpotifyPlaybackPayload(zeroArtworkPayload)),
  );
  const oneArtwork = expectPlayingTrack(
    expectSuccess(parseSpotifyPlaybackPayload(oneArtworkPayload)),
  );
  const manyArtwork = expectPlayingTrack(
    expectSuccess(parseSpotifyPlaybackPayload(manyArtworkPayload)),
  );
  const malformedArtwork = expectPlayingTrack(
    expectSuccess(parseSpotifyPlaybackPayload(malformedArtworkEntriesPayload)),
  );

  assert.equal(zeroArtwork.artwork.kind, "unavailable");
  if (zeroArtwork.artwork.kind === "unavailable") {
    assert.equal(zeroArtwork.artwork.reason, "provider-did-not-supply-artwork");
  }
  assert.equal(oneArtwork.artwork.kind, "available");
  if (oneArtwork.artwork.kind === "available") {
    assert.equal(
      oneArtwork.artwork.url.value,
      "https://i.scdn.co/image/track-artwork-one",
    );
  }
  assert.equal(manyArtwork.artwork.kind, "available");
  if (manyArtwork.artwork.kind === "available") {
    assert.equal(
      manyArtwork.artwork.url.value,
      "https://i.scdn.co/image/track-artwork-first",
    );
  }
  assert.equal(malformedArtwork.artwork.kind, "unavailable");
  if (malformedArtwork.artwork.kind === "unavailable") {
    assert.equal(
      malformedArtwork.artwork.reason,
      "provider-artwork-is-invalid",
    );
  }
});

test("Spotify payload parse failures retain only safe path and code detail", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly payload: unknown;
    readonly expected: SpotifyPlaybackParseFailure;
  }> = [
    {
      name: "null top-level payload",
      payload: malformedTopLevelPayload,
      expected: failureAt("$", "expected-object"),
    },
    {
      name: "missing playback type",
      payload: missingPlaybackTypePayload,
      expected: failureAt("$.currently_playing_type", "missing-value"),
    },
    {
      name: "null playback flag",
      payload: nullIsPlayingPayload,
      expected: failureAt("$.is_playing", "expected-boolean"),
    },
    {
      name: "array item",
      payload: malformedItemPayload,
      expected: failureAt("$.item", "expected-object"),
    },
    {
      name: "null progress",
      payload: nullProgressPayload,
      expected: failureAt("$.progress_ms", "expected-non-negative-integer"),
    },
    {
      name: "null nested album",
      payload: malformedAlbumPayload,
      expected: failureAt("$.item.album", "expected-object"),
    },
    {
      name: "malformed artist entry",
      payload: malformedArtistPayload,
      expected: failureAt("$.item.artists[]", "expected-object"),
    },
    {
      name: "missing item external link",
      payload: missingExternalLinkPayload,
      expected: failureAt("$.item.external_urls.spotify", "missing-value"),
    },
    {
      name: "invalid item external link",
      payload: invalidExternalLinkPayload,
      expected: failureAt("$.item.external_urls.spotify", "expected-http-url"),
    },
    {
      name: "null image collection",
      payload: nullImagesPayload,
      expected: failureAt("$.item.album.images", "expected-array"),
    },
  ];

  for (const scenario of cases) {
    assert.deepEqual(
      expectFailure(parseSpotifyPlaybackPayload(scenario.payload)),
      scenario.expected,
      scenario.name,
    );
  }
});

function expectPlayingTrack(state: PlaybackState): TrackItem {
  if (state.kind !== "playing") {
    throw new Error("Expected a playing playback state");
  }

  if (state.snapshot.item.kind !== "track") {
    throw new Error("Expected a track item");
  }

  return state.snapshot.item;
}

function expectSuccess<Value>(
  result: Result<Value, SpotifyPlaybackParseFailure>,
): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Spotify playback parse");
}

function expectFailure<Value>(
  result: Result<Value, SpotifyPlaybackParseFailure>,
): SpotifyPlaybackParseFailure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed Spotify playback parse");
}

function failureAt(
  path: SpotifyPlaybackParseFailure["path"],
  code: SpotifyPlaybackParseFailure["code"],
): SpotifyPlaybackParseFailure {
  return {
    kind: "invalid-spotify-playback-payload",
    path,
    code,
  };
}
