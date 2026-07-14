import {
  availableOriginalArtwork,
  Collection,
  Creator,
  ProviderLink,
  TrackItem,
  parseDisplayText,
  parseOriginalArtworkUrl,
  parsePlaybackDurationMilliseconds,
  parsePlaybackPositionMilliseconds,
  parseProviderCollectionId,
  parseProviderId,
  parseProviderItemId,
  type ProviderCollectionId,
  type ProviderId,
  type ProviderItemId,
  type PlaybackPositionMilliseconds,
  type Result,
} from "../../domain/playback.ts";

const providerId = expectSuccess(parseProviderId("spotify"));
const itemId = expectSuccess(parseProviderItemId("track-1"));
const collectionId = expectSuccess(parseProviderCollectionId("collection-1"));
const position = expectSuccess(parsePlaybackPositionMilliseconds(1_000));
const duration = expectSuccess(parsePlaybackDurationMilliseconds(3_000));
const text = expectSuccess(parseDisplayText("Track title"));
const artwork = availableOriginalArtwork(
  expectSuccess(parseOriginalArtworkUrl("https://spotify.example/artwork.jpg")),
);
const link = expectSuccess(
  ProviderLink.create({
    providerId,
    href: "https://spotify.example/items/track-1",
  }),
);
const creator = Creator.create({
  name: text,
  links: [link],
});
const collection = Collection.create({
  id: collectionId,
  title: text,
  links: [link],
});
const track = expectSuccess(
  TrackItem.create({
    providerId,
    itemId,
    title: text,
    artists: [creator],
    collection,
    artwork,
    links: [link],
  }),
);
// @ts-expect-error Plain strings are not validated provider IDs.
const plainStringProviderId: ProviderId = "spotify";
// @ts-expect-error Plain strings are not validated provider item IDs.
const plainStringProviderItemId: ProviderItemId = "track-1";
// @ts-expect-error Plain strings are not validated provider collection IDs.
const plainStringProviderCollectionId: ProviderCollectionId = "collection-1";
// @ts-expect-error Item IDs cannot be used as provider IDs.
const itemAsProviderId: ProviderId = itemId;
// @ts-expect-error Provider IDs cannot be used as item IDs.
const providerAsItemId: ProviderItemId = providerId;
// @ts-expect-error Provider IDs cannot be used as collection IDs.
const providerAsCollectionId: ProviderCollectionId = providerId;
// @ts-expect-error Collection IDs cannot be used as item IDs.
const collectionAsItemId: ProviderItemId = collectionId;
// @ts-expect-error Item IDs cannot be used as collection IDs.
const itemAsCollectionId: ProviderCollectionId = itemId;
// @ts-expect-error Collection IDs cannot be used as provider IDs.
const collectionAsProviderId: ProviderId = collectionId;
// @ts-expect-error Playback durations cannot be used as playback positions.
const durationAsPosition: PlaybackPositionMilliseconds = duration;
// @ts-expect-error Branded identifiers are readonly string primitives.
providerId[0] = "x";
// @ts-expect-error Track fields are readonly after construction.
track.title = text;
// @ts-expect-error Track artist collections are readonly after construction.
track.artists.push(creator);

void plainStringProviderId;
void plainStringProviderItemId;
void plainStringProviderCollectionId;
void itemAsProviderId;
void providerAsItemId;
void providerAsCollectionId;
void collectionAsItemId;
void itemAsCollectionId;
void collectionAsProviderId;
void durationAsPosition;
void position;

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}
