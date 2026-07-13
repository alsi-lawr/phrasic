import type {
  Collection,
  Creator,
  DisplayText,
  Show,
} from "../../domain/playback.ts";
import type {
  OverlayEpisodeMetadataView,
  OverlayItemIdentity,
  OverlayItemMetadataPresentation,
  OverlayMetadataView,
  OverlayStatusMetadataView,
  OverlayTrackMetadataView,
} from "../../components/overlay/overlay-metadata.ts";
import type { MarqueeOverflowDecision } from "../../components/overlay/overlay-marquee.ts";

declare const album: Collection;
declare const artists: ReadonlyArray<Creator>;
declare const identity: OverlayItemIdentity;
declare const presentation: OverlayItemMetadataPresentation;
declare const show: Show;
declare const text: DisplayText;
declare const metadata: OverlayMetadataView;
declare const marqueeDecision: MarqueeOverflowDecision;

const trackMetadata: OverlayTrackMetadataView = Object.freeze({
  album,
  artists,
  itemIdentity: identity,
  kind: "track",
  presentation,
  trackTitle: text,
});
const episodeMetadata: OverlayEpisodeMetadataView = Object.freeze({
  episodeTitle: text,
  itemIdentity: identity,
  kind: "episode",
  presentation,
  show,
});
const statusMetadata: OverlayStatusMetadataView = Object.freeze({
  category: "PLAYING",
  context: "Spotify is playing.",
  kind: "status",
  subtitle: "Track title",
  title: "Now playing",
});

// @ts-expect-error Track metadata always preserves normalized album metadata.
const invalidTrackMetadata: OverlayTrackMetadataView = {
  artists,
  itemIdentity: identity,
  kind: "track",
  presentation,
  trackTitle: text,
};
Object.keys(
  // @ts-expect-error Episode metadata does not flatten track artists into its contract.
  episodeMetadata.artists,
);
const invalidIdentity: OverlayItemIdentity = {
  // @ts-expect-error Item identities require a validated provider item identifier.
  itemId: "track-1",
  // @ts-expect-error Item identities require a validated provider identifier.
  providerId: "spotify",
};
// @ts-expect-error Metadata fields remain readonly after mapping.
trackMetadata.album = album;
// @ts-expect-error Overflowing decisions always provide their measured distance.
const invalidMarqueeDecision: MarqueeOverflowDecision = {
  kind: "overflowing",
};

function metadataKind(view: OverlayMetadataView): OverlayMetadataView["kind"] {
  switch (view.kind) {
    case "status":
    case "track":
    case "episode":
      return view.kind;
  }

  const unhandledView: never = view;
  return unhandledView;
}

function marqueeKind(
  decision: MarqueeOverflowDecision,
): MarqueeOverflowDecision["kind"] {
  switch (decision.kind) {
    case "contained":
    case "overflowing":
      return decision.kind;
  }

  const unhandledDecision: never = decision;
  return unhandledDecision;
}

void invalidTrackMetadata;
void invalidIdentity;
void invalidMarqueeDecision;
void metadataKind(metadata);
void marqueeKind(marqueeDecision);
void trackMetadata;
void episodeMetadata;
void statusMetadata;
