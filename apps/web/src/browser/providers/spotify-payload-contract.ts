export type SpotifyArtworkSize = "large" | "medium" | "small";

export type SpotifyPlaybackPayloadPath =
  | "$"
  | "$.currently_playing_type"
  | "$.is_playing"
  | "$.item"
  | "$.progress_ms"
  | "$.item.id"
  | "$.item.is_local"
  | "$.item.name"
  | "$.item.duration_ms"
  | "$.item.external_urls"
  | "$.item.external_urls.spotify"
  | "$.item.artists"
  | "$.item.artists[]"
  | "$.item.artists[].name"
  | "$.item.artists[].external_urls"
  | "$.item.artists[].external_urls.spotify"
  | "$.item.album"
  | "$.item.album.id"
  | "$.item.album.name"
  | "$.item.album.external_urls"
  | "$.item.album.external_urls.spotify"
  | "$.item.album.images"
  | "$.item.show"
  | "$.item.show.id"
  | "$.item.show.name"
  | "$.item.show.publisher"
  | "$.item.show.external_urls"
  | "$.item.show.external_urls.spotify"
  | "$.item.images";

export type SpotifyPlaybackParseFailureCode =
  | "expected-array"
  | "expected-boolean"
  | "expected-http-url"
  | "expected-non-empty-string"
  | "expected-non-negative-integer"
  | "expected-positive-integer"
  | "expected-object"
  | "expected-string"
  | "invalid-domain-value"
  | "missing-value"
  | "position-exceeds-duration";

export type SpotifyPlaybackParseFailure = {
  readonly kind: "invalid-spotify-playback-payload";
  readonly path: SpotifyPlaybackPayloadPath;
  readonly code: SpotifyPlaybackParseFailureCode;
};
