export const trackArtworkUrl = "https://i.scdn.co/image/track-artwork-large";
export const episodeArtworkUrl =
  "https://i.scdn.co/image/episode-artwork-large";

export const playingTrackPayload: unknown = trackPlayback(
  true,
  validTrackItem([{ url: trackArtworkUrl }]),
  1_250,
);

export const pausedEpisodePayload: unknown = episodePlayback(
  false,
  validEpisodeItem([{ url: episodeArtworkUrl }]),
  2_500,
);

export const emptyTrackPayload: unknown = {
  currently_playing_type: "track",
  is_playing: false,
  item: null,
};

export const advertisementPayload: unknown = {
  currently_playing_type: "ad",
  is_playing: true,
  item: null,
};

export const unknownPlaybackTypePayload: unknown = {
  currently_playing_type: "audiobook",
  is_playing: false,
  item: null,
};

export const localTrackPayload: unknown = {
  currently_playing_type: "track",
  is_playing: true,
  item: {
    is_local: true,
  },
};

export const zeroArtworkPayload: unknown = trackPlayback(
  true,
  validTrackItem([]),
  1_250,
);

export const oneArtworkPayload: unknown = trackPlayback(
  true,
  validTrackItem([{ url: "https://i.scdn.co/image/track-artwork-one" }]),
  1_250,
);

export const manyArtworkPayload: unknown = trackPlayback(
  true,
  validTrackItem([
    { url: "https://i.scdn.co/image/track-artwork-first" },
    { url: "https://i.scdn.co/image/track-artwork-second" },
    { url: "https://i.scdn.co/image/track-artwork-third" },
  ]),
  1_250,
);

export const malformedArtworkEntriesPayload: unknown = trackPlayback(
  true,
  validTrackItem([null, {}, { url: null }, { url: "not a URL" }]),
  1_250,
);

export const malformedTopLevelPayload: unknown = null;

export const missingPlaybackTypePayload: unknown = {};

export const nullIsPlayingPayload: unknown = {
  currently_playing_type: "track",
  is_playing: null,
  item: null,
};

export const malformedItemPayload: unknown = trackPlayback(true, [], 1_250);

export const nullProgressPayload: unknown = trackPlayback(
  true,
  validTrackItem([{ url: trackArtworkUrl }]),
  null,
);

export const malformedAlbumPayload: unknown = trackPlayback(
  true,
  trackItem([validArtist()], null, spotifyUrl("track", "track-1")),
  1_250,
);

export const malformedArtistPayload: unknown = trackPlayback(
  true,
  trackItem(
    [null],
    validAlbum([{ url: trackArtworkUrl }]),
    spotifyUrl("track", "track-1"),
  ),
  1_250,
);

export const missingExternalLinkPayload: unknown = trackPlayback(
  true,
  trackItem([validArtist()], validAlbum([{ url: trackArtworkUrl }]), {}),
  1_250,
);

export const invalidExternalLinkPayload: unknown = trackPlayback(
  true,
  trackItem([validArtist()], validAlbum([{ url: trackArtworkUrl }]), {
    spotify: "not a URL",
  }),
  1_250,
);

export const nullImagesPayload: unknown = trackPlayback(
  true,
  validTrackItem(null),
  1_250,
);

function trackPlayback(
  isPlaying: boolean,
  item: unknown,
  progressMilliseconds: unknown,
): unknown {
  return {
    currently_playing_type: "track",
    is_playing: isPlaying,
    progress_ms: progressMilliseconds,
    item,
  };
}

function episodePlayback(
  isPlaying: boolean,
  item: unknown,
  progressMilliseconds: unknown,
): unknown {
  return {
    currently_playing_type: "episode",
    is_playing: isPlaying,
    progress_ms: progressMilliseconds,
    item,
  };
}

function validTrackItem(images: unknown): unknown {
  return trackItem(
    [validArtist()],
    validAlbum(images),
    spotifyUrl("track", "track-1"),
  );
}

function trackItem(
  artists: unknown,
  album: unknown,
  externalUrls: unknown,
): unknown {
  return {
    id: "track-1",
    is_local: false,
    name: "Track title",
    duration_ms: 3_000,
    artists,
    album,
    external_urls: externalUrls,
  };
}

function validArtist(): unknown {
  return {
    name: "Track artist",
    external_urls: spotifyUrl("artist", "artist-1"),
  };
}

function validAlbum(images: unknown): unknown {
  return {
    id: "album-1",
    name: "Album title",
    external_urls: spotifyUrl("album", "album-1"),
    images,
  };
}

function validEpisodeItem(images: unknown): unknown {
  return {
    id: "episode-1",
    name: "Episode title",
    duration_ms: 4_000,
    external_urls: spotifyUrl("episode", "episode-1"),
    images,
    show: {
      id: "show-1",
      name: "Show title",
      publisher: "Show publisher",
      external_urls: spotifyUrl("show", "show-1"),
    },
  };
}

function spotifyUrl(
  kind: "album" | "artist" | "episode" | "show" | "track",
  identifier: string,
): unknown {
  return {
    spotify: `https://open.spotify.com/${kind}/${identifier}`,
  };
}
