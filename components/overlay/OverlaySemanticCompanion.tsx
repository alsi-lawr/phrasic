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
import type { OverlayPresentation } from "./overlay-presentation.ts";

type OverlaySemanticCompanionProps = {
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlaySemanticCompanion({
  presentation,
  snapshot,
}: OverlaySemanticCompanionProps): ReactElement {
  return (
    <section aria-labelledby={presentation.headingId} className="sr-only">
      <SemanticDetails presentation={presentation} snapshot={snapshot} />
      <PoliteOverlayAnnouncement
        presentation={presentation}
        snapshot={snapshot}
      />
    </section>
  );
}

type SemanticDetailsProps = {
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function SemanticDetails({
  presentation,
  snapshot,
}: SemanticDetailsProps): ReactElement {
  return (
    <dl>
      <DefinitionsForSnapshot presentation={presentation} snapshot={snapshot} />
    </dl>
  );
}

type DefinitionsForSnapshotProps = {
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function DefinitionsForSnapshot({
  presentation,
  snapshot,
}: DefinitionsForSnapshotProps): ReactElement {
  switch (snapshot.kind) {
    case "fatal":
      return (
        <FatalDefinitions
          presentation={presentation}
          reason={snapshot.reason}
        />
      );
    case "playback":
      return (
        <PlaybackDefinitions
          presentation={presentation}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type FatalDefinitionsProps = {
  readonly presentation: OverlayPresentation;
  readonly reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"];
};

function FatalDefinitions({
  presentation,
  reason,
}: FatalDefinitionsProps): ReactElement {
  switch (reason) {
    case "browser-capability-unavailable":
      return (
        <StatusDefinitions
          details="The browser display could not be initialized."
          guidance="A required browser playback capability is unavailable."
          label="OVERLAY UNAVAILABLE"
          message={`This browser cannot start ${presentation.displayName} playback.`}
        />
      );
    case "configuration-unavailable":
      return (
        <StatusDefinitions
          details="The browser display could not be initialized."
          guidance={`The public ${presentation.displayName} configuration could not be loaded.`}
          label="OVERLAY UNAVAILABLE"
          message="The browser configuration is unavailable."
        />
      );
  }

  return unreachable(reason);
}

type PlaybackDefinitionsProps = {
  readonly presentation: OverlayPresentation;
  readonly state: PlaybackState;
};

function PlaybackDefinitions({
  presentation,
  state,
}: PlaybackDefinitionsProps): ReactElement {
  switch (state.kind) {
    case "initializing":
      return (
        <StatusDefinitions
          details={`${presentation.displayName} Now Playing`}
          guidance="Preparing the display connection."
          label="INITIALIZING"
          message={`Starting ${presentation.displayName} playback.`}
        />
      );
    case "authorization-required":
      return (
        <StatusDefinitions
          details={`Connect ${presentation.displayName} to continue.`}
          guidance={authorizationRequiredContext(
            state.reason,
            presentation.displayName,
          )}
          label={`CONNECT ${providerLabel(presentation)}`}
          message={`${presentation.displayName} authorization is required.`}
        />
      );
    case "authorizing":
      return (
        <StatusDefinitions
          details={`Finish authorization in ${presentation.displayName}.`}
          guidance="This display will reconnect after authorization completes."
          label="AUTHORIZING"
          message={`Waiting for ${presentation.displayName} authorization.`}
        />
      );
    case "empty":
      return (
        <StatusDefinitions
          details={`${presentation.displayName} is connected.`}
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
          message={`${presentation.displayName} is playing.`}
        />
      );
    case "paused":
      return (
        <ItemDefinitions
          freshness="Paused playback item."
          item={state.snapshot.item}
          label="PAUSED"
          message={`${presentation.displayName} is paused.`}
        />
      );
    case "unsupported":
      return (
        <StatusDefinitions
          details={unsupportedSubtitle(state.reason, presentation.displayName)}
          guidance={`Play a supported ${presentation.displayName} track or episode.`}
          label="UNSUPPORTED"
          message={`The current ${presentation.displayName} item cannot be displayed.`}
        />
      );
    case "reconnecting":
      return (
        <ReconnectingDefinitions presentation={presentation} state={state} />
      );
    case "failure":
      return (
        <StatusDefinitions
          details={playbackFailureSubtitle(
            state.error,
            presentation.displayName,
          )}
          guidance={`Use setup mode to retry playback or disconnect ${presentation.displayName}.`}
          label="PLAYBACK UNAVAILABLE"
          message="Playback updates failed."
        />
      );
  }

  return unreachable(state);
}

type ReconnectingDefinitionsProps = {
  readonly presentation: OverlayPresentation;
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingDefinitions({
  presentation,
  state,
}: ReconnectingDefinitionsProps): ReactElement {
  switch (state.lastItem.kind) {
    case "available":
      return (
        <ItemDefinitions
          freshness={`Last known playback item while ${presentation.displayName} reconnects.`}
          item={state.lastItem.item}
          label="RECONNECTING"
          message={`Reconnecting to ${presentation.displayName}.`}
        />
      );
    case "unavailable":
      return (
        <StatusDefinitions
          details="No previous item is available."
          guidance={`Waiting for ${presentation.displayName} playback updates to return.`}
          label="RECONNECTING"
          message={`Reconnecting to ${presentation.displayName}.`}
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
          <MetadataDefinition
            term="Album"
            value={item.collection.title.value}
          />
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
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function PoliteOverlayAnnouncement({
  presentation,
  snapshot,
}: PoliteOverlayAnnouncementProps): ReactElement {
  const announcementKey = overlayLiveAnnouncementKey(snapshot);
  const message = announcementMessageForSnapshot(snapshot, presentation);

  return (
    <p aria-atomic="true" aria-live="polite" role="status">
      <span key={announcementKey}>{message}</span>
    </p>
  );
}

function announcementMessageForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
  presentation: OverlayPresentation,
): string {
  switch (snapshot.kind) {
    case "fatal":
      return fatalAnnouncementMessage(snapshot.reason, presentation);
    case "playback":
      return announcementMessageForPlaybackState(snapshot.state, presentation);
  }

  return unreachable(snapshot);
}

function fatalAnnouncementMessage(
  reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"],
  presentation: OverlayPresentation,
): string {
  switch (reason) {
    case "browser-capability-unavailable":
      return `This browser cannot start ${presentation.displayName} playback. The browser display could not be initialized. A required browser playback capability is unavailable.`;
    case "configuration-unavailable":
      return `The browser configuration is unavailable. The browser display could not be initialized. The public ${presentation.displayName} configuration could not be loaded.`;
  }

  return unreachable(reason);
}

function announcementMessageForPlaybackState(
  state: PlaybackState,
  presentation: OverlayPresentation,
): string {
  switch (state.kind) {
    case "initializing":
      return `Starting ${presentation.displayName} playback. ${presentation.displayName} Now Playing Preparing the display connection.`;
    case "authorization-required":
      return `${presentation.displayName} authorization is required. Connect ${presentation.displayName} to continue. ${authorizationRequiredContext(state.reason, presentation.displayName)}`;
    case "authorizing":
      return `Waiting for ${presentation.displayName} authorization. Finish authorization in ${presentation.displayName}. This display will reconnect after authorization completes.`;
    case "empty":
      return `No track or episode is currently playing. ${presentation.displayName} is connected. Start a track or episode to populate the overlay.`;
    case "playing":
      return itemAnnouncementMessage("Now playing", state.snapshot.item);
    case "paused":
      return itemAnnouncementMessage("Playback paused", state.snapshot.item);
    case "unsupported":
      return `The current ${presentation.displayName} item cannot be displayed. ${unsupportedSubtitle(state.reason, presentation.displayName)} Play a supported ${presentation.displayName} track or episode.`;
    case "reconnecting":
      return reconnectingAnnouncementMessage(state, presentation);
    case "failure":
      return `Playback updates failed. ${playbackFailureSubtitle(state.error, presentation.displayName)} Use setup mode to retry playback or disconnect ${presentation.displayName}.`;
  }

  return unreachable(state);
}

function reconnectingAnnouncementMessage(
  state: Extract<PlaybackState, { readonly kind: "reconnecting" }>,
  presentation: OverlayPresentation,
): string {
  switch (state.lastItem.kind) {
    case "available":
      return itemAnnouncementMessage(
        `Reconnecting to ${presentation.displayName}. Last known`,
        state.lastItem.item,
      );
    case "unavailable":
      return `Reconnecting to ${presentation.displayName}. No previous item is available. Waiting for ${presentation.displayName} playback updates to return.`;
  }

  return unreachable(state.lastItem);
}

function itemAnnouncementMessage(prefix: string, item: NowPlayingItem): string {
  switch (item.kind) {
    case "track":
      return `${prefix} track: ${item.title.value}. Artists: ${artistNames(item)}. Album: ${item.collection.title.value}.`;
    case "episode":
      return `${prefix} episode: ${item.title.value}. Show: ${item.show.title.value}. Publisher: ${item.show.publisher.value}.`;
  }

  return unreachable(item);
}

function authorizationRequiredContext(
  reason: AuthorizationRequiredReason,
  displayName: string,
): string {
  switch (reason) {
    case "authorization-expired":
      return `${displayName} authorization expired.`;
    case "authorization-revoked":
      return `${displayName} authorization was revoked.`;
    case "not-authorized":
      return `${displayName} is not connected in this browser profile.`;
    case "permission-required":
      return `${displayName} playback permission is required.`;
  }

  return unreachable(reason);
}

function unsupportedSubtitle(
  reason: UnsupportedPlaybackReason,
  displayName: string,
): string {
  switch (reason) {
    case "advertisement":
      return `${displayName} is playing an advertisement.`;
    case "local-item":
      return `${displayName} is playing a local item.`;
    case "unknown-item-type":
      return `${displayName} returned an unsupported item type.`;
  }

  return unreachable(reason);
}

function playbackFailureSubtitle(
  failure: PlaybackFailure,
  displayName: string,
): string {
  switch (failure.kind) {
    case "authorization-failed":
      return authorizationFailureSubtitle(failure.reason, displayName);
    case "provider-failed":
      return providerFailureSubtitle(failure.reason, displayName);
  }

  return unreachable(failure);
}

function authorizationFailureSubtitle(
  reason: "authorization-denied" | "code-exchange-rejected",
  displayName: string,
): string {
  switch (reason) {
    case "authorization-denied":
      return `${displayName} authorization was denied.`;
    case "code-exchange-rejected":
      return `${displayName} rejected the authorization code.`;
  }

  return unreachable(reason);
}

function providerFailureSubtitle(
  reason: "malformed-response" | "network" | "rate-limited" | "server-error",
  displayName: string,
): string {
  switch (reason) {
    case "malformed-response":
      return `${displayName} returned an unreadable playback response.`;
    case "network":
      return `The ${displayName} connection is unavailable.`;
    case "rate-limited":
      return `${displayName} temporarily limited playback requests.`;
    case "server-error":
      return `${displayName} returned a server error.`;
  }

  return unreachable(reason);
}

function artistNames(
  item: Extract<NowPlayingItem, { readonly kind: "track" }>,
): string {
  return item.artists.map((artist): string => artist.name.value).join(", ");
}

function providerLabel(presentation: OverlayPresentation): string {
  return presentation.displayName.toLocaleUpperCase("en-US");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay semantic value: ${String(value)}`);
}
