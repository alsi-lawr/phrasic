import assert from "node:assert/strict";
import test from "node:test";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
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
import { metadataViewForOverlayState } from "../../components/overlay/overlay-metadata.ts";
import {
  spotifyLinksForMetadata,
  type OverlaySpotifyLink,
  type OverlaySpotifyLinks,
} from "../../components/overlay/overlay-spotify-links.ts";
import {
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("Spotify link mapping preserves a track item, every creator, and its album", () => {
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
  const links = availableLinks(
    spotifyLinksForMetadata(metadataViewForOverlayState(playingState(track))),
  );

  assert.deepEqual(linkDetails(links), [
    {
      destination: "track",
      href: "https://open.spotify.com/track/track-1",
      label: "LISTEN ON SPOTIFY: TRACK — Track title",
    },
    {
      destination: "creator",
      href: "https://open.spotify.com/artist/artist-1",
      label: "OPEN CREATOR ON SPOTIFY: Track artist",
    },
    {
      destination: "creator",
      href: "https://open.spotify.com/artist/artist-2",
      label: "OPEN CREATOR ON SPOTIFY: Second track artist",
    },
    {
      destination: "album",
      href: "https://open.spotify.com/album/album-1",
      label: "OPEN ALBUM ON SPOTIFY: Album title",
    },
  ]);
});

test("Spotify link mapping preserves an episode item and its show", () => {
  const state = expectSuccess(
    parseSpotifyPlaybackPayload(pausedEpisodePayload),
  );
  const links = availableLinks(
    spotifyLinksForMetadata(metadataViewForOverlayState(state)),
  );

  assert.deepEqual(linkDetails(links), [
    {
      destination: "episode",
      href: "https://open.spotify.com/episode/episode-1",
      label: "LISTEN ON SPOTIFY: EPISODE — Episode title",
    },
    {
      destination: "show",
      href: "https://open.spotify.com/show/show-1",
      label: "OPEN SHOW ON SPOTIFY: Show title",
    },
  ]);
});

test("missing or non-Spotify child links cannot produce a partial Spotify link plan", () => {
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
  const nonSpotifyCreator = Creator.create({
    links: [
      expectSuccess(
        ProviderLink.create({
          href: "https://another-provider.example/artist/artist-1",
          providerId: anotherProvider,
        }),
      ),
    ],
    name: firstCreator(originalTrack).name,
  });
  const trackWithNonSpotifyCreator = expectSuccess(
    TrackItem.create({
      artwork: originalTrack.artwork,
      artists: [nonSpotifyCreator],
      collection: originalTrack.collection,
      itemId: originalTrack.itemId,
      links: originalTrack.links,
      providerId: originalTrack.providerId,
      title: originalTrack.title,
    }),
  );

  assert.deepEqual(
    unavailableFailure(
      spotifyLinksForMetadata(
        metadataViewForOverlayState(playingState(trackWithoutAlbumLink)),
      ),
    ),
    {
      destination: "album",
      kind: "spotify-link-unavailable",
      reason: "missing-spotify-link",
    },
  );
  assert.deepEqual(
    unavailableFailure(
      spotifyLinksForMetadata(
        metadataViewForOverlayState(playingState(trackWithNonSpotifyCreator)),
      ),
    ),
    {
      destination: "creator",
      kind: "spotify-link-unavailable",
      reason: "non-spotify-link",
    },
  );
  assert.deepEqual(
    expectFailure(
      TrackItem.create({
        artwork: originalTrack.artwork,
        artists: originalTrack.artists,
        collection: originalTrack.collection,
        itemId: originalTrack.itemId,
        links: [],
        providerId: originalTrack.providerId,
        title: originalTrack.title,
      }),
    ),
    {
      item: "track",
      kind: "invalid-item",
      reason: "missing-provider-links",
    },
  );
});

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

function availableLinks(
  plan: OverlaySpotifyLinks,
): ReadonlyArray<OverlaySpotifyLink> {
  if (plan.kind === "available") {
    return plan.links;
  }

  throw new Error("Expected available Spotify links.");
}

function unavailableFailure(
  plan: OverlaySpotifyLinks,
): Extract<OverlaySpotifyLinks, { readonly kind: "unavailable" }>["failure"] {
  if (plan.kind === "unavailable") {
    return plan.failure;
  }

  throw new Error("Expected unavailable Spotify links.");
}

function linkDetails(links: ReadonlyArray<OverlaySpotifyLink>): ReadonlyArray<{
  readonly destination: OverlaySpotifyLink["destination"];
  readonly href: string;
  readonly label: string;
}> {
  return links.map(
    (
      link,
    ): {
      readonly destination: OverlaySpotifyLink["destination"];
      readonly href: string;
      readonly label: string;
    } => ({
      destination: link.destination,
      href: link.providerLink.href,
      label: link.label,
    }),
  );
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error(
    `Expected a successful result: ${JSON.stringify(result.error)}`,
  );
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed result.");
}
