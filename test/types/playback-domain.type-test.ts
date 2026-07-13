import {
  AccessToken,
  AccessTokenExpiresInSeconds,
  AccessTokenRefreshDelayMilliseconds,
  AuthorizationCode,
  availableOriginalArtwork,
  Collection,
  Creator,
  DisplayText,
  OriginalArtworkUrl,
  PlaybackDurationMilliseconds,
  PlaybackPollDelayMilliseconds,
  PlaybackPositionMilliseconds,
  ProviderCollectionId,
  ProviderId,
  ProviderItemId,
  ProviderLink,
  RefreshToken,
  TrackItem,
  type Result,
} from "../../domain/playback.ts";

const providerId = expectSuccess(ProviderId.create("spotify"));
const itemId = expectSuccess(ProviderItemId.create("track-1"));
const collectionId = expectSuccess(ProviderCollectionId.create("collection-1"));
const accessToken = expectSuccess(AccessToken.create("access-1"));
const authorizationCode = expectSuccess(AuthorizationCode.create("code-1"));
const refreshToken = expectSuccess(RefreshToken.create("refresh-1"));
const expiresIn = expectSuccess(AccessTokenExpiresInSeconds.create(3_600));
const refreshDelay =
  AccessTokenRefreshDelayMilliseconds.fromExpiresInSeconds(expiresIn);
const pollDelay = expectSuccess(PlaybackPollDelayMilliseconds.create(5_000));
const position = expectSuccess(PlaybackPositionMilliseconds.create(1_000));
const duration = expectSuccess(PlaybackDurationMilliseconds.create(3_000));
const text = expectSuccess(DisplayText.create("Track title"));
const artwork = availableOriginalArtwork(
  expectSuccess(
    OriginalArtworkUrl.create("https://spotify.example/artwork.jpg"),
  ),
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
// @ts-expect-error Item IDs cannot be used as provider IDs.
const itemAsProviderId: ProviderId = itemId;
// @ts-expect-error Collection IDs cannot be used as item IDs.
const collectionAsItemId: ProviderItemId = collectionId;
// @ts-expect-error Authorization codes cannot be used as refresh tokens.
const codeAsRefreshToken: RefreshToken = authorizationCode;
// @ts-expect-error Refresh tokens cannot be used as access tokens.
const refreshAsAccessToken: AccessToken = refreshToken;
// @ts-expect-error Token lifetime seconds cannot be used as scheduler milliseconds.
const expiresAsRefreshDelay: AccessTokenRefreshDelayMilliseconds = expiresIn;
// @ts-expect-error Scheduler milliseconds cannot be used as token lifetime seconds.
const refreshDelayAsExpires: AccessTokenExpiresInSeconds = refreshDelay;
// @ts-expect-error Playback durations cannot be used as playback positions.
const durationAsPosition: PlaybackPositionMilliseconds = duration;
// @ts-expect-error Validated values expose no writable raw value.
providerId.value = "other-provider";
// @ts-expect-error Track fields are readonly after construction.
track.title = text;
// @ts-expect-error Track artist collections are readonly after construction.
track.artists.push(creator);

void plainStringProviderId;
void itemAsProviderId;
void collectionAsItemId;
void codeAsRefreshToken;
void refreshAsAccessToken;
void expiresAsRefreshDelay;
void refreshDelayAsExpires;
void durationAsPosition;
void position;
void accessToken;
void expiresIn;
void refreshDelay;
void pollDelay;
void refreshToken;
type AssertFalse<Value extends false> = Value;

const playbackPollDelayCannotBeUsedAsRefreshDelay: AssertFalse<
  PlaybackPollDelayMilliseconds extends AccessTokenRefreshDelayMilliseconds
    ? true
    : false
> = false;

const refreshDelayCannotBeUsedAsPlaybackPollDelay: AssertFalse<
  AccessTokenRefreshDelayMilliseconds extends PlaybackPollDelayMilliseconds
    ? true
    : false
> = false;

void playbackPollDelayCannotBeUsedAsRefreshDelay;
void refreshDelayCannotBeUsedAsPlaybackPollDelay;

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful domain result");
}
