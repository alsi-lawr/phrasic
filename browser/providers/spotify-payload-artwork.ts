import {
  availableOriginalArtwork,
  unavailableOriginalArtwork,
  type ArtworkUnavailableReason,
  type OriginalArtwork,
} from "../../domain/playback-item.ts";
import {
  parseOriginalArtworkUrl,
  type OriginalArtworkUrl,
} from "../../domain/playback-values.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";
import type {
  SpotifyArtworkSize,
  SpotifyPlaybackParseFailure,
  SpotifyPlaybackPayloadPath,
} from "./spotify-payload-contract.ts";
import {
  isUnknownJsonObject,
  parseArray,
  readRequired,
  type UnknownJsonObject,
} from "./spotify-payload-validation.ts";

export function parseArtwork(
  source: UnknownJsonObject,
  imagesPath: SpotifyPlaybackPayloadPath,
  artworkSize: SpotifyArtworkSize,
): Result<OriginalArtwork, SpotifyPlaybackParseFailure> {
  const imagesValue = readRequired(source, "images", imagesPath);
  if (imagesValue.kind === "failure") {
    return imagesValue;
  }

  const images = parseArray(imagesValue.value, imagesPath);
  if (images.kind === "failure") {
    return images;
  }

  if (images.value.length === 0) {
    return succeeded(
      unavailableOriginalArtwork("provider-did-not-supply-artwork"),
    );
  }

  const preferredImagePosition = artworkPosition(artworkSize);
  let firstValidArtworkUrl: OriginalArtworkUrl | undefined;
  let preferredArtworkUrl: OriginalArtworkUrl | undefined;
  let validImagePosition = 0;

  for (const image of images.value) {
    const artworkUrl = parseArtworkUrl(image);
    if (artworkUrl.kind === "success") {
      if (firstValidArtworkUrl === undefined) {
        firstValidArtworkUrl = artworkUrl.value;
      }

      if (validImagePosition === preferredImagePosition) {
        preferredArtworkUrl = artworkUrl.value;
      }

      validImagePosition += 1;
    }
  }

  if (firstValidArtworkUrl === undefined) {
    return succeeded(unavailableOriginalArtwork("provider-artwork-is-invalid"));
  }

  // Spotify orders images from large to small. If the requested ordinal is absent,
  // retain the first valid provider URL as the deterministic original-artwork fallback.
  return succeeded(
    availableOriginalArtwork(preferredArtworkUrl ?? firstValidArtworkUrl),
  );
}

function artworkPosition(artworkSize: SpotifyArtworkSize): 0 | 1 | 2 {
  switch (artworkSize) {
    case "large":
      return 0;
    case "medium":
      return 1;
    case "small":
      return 2;
  }

  return unreachable(artworkSize);
}

function parseArtworkUrl(
  input: unknown,
): Result<OriginalArtworkUrl, ArtworkUnavailableReason> {
  if (!isUnknownJsonObject(input) || !Object.hasOwn(input, "url")) {
    return failed("provider-artwork-is-invalid");
  }

  const artworkUrl = parseOriginalArtworkUrl(input["url"]);
  if (artworkUrl.kind === "failure") {
    return failed("provider-artwork-is-invalid");
  }

  return succeeded(artworkUrl.value);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Spotify artwork size: ${String(value)}`);
}
