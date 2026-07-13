import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type {
  AuthorizationRequiredReason,
  NowPlayingItem,
  PlaybackFailure,
  PlaybackState,
  UnsupportedPlaybackReason,
} from "../../domain/playback.ts";
import { overlayLiveAnnouncementKey } from "./overlay-identities.ts";

export const overlaySemanticHeadingId = "spotify-now-playing-heading";

type OverlaySemanticCompanionProps = {
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlaySemanticCompanion({
  snapshot,
}: OverlaySemanticCompanionProps): ReactElement {
  return (
    <section aria-labelledby={overlaySemanticHeadingId} className="sr-only">
      <SemanticDetails snapshot={snapshot} />
      <PoliteOverlayAnnouncement snapshot={snapshot} />
    </section>
  );
}

type SemanticDetailsProps = {
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function SemanticDetails({ snapshot }: SemanticDetailsProps): ReactElement {
  return <dl><DefinitionsForSnapshot snapshot={snapshot} /></dl>;
}

type DefinitionsForSnapshotProps = {
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function DefinitionsForSnapshot({
  snapshot,
}: DefinitionsForSnapshotProps): ReactElement {
  switch (snapshot.kind) {
    case "fatal":
      return <FatalDefinitions reason={snapshot.reason} />;
    case "playback":
      return <PlaybackDefinitions state={snapshot.state} />;
  }

  return unreachable(snapshot);
}

type FatalDefinitionsProps = {
  readonly reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"];
};

function FatalDefinitions({ reason }: FatalDefinitionsProps): ReactElement {
  switch (reason) {
    case "browser-capability-unavailable":
      return (
        <StatusDefinitions
          details="The browser display could not be initialized."
          guidance="A required browser playback capability is unavailable."
          label="OVERLAY UNAVAILABLE"
          message="This browser cannot start Spotify playback."
        />
      );
    case "configuration-unavailable":
      return (
        <StatusDefinitions
          details="The browser display could not be initialized."
          guidance="The public Spotify configuration could not be loaded."
          label="OVERLAY UNAVAILABLE"
          message="The browser configuration is unavailable."
        />
      );
  }

  return unreachable(reason);
}

type PlaybackDefinitionsProps = {
  readonly state: PlaybackState;
};

function PlaybackDefinitions({ state }: PlaybackDefinitionsProps): ReactElement {
  switch (state.kind) {
    case "initializing":
      return (
        <StatusDefinitions
          details="Spotify Now Playing"
          guidance="Preparing the display connection."
          label="INITIALIZING"
          message="Starting Spotify playback."
        />
      );
    case "authorization-required":
      return (
        <StatusDefinitions
          details="Connect Spotify to continue."
          guidance={authorizationRequiredContext(state.reason)}
          label="CONNECT SPOTIFY"
          message="Spotify authorization is required."
        />
      );
    case "authorizing":
      return (
        <StatusDefinitions
          details="Finish authorization in Spotify."
          guidance="This display will reconnect after authorization completes."
          label="AUTHORIZING"
          message="Waiting for Spotify authorization."
        />
      );
    case "empty":
      return (
        <StatusDefinitions
          details="Spotify is connected."
          guidance="Start a track or episode to populate the overlay."
          label="NOTHING PLAYING"
          message="No track or episode is currently playing."
        />
      );
    case "playing":
      return (
        <ItemDefinitions
          freshness="Current playback item."
          item={state.snapshot.item}
          label="PLAYING"
          message="Spotify is playing."
        />
      );
    case "paused":
      return (
        <ItemDefinitions
          freshness="Paused playback item."
          item={state.snapshot.item}
          label="PAUSED"
          message="Spotify is paused."
        />
      );
    case "unsupported":
      return (
        <StatusDefinitions
          details={unsupportedSubtitle(state.reason)}
          guidance="Play a supported Spotify track or episode."
          label="UNSUPPORTED"
          message="The current Spotify item cannot be displayed."
        />
      );
    case "reconnecting":
      return <ReconnectingDefinitions state={state} />;
    case "failure":
      return (
        <StatusDefinitions
          details={playbackFailureSubtitle(state.error)}
          guidance="Use setup mode to retry playback or disconnect Spotify."
          label="PLAYBACK UNAVAILABLE"
          message="Playback updates failed."
        />
      );
  }

  return unreachable(state);
}

type ReconnectingDefinitionsProps = {
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingDefinitions({
  state,
}: ReconnectingDefinitionsProps): ReactElement {
  switch (state.lastItem.kind) {
    case "available":
      return (
        <ItemDefinitions
          freshness="Last known playback item while Spotify reconnects."
          item={state.lastItem.item}
          label="RECONNECTING"
          message="Reconnecting to Spotify."
        />
      );
    case "unavailable":
      return (
        <StatusDefinitions
          details="No previous item is available."
          guidance="Waiting for Spotify playback updates to return."
          label="RECONNECTING"
          message="Reconnecting to Spotify."
        />
      );
  }

  return unreachable(state.lastItem);
}

type StatusDefinitionsProps = {
  readonly details: string;
  readonly guidance: string;
  readonly label: string;
  readonly message: string;
};

function StatusDefinitions({
  details,
  guidance,
  label,
  message,
}: StatusDefinitionsProps): ReactElement {
  return (
    <>
      <MetadataDefinition term="Playback state" value={label} />
      <MetadataDefinition term="Status" value={message} />
      <MetadataDefinition term="Details" value={details} />
      <MetadataDefinition term="Guidance" value={guidance} />
    </>
  );
}

type ItemDefinitionsProps = {
  readonly freshness: string;
  readonly item: NowPlayingItem;
  readonly label: string;
  readonly message: string;
};

function ItemDefinitions({
  freshness,
  item,
  label,
  message,
}: ItemDefinitionsProps): ReactElement {
  switch (item.kind) {
    case "track":
      return (
        <>
          <MetadataDefinition term="Playback state" value={label} />
          <MetadataDefinition term="Status" value={message} />
          <MetadataDefinition term="Track" value={item.title.value} />
          <MetadataDefinition term="Artists" value={artistNames(item)} />
          <MetadataDefinition term="Album" value={item.collection.title.value} />
          <MetadataDefinition term="Metadata freshness" value={freshness} />
        </>
      );
    case "episode":
      return (
        <>
          <MetadataDefinition term="Playback state" value={label} />
          <MetadataDefinition term="Status" value={message} />
          <MetadataDefinition term="Episode" value={item.title.value} />
          <MetadataDefinition term="Show" value={item.show.title.value} />
          <MetadataDefinition
            term="Publisher"
            value={item.show.publisher.value}
          />
          <MetadataDefinition term="Metadata freshness" value={freshness} />
        </>
      );
  }

  return unreachable(item);
}

type MetadataDefinitionProps = {
  readonly term: string;
  readonly value: string;
};

function MetadataDefinition({
  term,
  value,
}: MetadataDefinitionProps): ReactElement {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

type PoliteOverlayAnnouncementProps = {
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function PoliteOverlayAnnouncement({
  snapshot,
}: PoliteOverlayAnnouncementProps): ReactElement {
  const announcementKey = overlayLiveAnnouncementKey(snapshot);
  const message = announcementMessageForSnapshot(snapshot);

  return (
    <p aria-atomic="true" aria-live="polite" role="status">
      <span key={announcementKey}>{message}</span>
    </p>
  );
}

function announcementMessageForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
): string {
  switch (snapshot.kind) {
    case "fatal":
      return fatalAnnouncementMessage(snapshot.reason);
    case "playback":
      return announcementMessageForPlaybackState(snapshot.state);
  }

  return unreachable(snapshot);
}

function fatalAnnouncementMessage(
  reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"],
): string {
  switch (reason) {
    case "browser-capability-unavailable":
      return "This browser cannot start Spotify playback. The browser display could not be initialized. A required browser playback capability is unavailable.";
    case "configuration-unavailable":
      return "The browser configuration is unavailable. The browser display could not be initialized. The public Spotify configuration could not be loaded.";
  }

  return unreachable(reason);
}

function announcementMessageForPlaybackState(state: PlaybackState): string {
  switch (state.kind) {
    case "initializing":
      return "Starting Spotify playback. Spotify Now Playing Preparing the display connection.";
    case "authorization-required":
      return `Spotify authorization is required. Connect Spotify to continue. ${authorizationRequiredContext(state.reason)}`;
    case "authorizing":
      return "Waiting for Spotify authorization. Finish authorization in Spotify. This display will reconnect after authorization completes.";
    case "empty":
      return "No track or episode is currently playing. Spotify is connected. Start a track or episode to populate the overlay.";
    case "playing":
      return itemAnnouncementMessage("Now playing", state.snapshot.item);
    case "paused":
      return itemAnnouncementMessage("Playback paused", state.snapshot.item);
    case "unsupported":
      return `The current Spotify item cannot be displayed. ${unsupportedSubtitle(state.reason)} Play a supported Spotify track or episode.`;
    case "reconnecting":
      return reconnectingAnnouncementMessage(state);
    case "failure":
      return `Playback updates failed. ${playbackFailureSubtitle(state.error)} Use setup mode to retry playback or disconnect Spotify.`;
  }

  return unreachable(state);
}

function reconnectingAnnouncementMessage(
  state: Extract<PlaybackState, { readonly kind: "reconnecting" }>,
): string {
  switch (state.lastItem.kind) {
    case "available":
      return itemAnnouncementMessage(
        "Reconnecting to Spotify. Last known",
        state.lastItem.item,
      );
    case "unavailable":
      return "Reconnecting to Spotify. No previous item is available. Waiting for Spotify playback updates to return.";
  }

  return unreachable(state.lastItem);
}

function itemAnnouncementMessage(
  prefix: string,
  item: NowPlayingItem,
): string {
  switch (item.kind) {
    case "track":
      return `${prefix} track: ${item.title.value}. Artists: ${artistNames(item)}. Album: ${item.collection.title.value}.`;
    case "episode":
      return `${prefix} episode: ${item.title.value}. Show: ${item.show.title.value}. Publisher: ${item.show.publisher.value}.`;
  }

  return unreachable(item);
}

function authorizationRequiredContext(reason: AuthorizationRequiredReason): string {
  switch (reason) {
    case "authorization-expired":
      return "Spotify authorization expired.";
    case "authorization-revoked":
      return "Spotify authorization was revoked.";
    case "not-authorized":
      return "Spotify is not connected in this browser profile.";
    case "permission-required":
      return "Spotify playback permission is required.";
  }

  return unreachable(reason);
}

function unsupportedSubtitle(reason: UnsupportedPlaybackReason): string {
  switch (reason) {
    case "advertisement":
      return "Spotify is playing an advertisement.";
    case "local-item":
      return "Spotify is playing a local item.";
    case "unknown-item-type":
      return "Spotify returned an unsupported item type.";
  }

  return unreachable(reason);
}

function playbackFailureSubtitle(failure: PlaybackFailure): string {
  switch (failure.kind) {
    case "authorization-failed":
      return authorizationFailureSubtitle(failure.reason);
    case "provider-failed":
      return providerFailureSubtitle(failure.reason);
  }

  return unreachable(failure);
}

function authorizationFailureSubtitle(
  reason: "authorization-denied" | "code-exchange-rejected",
): string {
  switch (reason) {
    case "authorization-denied":
      return "Spotify authorization was denied.";
    case "code-exchange-rejected":
      return "Spotify rejected the authorization code.";
  }

  return unreachable(reason);
}

function providerFailureSubtitle(
  reason: "malformed-response" | "network" | "rate-limited" | "server-error",
): string {
  switch (reason) {
    case "malformed-response":
      return "Spotify returned an unreadable playback response.";
    case "network":
      return "The Spotify connection is unavailable.";
    case "rate-limited":
      return "Spotify temporarily limited playback requests.";
    case "server-error":
      return "Spotify returned a server error.";
  }

  return unreachable(reason);
}

function artistNames(
  item: Extract<NowPlayingItem, { readonly kind: "track" }>,
): string {
  return item.artists.map((artist): string => artist.name.value).join(", ");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay semantic value: ${String(value)}`);
}
