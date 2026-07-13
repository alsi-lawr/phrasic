import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
import { OverlaySemanticCompanion } from "../../components/overlay/OverlaySemanticCompanion.tsx";
import { overlayLiveAnnouncementKey } from "../../components/overlay/overlay-identities.ts";
import {
  DisplayText,
  PlaybackPositionMilliseconds,
  PlaybackSnapshot,
  ProviderItemId,
  ProviderLink,
  TrackItem,
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
  type Result,
} from "../../domain/playback.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("the semantic companion has a named polite status region", () => {
  const markup = renderSemanticCompanion(
    playbackSnapshot(initialPlaybackState()),
  );

  assert.match(
    markup,
    /<section[^>]*aria-labelledby="spotify-now-playing-heading"[^>]*>/,
  );
  assert.match(
    markup,
    /<p[^>]*aria-atomic="true"[^>]*aria-live="polite"[^>]*role="status"/,
  );
});

test("the semantic companion renders complete state-aware definitions and polite announcements", () => {
  const cases: ReadonlyArray<SemanticCase> = [
    {
      announcement:
        "Starting Spotify playback. Spotify Now Playing Preparing the display connection.",
      definitions: [
        ["Playback state", "INITIALIZING"],
        ["Status", "Starting Spotify playback."],
        ["Details", "Spotify Now Playing"],
        ["Guidance", "Preparing the display connection."],
      ],
      snapshot: playbackSnapshot(initialPlaybackState()),
    },
    {
      announcement:
        "Spotify authorization is required. Connect Spotify to continue. Spotify is not connected in this browser profile.",
      definitions: [
        ["Playback state", "CONNECT SPOTIFY"],
        ["Details", "Connect Spotify to continue."],
        ["Guidance", "Spotify is not connected in this browser profile."],
      ],
      snapshot: playbackSnapshot(authorizationRequiredState()),
    },
    {
      announcement:
        "Waiting for Spotify authorization. Finish authorization in Spotify. This display will reconnect after authorization completes.",
      definitions: [
        ["Playback state", "AUTHORIZING"],
        ["Details", "Finish authorization in Spotify."],
      ],
      snapshot: playbackSnapshot(authorizingState()),
    },
    {
      announcement:
        "No track or episode is currently playing. Spotify is connected. Start a track or episode to populate the overlay.",
      definitions: [
        ["Playback state", "NOTHING PLAYING"],
        ["Details", "Spotify is connected."],
      ],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
      ),
    },
    {
      announcement:
        "Now playing track: Track title. Artists: Track artist. Album: Album title.",
      definitions: [
        ["Playback state", "PLAYING"],
        ["Track", "Track title"],
        ["Artists", "Track artist"],
        ["Album", "Album title"],
        ["Metadata freshness", "Current playback item."],
      ],
      snapshot: playbackSnapshot(playingTrackState()),
    },
    {
      announcement:
        "Playback paused episode: Episode title. Show: Show title. Publisher: Show publisher.",
      definitions: [
        ["Playback state", "PAUSED"],
        ["Episode", "Episode title"],
        ["Show", "Show title"],
        ["Publisher", "Show publisher"],
        ["Metadata freshness", "Paused playback item."],
      ],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
      ),
    },
    {
      announcement:
        "The current Spotify item cannot be displayed. Spotify is playing an advertisement. Play a supported Spotify track or episode.",
      definitions: [
        ["Playback state", "UNSUPPORTED"],
        ["Details", "Spotify is playing an advertisement."],
      ],
      snapshot: playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
      ),
    },
    {
      announcement:
        "Reconnecting to Spotify. No previous item is available. Waiting for Spotify playback updates to return.",
      definitions: [
        ["Playback state", "RECONNECTING"],
        ["Details", "No previous item is available."],
      ],
      snapshot: playbackSnapshot(reconnectingStateWithoutStaleItem()),
    },
    {
      announcement:
        "Reconnecting to Spotify. Last known track: Track title. Artists: Track artist. Album: Album title.",
      definitions: [
        ["Playback state", "RECONNECTING"],
        ["Track", "Track title"],
        [
          "Metadata freshness",
          "Last known playback item while Spotify reconnects.",
        ],
      ],
      snapshot: playbackSnapshot(reconnectingStateWithStaleItem()),
    },
    {
      announcement:
        "Playback updates failed. The Spotify connection is unavailable. Use setup mode to retry playback or disconnect Spotify.",
      definitions: [
        ["Playback state", "PLAYBACK UNAVAILABLE"],
        ["Details", "The Spotify connection is unavailable."],
      ],
      snapshot: playbackSnapshot(failureState()),
    },
    {
      announcement:
        "This browser cannot start Spotify playback. The browser display could not be initialized. A required browser playback capability is unavailable.",
      definitions: [
        ["Playback state", "OVERLAY UNAVAILABLE"],
        [
          "Guidance",
          "A required browser playback capability is unavailable.",
        ],
      ],
      snapshot: Object.freeze({
        kind: "fatal",
        reason: "browser-capability-unavailable",
      }),
    },
    {
      announcement:
        "The browser configuration is unavailable. The browser display could not be initialized. The public Spotify configuration could not be loaded.",
      definitions: [
        ["Playback state", "OVERLAY UNAVAILABLE"],
        ["Guidance", "The public Spotify configuration could not be loaded."],
      ],
      snapshot: Object.freeze({
        kind: "fatal",
        reason: "configuration-unavailable",
      }),
    },
  ];

  for (const semanticCase of cases) {
    const markup = renderSemanticCompanion(semanticCase.snapshot);

    assert.ok(markup.includes(semanticCase.announcement));
    for (const [term, value] of semanticCase.definitions) {
      assert.ok(markup.includes(`<dt>${term}</dt><dd>${value}</dd>`));
    }
  }
});

test("live announcement keys remain stable across polling and change for item or playback state", () => {
  const playing = playingTrackState();
  if (playing.kind !== "playing") {
    throw new Error("Expected a playing track state.");
  }

  const sameItemPoll: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: playing.snapshot.duration,
        item: playing.snapshot.item,
        position: expectSuccess(PlaybackPositionMilliseconds.create(2_000)),
      }),
    ),
  });
  const pausedSameItem: PlaybackState = Object.freeze({
    kind: "paused",
    snapshot: playing.snapshot,
  });
  const newItem: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: playing.snapshot.duration,
        item: changedTrackItem(playing),
        position: playing.snapshot.position,
      }),
    ),
  });
  const updatedLinks: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: playing.snapshot.duration,
        item: trackWithUpdatedLink(playing),
        position: playing.snapshot.position,
      }),
    ),
  });

  const originalSnapshot = playbackSnapshot(playing);
  const sameItemSnapshot = playbackSnapshot(sameItemPoll);
  const pausedSnapshot = playbackSnapshot(pausedSameItem);
  const newItemSnapshot = playbackSnapshot(newItem);
  const updatedLinksSnapshot = playbackSnapshot(updatedLinks);

  assert.equal(
    overlayLiveAnnouncementKey(sameItemSnapshot),
    overlayLiveAnnouncementKey(originalSnapshot),
  );
  assert.equal(
    overlayLiveAnnouncementKey(updatedLinksSnapshot),
    overlayLiveAnnouncementKey(originalSnapshot),
  );
  assert.notEqual(
    overlayLiveAnnouncementKey(pausedSnapshot),
    overlayLiveAnnouncementKey(originalSnapshot),
  );
  assert.notEqual(
    overlayLiveAnnouncementKey(newItemSnapshot),
    overlayLiveAnnouncementKey(originalSnapshot),
  );
  assert.notEqual(
    overlayLiveAnnouncementKey(playbackSnapshot(failureState())),
    overlayLiveAnnouncementKey(
      playbackSnapshot(
        expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
      ),
    ),
  );
});

type SemanticDefinition = readonly [term: string, value: string];

type SemanticCase = {
  readonly announcement: string;
  readonly definitions: ReadonlyArray<SemanticDefinition>;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function renderSemanticCompanion(
  snapshot: BrowserPlaybackApplicationSnapshot,
): string {
  return renderToStaticMarkup(
    createElement(OverlaySemanticCompanion, { snapshot }),
  );
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function authorizationRequiredState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(initialPlaybackState(), {
      kind: "authorization-required",
      reason: "not-authorized",
    }),
  );
}

function authorizingState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(authorizationRequiredState(), {
      kind: "begin-authorization",
    }),
  );
}

function reconnectingStateWithoutStaleItem(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(authorizingState(), {
      kind: "authorization-complete",
    }),
  );
}

function reconnectingStateWithStaleItem(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(playingTrackState(), { kind: "connection-lost" }),
  );
}

function failureState(): PlaybackState {
  return expectSuccess(
    transitionPlaybackState(initialPlaybackState(), {
      kind: "failure",
      failure: providerFailure("network"),
    }),
  );
}

function playingTrackState(): PlaybackState {
  return expectSuccess(parseSpotifyPlaybackPayload(playingTrackPayload));
}

function changedTrackItem(state: PlaybackState): TrackItem {
  if (state.kind !== "playing" || state.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track state.");
  }

  return expectSuccess(
    TrackItem.create({
      artwork: state.snapshot.item.artwork,
      artists: state.snapshot.item.artists,
      collection: state.snapshot.item.collection,
      itemId: expectSuccess(ProviderItemId.create("track-2")),
      links: state.snapshot.item.links,
      providerId: state.snapshot.item.providerId,
      title: expectSuccess(DisplayText.create("Second track title")),
    }),
  );
}

function trackWithUpdatedLink(state: PlaybackState): TrackItem {
  if (state.kind !== "playing" || state.snapshot.item.kind !== "track") {
    throw new Error("Expected a playing track state.");
  }

  return expectSuccess(
    TrackItem.create({
      artwork: state.snapshot.item.artwork,
      artists: state.snapshot.item.artists,
      collection: state.snapshot.item.collection,
      itemId: state.snapshot.item.itemId,
      links: [
        expectSuccess(
          ProviderLink.create({
            href: "https://open.spotify.com/track/track-1?context=updated",
            providerId: state.snapshot.item.providerId,
          }),
        ),
      ],
      providerId: state.snapshot.item.providerId,
      title: state.snapshot.item.title,
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
