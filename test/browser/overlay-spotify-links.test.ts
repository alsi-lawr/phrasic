import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { OverlayVisualSpotifyLinks } from "../../components/overlay/OverlayVisualSpotifyLinks.tsx";
import {
  Collection,
  Creator,
  DisplayText,
  PlaybackSnapshot,
  ProviderId,
  ProviderLink,
  TrackItem,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("Spotify destinations render a track, every creator, and its album", () => {
  const originalTrack = playingTrack();
  const secondCreator = Creator.create({
    links: [spotifyLink(originalTrack.providerId)],
    name: text("Second track artist"),
  });
  const track = expectSuccess(
    TrackItem.create({
      artwork: originalTrack.artwork,
      artists: [...originalTrack.artists, secondCreator],
      collection: originalTrack.collection,
      itemId: originalTrack.itemId,
      links: originalTrack.links,
      providerId: originalTrack.providerId,
      title: originalTrack.title,
    }),
  );
  const markup = renderSpotifyLinks(playbackSnapshot(playingState(track)));

  assert.match(
    markup,
    /aria-label="LISTEN ON SPOTIFY: TRACK — Track title \(opens in a new tab\)"/,
  );
  assert.match(
    markup,
    /aria-label="OPEN CREATOR ON SPOTIFY: Track artist \(opens in a new tab\)"/,
  );
  assert.match(
    markup,
    /aria-label="OPEN CREATOR ON SPOTIFY: Second track artist \(opens in a new tab\)"/,
  );
  assert.match(
    markup,
    /aria-label="OPEN ALBUM ON SPOTIFY: Album title \(opens in a new tab\)"/,
  );
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/track\/track-1"/);
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/artist\/artist-1"/);
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/artist\/artist-2"/);
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/album\/album-1"/);
  assert.match(markup, />Track artist, <\/tspan>/);
  assert.match(markup, />Second track artist<\/tspan>/);
});

test("Spotify destinations render an episode and its show", () => {
  const state = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const markup = renderSpotifyLinks(playbackSnapshot(state));

  assert.match(
    markup,
    /aria-label="LISTEN ON SPOTIFY: EPISODE — Episode title \(opens in a new tab\)"/,
  );
  assert.match(
    markup,
    /aria-label="OPEN SHOW ON SPOTIFY: Show title \(opens in a new tab\)"/,
  );
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/episode\/episode-1"/);
  assert.match(markup, /href="https:\/\/open\.spotify\.com\/show\/show-1"/);
});

test("rendered Spotify links retain accessible pointer and keyboard-focus targets", () => {
  const markup = renderSpotifyLinks(playbackSnapshot(playingSpotifyState()));

  assert.match(markup, /target="_blank"/);
  assert.match(markup, /rel="noopener noreferrer"/);
  assert.match(
    markup,
    /class="[^"]*pointer-events-auto[^"]*group-focus-visible:stroke-white[^"]*group-focus-visible:stroke-40[^"]*"/,
  );
});

test("missing or non-Spotify child links render no partial destination set", () => {
  const originalTrack = playingTrack();
  const missingAlbum = Collection.create({
    id: originalTrack.collection.id,
    links: [],
    title: originalTrack.collection.title,
  });
  const trackWithoutAlbumLink = expectSuccess(
    TrackItem.create({
      artwork: originalTrack.artwork,
      artists: originalTrack.artists,
      collection: missingAlbum,
      itemId: originalTrack.itemId,
      links: originalTrack.links,
      providerId: originalTrack.providerId,
      title: originalTrack.title,
    }),
  );
  const anotherProvider = expectSuccess(ProviderId.create("another-provider"));
  const trackWithNonSpotifyCreator = expectSuccess(
    TrackItem.create({
      artwork: originalTrack.artwork,
      artists: [
        Creator.create({
          links: [
            expectSuccess(
              ProviderLink.create({
                href: "https://another-provider.example/artist/artist-1",
                providerId: anotherProvider,
              }),
            ),
          ],
          name: firstCreator(originalTrack).name,
        }),
      ],
      collection: originalTrack.collection,
      itemId: originalTrack.itemId,
      links: originalTrack.links,
      providerId: originalTrack.providerId,
      title: originalTrack.title,
    }),
  );

  assert.equal(
    renderSpotifyLinks(playbackSnapshot(playingState(trackWithoutAlbumLink))),
    "",
  );
  assert.equal(
    renderSpotifyLinks(playbackSnapshot(playingState(trackWithNonSpotifyCreator))),
    "",
  );
});

function renderSpotifyLinks(snapshot: BrowserPlaybackApplicationSnapshot): string {
  return renderToStaticMarkup(
    createElement(OverlayVisualSpotifyLinks, {
      availableWidth: 2_400,
      snapshot,
    }),
  );
}

function playingTrack(): TrackItem {
  const state = playingSpotifyState();
  if (state.snapshot.item.kind === "track") {
    return state.snapshot.item;
  }

  throw new Error("Expected a playing Spotify track.");
}

function playingState(track: TrackItem): PlaybackState {
  const source = playingSpotifyState();

  return Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: source.snapshot.duration,
        item: track,
        position: source.snapshot.position,
      }),
    ),
  });
}

function playingSpotifyState(): Extract<
  PlaybackState,
  { readonly kind: "playing" }
> {
  const state = expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
  if (state.kind === "playing") {
    return state;
  }

  throw new Error("Expected a playing Spotify state.");
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function spotifyLink(providerId: ProviderId): ProviderLink {
  return expectSuccess(
    ProviderLink.create({
      href: "https://open.spotify.com/artist/artist-2",
      providerId,
    }),
  );
}

function firstCreator(track: TrackItem): Creator {
  const creator = track.artists[0];
  if (creator !== undefined) {
    return creator;
  }

  throw new Error("Expected the Spotify track to include a creator.");
}

function text(value: string): DisplayText {
  return expectSuccess(DisplayText.create(value));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error(
    `Expected a successful result: ${JSON.stringify(result.error)}`,
  );
}
