import assert from "node:assert/strict";
import test from "node:test";
import { parseSpotifyPlaybackPayload } from "../../browser/providers/spotify-payload.ts";
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
import { overlayAnnouncementIdentityKey } from "../../components/overlay/overlay-semantics.ts";
import type {
  OverlayItemMetadataPresentation,
  OverlayMetadataView,
} from "../../components/overlay/overlay-metadata.ts";
import type { OverlaySpotifyLinks } from "../../components/overlay/overlay-spotify-links.ts";
import type { OverlayUiState } from "../../components/overlay/overlay-state.ts";
import {
  overlayViewModelForState,
  type OverlayViewModel,
} from "../../components/overlay/overlay-view-model.ts";
import {
  advertisementPayload,
  emptyTrackPayload,
  pausedEpisodePayload,
  playingTrackPayload,
} from "./providers/spotify-payload.fixture.ts";

test("the semantic companion maps every overlay state to status and complete metadata", () => {
  const cases: ReadonlyArray<SemanticStateCase> = [
    {
      announcement:
        "Starting Spotify playback. Spotify Now Playing Preparing the display connection.",
      label: "INITIALIZING",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: initialPlaybackState(),
    },
    {
      announcement:
        "Spotify authorization is required. Connect Spotify to continue. Spotify is not connected in this browser profile.",
      label: "CONNECT SPOTIFY",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: authorizationRequiredState(),
    },
    {
      announcement:
        "Waiting for Spotify authorization. Finish authorization in Spotify. This display will reconnect after authorization completes.",
      label: "AUTHORIZING",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: authorizingState(),
    },
    {
      announcement:
        "No track or episode is currently playing. Spotify is connected. Start a track or episode to populate the overlay.",
      label: "NOTHING PLAYING",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
    },
    {
      announcement:
        "Now playing track: Track title. Artists: Track artist. Album: Album title.",
      label: "PLAYING",
      metadataKind: "track",
      spotifyLinksKind: "available",
      state: playingTrackState(),
    },
    {
      announcement:
        "Playback paused episode: Episode title. Show: Show title. Publisher: Show publisher.",
      label: "PAUSED",
      metadataKind: "episode",
      spotifyLinksKind: "available",
      state: expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
    },
    {
      announcement:
        "The current Spotify item cannot be displayed. Spotify is playing an advertisement. Play a supported Spotify track or episode.",
      label: "UNSUPPORTED",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: expectSuccess(parseSpotifyPlaybackPayload(advertisementPayload)),
    },
    {
      announcement:
        "Reconnecting to Spotify. No previous item is available. Waiting for Spotify playback updates to return.",
      label: "RECONNECTING",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: reconnectingStateWithoutStaleItem(),
    },
    {
      announcement:
        "Reconnecting to Spotify. Last known track: Track title. Artists: Track artist. Album: Album title.",
      label: "RECONNECTING",
      metadataKind: "track",
      spotifyLinksKind: "available",
      state: reconnectingStateWithStaleItem(),
    },
    {
      announcement:
        "Playback updates failed. The Spotify connection is unavailable. Use setup mode to retry playback or disconnect Spotify.",
      label: "PLAYBACK UNAVAILABLE",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: failureState(),
    },
    {
      announcement:
        "This browser cannot start Spotify playback. The browser display could not be initialized. A required browser playback capability is unavailable.",
      label: "OVERLAY UNAVAILABLE",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: Object.freeze({
        kind: "fatal-initialization-failure",
        reason: "browser-capability-unavailable",
      }),
    },
    {
      announcement:
        "The browser configuration is unavailable. The browser display could not be initialized. The public Spotify configuration could not be loaded.",
      label: "OVERLAY UNAVAILABLE",
      metadataKind: "status",
      spotifyLinksKind: "not-applicable",
      state: Object.freeze({
        kind: "fatal-initialization-failure",
        reason: "configuration-unavailable",
      }),
    },
  ];

  for (const semanticCase of cases) {
    const viewModel = overlayViewModelForState(semanticCase.state);
    const semantic = viewModel.semantic;

    assert.equal(viewModel.kind, semanticCase.state.kind);
    assert.equal(viewModel.status.label, semanticCase.label);
    assert.equal(viewModel.metadata.kind, semanticCase.metadataKind);
    assert.equal(viewModel.spotifyLinks.kind, semanticCase.spotifyLinksKind);
    assert.equal(semantic.announcement.message, semanticCase.announcement);
    assert.equal(
      semantic.announcement.identity.stateKind,
      semanticCase.state.kind,
    );
    assert.notEqual(semantic.announcement.message, "");

    assertCompleteSemanticMetadata(viewModel.metadata);
    assertSemanticDefinitions(viewModel);
  }
});

test("semantic item announcements retain full track and episode metadata", () => {
  const trackViewModel = overlayViewModelForState(playingTrackState());
  const episodeViewModel = overlayViewModelForState(
    expectSuccess(parseSpotifyPlaybackPayload(pausedEpisodePayload)),
  );
  const trackSemantic = trackViewModel.semantic;
  const episodeSemantic = episodeViewModel.semantic;

  assert.equal(trackViewModel.metadata.kind, "track");
  if (trackViewModel.metadata.kind !== "track") {
    throw new Error("Expected track semantic metadata.");
  }
  assert.equal(trackViewModel.metadata.trackTitle.value, "Track title");
  assert.deepEqual(
    trackViewModel.metadata.artists.map((artist): string => artist.name.value),
    ["Track artist"],
  );
  assert.equal(trackViewModel.metadata.album.title.value, "Album title");
  assert.equal(
    trackSemantic.announcement.message,
    "Now playing track: Track title. Artists: Track artist. Album: Album title.",
  );

  assert.equal(episodeViewModel.metadata.kind, "episode");
  if (episodeViewModel.metadata.kind !== "episode") {
    throw new Error("Expected episode semantic metadata.");
  }
  assert.equal(episodeViewModel.metadata.episodeTitle.value, "Episode title");
  assert.equal(episodeViewModel.metadata.show.title.value, "Show title");
  assert.equal(
    episodeViewModel.metadata.show.publisher.value,
    "Show publisher",
  );
  assert.equal(
    episodeSemantic.announcement.message,
    "Playback paused episode: Episode title. Show: Show title. Publisher: Show publisher.",
  );
});

test("announcement identity stays stable for same-item polling and changes for item or state changes", () => {
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

  const originalAnnouncement =
    overlayViewModelForState(playing).semantic.announcement;
  const sameItemAnnouncement =
    overlayViewModelForState(sameItemPoll).semantic.announcement;
  const pausedAnnouncement =
    overlayViewModelForState(pausedSameItem).semantic.announcement;
  const newItemAnnouncement =
    overlayViewModelForState(newItem).semantic.announcement;
  const emptyAnnouncement = overlayViewModelForState(
    expectSuccess(parseSpotifyPlaybackPayload(emptyTrackPayload)),
  ).semantic.announcement;
  const failureAnnouncement =
    overlayViewModelForState(failureState()).semantic.announcement;

  assert.deepEqual(
    sameItemAnnouncement.identity,
    originalAnnouncement.identity,
  );
  assert.equal(
    overlayAnnouncementIdentityKey(sameItemAnnouncement.identity),
    overlayAnnouncementIdentityKey(originalAnnouncement.identity),
  );
  assert.equal(sameItemAnnouncement.message, originalAnnouncement.message);

  assert.notEqual(
    overlayAnnouncementIdentityKey(pausedAnnouncement.identity),
    overlayAnnouncementIdentityKey(originalAnnouncement.identity),
  );
  assert.notEqual(pausedAnnouncement.message, originalAnnouncement.message);
  assert.notEqual(
    overlayAnnouncementIdentityKey(newItemAnnouncement.identity),
    overlayAnnouncementIdentityKey(originalAnnouncement.identity),
  );
  assert.notEqual(newItemAnnouncement.message, originalAnnouncement.message);
  assert.notEqual(
    overlayAnnouncementIdentityKey(failureAnnouncement.identity),
    overlayAnnouncementIdentityKey(emptyAnnouncement.identity),
  );
  assert.notEqual(failureAnnouncement.message, emptyAnnouncement.message);
});

test("Spotify link changes do not create a new polite announcement identity", () => {
  const originalState = playingTrackState();
  if (
    originalState.kind !== "playing" ||
    originalState.snapshot.item.kind !== "track"
  ) {
    throw new Error("Expected a playing track state.");
  }

  const replacementLink = expectSuccess(
    ProviderLink.create({
      href: "https://open.spotify.com/track/track-1?context=updated",
      providerId: originalState.snapshot.item.providerId,
    }),
  );
  const updatedItem = expectSuccess(
    TrackItem.create({
      artwork: originalState.snapshot.item.artwork,
      artists: originalState.snapshot.item.artists,
      collection: originalState.snapshot.item.collection,
      itemId: originalState.snapshot.item.itemId,
      links: [replacementLink],
      providerId: originalState.snapshot.item.providerId,
      title: originalState.snapshot.item.title,
    }),
  );
  const updatedState: PlaybackState = Object.freeze({
    kind: "playing",
    snapshot: expectSuccess(
      PlaybackSnapshot.create({
        duration: originalState.snapshot.duration,
        item: updatedItem,
        position: originalState.snapshot.position,
      }),
    ),
  });
  const originalViewModel = overlayViewModelForState(originalState);
  const updatedViewModel = overlayViewModelForState(updatedState);

  assert.equal(originalViewModel.spotifyLinks.kind, "available");
  assert.equal(updatedViewModel.spotifyLinks.kind, "available");
  if (
    originalViewModel.spotifyLinks.kind !== "available" ||
    updatedViewModel.spotifyLinks.kind !== "available"
  ) {
    throw new Error("Expected available Spotify links.");
  }

  assert.notEqual(
    originalViewModel.spotifyLinks.links[0]?.providerLink.href,
    updatedViewModel.spotifyLinks.links[0]?.providerLink.href,
  );
  assert.equal(
    overlayAnnouncementIdentityKey(
      originalViewModel.semantic.announcement.identity,
    ),
    overlayAnnouncementIdentityKey(
      updatedViewModel.semantic.announcement.identity,
    ),
  );
  assert.equal(
    originalViewModel.semantic.announcement.message,
    updatedViewModel.semantic.announcement.message,
  );
});

type SemanticStateCase = {
  readonly announcement: string;
  readonly label: string;
  readonly metadataKind: OverlayMetadataView["kind"];
  readonly spotifyLinksKind: OverlaySpotifyLinks["kind"];
  readonly state: OverlayUiState;
};

function assertCompleteSemanticMetadata(metadata: OverlayMetadataView): void {
  switch (metadata.kind) {
    case "status":
      assert.notEqual(metadata.title, "");
      assert.notEqual(metadata.subtitle, "");
      assert.notEqual(metadata.context, "");
      return;
    case "track":
      assert.notEqual(metadata.trackTitle.value, "");
      assert.notEqual(metadata.artists.length, 0);
      assert.notEqual(metadata.album.title.value, "");
      return;
    case "episode":
      assert.notEqual(metadata.episodeTitle.value, "");
      assert.notEqual(metadata.show.title.value, "");
      assert.notEqual(metadata.show.publisher.value, "");
      return;
  }

  return unreachable(metadata);
}

function assertSemanticDefinitions(viewModel: OverlayViewModel): void {
  const statusDefinitions = [
    { term: "Playback state", value: viewModel.status.label },
    { term: "Status", value: viewModel.status.message },
  ];

  switch (viewModel.metadata.kind) {
    case "status":
      assert.deepEqual(viewModel.semantic.definitions, [
        ...statusDefinitions,
        { term: "Details", value: viewModel.metadata.subtitle },
        { term: "Guidance", value: viewModel.metadata.context },
      ]);
      return;
    case "track":
      assert.deepEqual(viewModel.semantic.definitions, [
        ...statusDefinitions,
        { term: "Track", value: viewModel.metadata.trackTitle.value },
        {
          term: "Artists",
          value: viewModel.metadata.artists
            .map((artist): string => artist.name.value)
            .join(", "),
        },
        { term: "Album", value: viewModel.metadata.album.title.value },
        {
          term: "Metadata freshness",
          value: expectedMetadataFreshness(
            viewModel.metadata.presentation.kind,
          ),
        },
      ]);
      return;
    case "episode":
      assert.deepEqual(viewModel.semantic.definitions, [
        ...statusDefinitions,
        { term: "Episode", value: viewModel.metadata.episodeTitle.value },
        { term: "Show", value: viewModel.metadata.show.title.value },
        {
          term: "Publisher",
          value: viewModel.metadata.show.publisher.value,
        },
        {
          term: "Metadata freshness",
          value: expectedMetadataFreshness(
            viewModel.metadata.presentation.kind,
          ),
        },
      ]);
      return;
  }

  return unreachable(viewModel.metadata);
}

function expectedMetadataFreshness(
  presentation: OverlayItemMetadataPresentation["kind"],
): string {
  switch (presentation) {
    case "now-playing":
      return "Current playback item.";
    case "paused":
      return "Paused playback item.";
    case "stale":
      return "Last known playback item while Spotify reconnects.";
  }

  return unreachable(presentation);
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
      providerId: state.snapshot.item.providerId,
      itemId: expectSuccess(ProviderItemId.create("track-2")),
      title: expectSuccess(DisplayText.create("Second track title")),
      artists: state.snapshot.item.artists,
      collection: state.snapshot.item.collection,
      artwork: state.snapshot.item.artwork,
      links: state.snapshot.item.links,
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

function unreachable(value: never): never {
  throw new Error(`Unexpected semantic metadata: ${String(value)}`);
}
