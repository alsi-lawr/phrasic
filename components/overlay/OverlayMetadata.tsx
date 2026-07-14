import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type {
  AuthorizationRequiredReason,
  NowPlayingItem,
  PlaybackFailure,
  PlaybackState,
  UnsupportedPlaybackReason,
} from "../../domain/playback.ts";
import { MarqueeText } from "./MarqueeText.tsx";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
import {
  overlayMetadataLayout,
  type OverlayTextLineLayout,
  type OverlayTextMeasurementReporter,
} from "./overlay-layout.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";

type OverlayMetadataProps = {
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayMetadata({
  availableWidth,
  motion,
  onTextMeasurement,
  snapshot,
}: OverlayMetadataProps): ReactElement {
  const animationIdentityKey = overlayAnimationIdentityKey(snapshot);

  return (
    <g>
      <MetadataClipPaths availableWidth={availableWidth} />
      <MetadataForSnapshot
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        snapshot={snapshot}
      />
    </g>
  );
}

type MetadataContentProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
};

type MetadataForSnapshotProps = MetadataContentProps & {
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function MetadataForSnapshot({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  snapshot,
}: MetadataForSnapshotProps): ReactElement {
  switch (snapshot.kind) {
    case "fatal":
      return (
        <FatalMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          reason={snapshot.reason}
        />
      );
    case "playback":
      return (
        <PlaybackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type FatalMetadataProps = MetadataContentProps & {
  readonly reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"];
};

function FatalMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  reason,
}: FatalMetadataProps): ReactElement {
  switch (reason) {
    case "browser-capability-unavailable":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="OVERLAY UNAVAILABLE"
          context="A required browser playback capability is unavailable."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="The browser display could not be initialized."
          title="This browser cannot start Spotify playback."
        />
      );
    case "configuration-unavailable":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="OVERLAY UNAVAILABLE"
          context="The public Spotify configuration could not be loaded."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="The browser display could not be initialized."
          title="The browser configuration is unavailable."
        />
      );
  }

  return unreachable(reason);
}

type PlaybackMetadataProps = MetadataContentProps & {
  readonly state: PlaybackState;
};

function PlaybackMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  state,
}: PlaybackMetadataProps): ReactElement {
  switch (state.kind) {
    case "initializing":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="INITIALIZING"
          context="Preparing the display connection."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="Spotify Now Playing"
          title="Starting Spotify playback."
        />
      );
    case "authorization-required":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="CONNECT SPOTIFY"
          context={authorizationRequiredContext(state.reason)}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="Connect Spotify to continue."
          title="Spotify authorization is required."
        />
      );
    case "authorizing":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="AUTHORIZING"
          context="This display will reconnect after authorization completes."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="Finish authorization in Spotify."
          title="Waiting for Spotify authorization."
        />
      );
    case "empty":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="NOTHING PLAYING"
          context="Start a track or episode to populate the overlay."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="Spotify is connected."
          title="No track or episode is currently playing."
        />
      );
    case "playing":
      return (
        <ItemMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context="NOW PLAYING · TRACK"
          episodeContext="NOW PLAYING · EPISODE"
          item={state.snapshot.item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "paused":
      return (
        <ItemMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context="PAUSED · TRACK"
          episodeContext="PAUSED · EPISODE"
          item={state.snapshot.item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "unsupported":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="UNSUPPORTED"
          context="Play a supported Spotify track or episode."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle={unsupportedSubtitle(state.reason)}
          title="The current Spotify item cannot be displayed."
        />
      );
    case "reconnecting":
      return (
        <ReconnectingMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          state={state}
        />
      );
    case "failure":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="PLAYBACK UNAVAILABLE"
          context="Use setup mode to retry playback or disconnect Spotify."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle={playbackFailureSubtitle(state.error)}
          title="Playback updates failed."
        />
      );
  }

  return unreachable(state);
}

type ReconnectingMetadataProps = MetadataContentProps & {
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  state,
}: ReconnectingMetadataProps): ReactElement {
  switch (state.lastItem.kind) {
    case "available":
      return (
        <ItemMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context="STALE TRACK"
          episodeContext="STALE EPISODE"
          item={state.lastItem.item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "unavailable":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="RECONNECTING"
          context="Waiting for Spotify playback updates to return."
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="No previous item is available."
          title="Reconnecting to Spotify."
        />
      );
  }

  return unreachable(state.lastItem);
}

type ItemMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly episodeContext: string;
  readonly item: NowPlayingItem;
};

function ItemMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  episodeContext,
  item,
  motion,
  onTextMeasurement,
}: ItemMetadataProps): ReactElement {
  switch (item.kind) {
    case "track":
      return (
        <TrackMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context={context}
          item={item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
    case "episode":
      return (
        <EpisodeMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          context={episodeContext}
          item={item}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
        />
      );
  }

  return unreachable(item);
}

type StatusMetadataProps = MetadataContentProps & {
  readonly category: string;
  readonly context: string;
  readonly subtitle: string;
  readonly title: string;
};

function StatusMetadata({
  animationIdentityKey,
  availableWidth,
  category,
  context,
  motion,
  onTextMeasurement,
  subtitle,
  title,
}: StatusMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusLabelLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={category}
        textClass="font-overlay-display fill-overlay-status text-overlay-status-size font-semibold tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusTitleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={title}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusDetailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={subtitle}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.statusContextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

type TrackMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly item: Extract<NowPlayingItem, { readonly kind: "track" }>;
};

function TrackMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  item,
  motion,
  onTextMeasurement,
}: TrackMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.creatorLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={artistNames(item)}
        textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.title.value}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`ALBUM · ${item.collection.title.value}`}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

type EpisodeMetadataProps = MetadataContentProps & {
  readonly context: string;
  readonly item: Extract<NowPlayingItem, { readonly kind: "episode" }>;
};

function EpisodeMetadata({
  animationIdentityKey,
  availableWidth,
  context,
  item,
  motion,
  onTextMeasurement,
}: EpisodeMetadataProps): ReactElement {
  return (
    <>
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.creatorLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.show.publisher.value}
        textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.title.value}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`SHOW · ${item.show.title.value}`}
        textClass="font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.contextLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={context}
        textClass="font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context"
      />
    </>
  );
}

type MetadataMarqueeLineProps = {
  readonly animationIdentityKey: string;
  readonly availableWidth: number;
  readonly line: OverlayTextLineLayout;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly text: string;
  readonly textClass: string;
};

function MetadataMarqueeLine({
  animationIdentityKey,
  availableWidth,
  line,
  motion,
  onTextMeasurement,
  text,
  textClass,
}: MetadataMarqueeLineProps): ReactElement {
  return (
    <MarqueeText
      animationIdentityKey={animationIdentityKey}
      availableWidth={availableWidth}
      clipPathId={line.clipPathId}
      measurementIdentity={animationIdentityKey}
      measurementLine={line.line}
      motion={motion}
      onTextMeasurement={onTextMeasurement}
      text={text}
      textClass={textClass}
      x={overlayMetadataLayout.x}
      y={line.y}
    />
  );
}

type MetadataClipPathsProps = {
  readonly availableWidth: number;
};

function MetadataClipPaths({
  availableWidth,
}: MetadataClipPathsProps): ReactElement {
  return (
    <defs>
      <MetadataClipPath
        line={overlayMetadataLayout.creatorLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.titleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.detailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.contextLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusLabelLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusTitleLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusDetailLine}
        width={availableWidth}
      />
      <MetadataClipPath
        line={overlayMetadataLayout.statusContextLine}
        width={availableWidth}
      />
    </defs>
  );
}

type MetadataClipPathProps = {
  readonly line: OverlayTextLineLayout;
  readonly width: number;
};

function MetadataClipPath({
  line,
  width,
}: MetadataClipPathProps): ReactElement {
  return (
    <clipPath id={line.clipPathId} clipPathUnits="userSpaceOnUse">
      <rect
        x={overlayMetadataLayout.x}
        y={line.clipY}
        width={width}
        height={line.clipHeight}
      />
    </clipPath>
  );
}

function authorizationRequiredContext(
  reason: AuthorizationRequiredReason,
): string {
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
  throw new Error(`Unexpected overlay metadata value: ${String(value)}`);
}
