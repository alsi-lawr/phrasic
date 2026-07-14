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
import type { OverlayPresentation } from "./overlay-presentation.ts";

type OverlayMetadataProps = {
  readonly availableWidth: number;
  readonly motion: OverlayMotionDecision;
  readonly onTextMeasurement: OverlayTextMeasurementReporter;
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayMetadata({
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
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
        presentation={presentation}
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
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

function MetadataForSnapshot({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
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
          presentation={presentation}
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
          presentation={presentation}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type FatalMetadataProps = MetadataContentProps & {
  readonly presentation: OverlayPresentation;
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
  presentation,
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
          title={`This browser cannot start ${presentation.displayName} playback.`}
        />
      );
    case "configuration-unavailable":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="OVERLAY UNAVAILABLE"
          context={`The public ${presentation.displayName} configuration could not be loaded.`}
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
  readonly presentation: OverlayPresentation;
  readonly state: PlaybackState;
};

function PlaybackMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
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
          subtitle={`${presentation.displayName} Now Playing`}
          title={`Starting ${presentation.displayName} playback.`}
        />
      );
    case "authorization-required":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category={`CONNECT ${providerLabel(presentation)}`}
          context={authorizationRequiredContext(
            state.reason,
            presentation.displayName,
          )}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle={`Connect ${presentation.displayName} to continue.`}
          title={`${presentation.displayName} authorization is required.`}
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
          subtitle={`Finish authorization in ${presentation.displayName}.`}
          title={`Waiting for ${presentation.displayName} authorization.`}
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
          subtitle={`${presentation.displayName} is connected.`}
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
          context={`Play a supported ${presentation.displayName} track or episode.`}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle={unsupportedSubtitle(state.reason, presentation.displayName)}
          title={`The current ${presentation.displayName} item cannot be displayed.`}
        />
      );
    case "reconnecting":
      return (
        <ReconnectingMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          presentation={presentation}
          state={state}
        />
      );
    case "failure":
      return (
        <StatusMetadata
          animationIdentityKey={animationIdentityKey}
          availableWidth={availableWidth}
          category="PLAYBACK UNAVAILABLE"
          context={`Use setup mode to retry playback or disconnect ${presentation.displayName}.`}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle={playbackFailureSubtitle(
            state.error,
            presentation.displayName,
          )}
          title="Playback updates failed."
        />
      );
  }

  return unreachable(state);
}

type ReconnectingMetadataProps = MetadataContentProps & {
  readonly presentation: OverlayPresentation;
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingMetadata({
  animationIdentityKey,
  availableWidth,
  motion,
  onTextMeasurement,
  presentation,
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
          context={`Waiting for ${presentation.displayName} playback updates to return.`}
          motion={motion}
          onTextMeasurement={onTextMeasurement}
          subtitle="No previous item is available."
          title={`Reconnecting to ${presentation.displayName}.`}
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
        text={item.title}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`ALBUM · ${item.collection.title}`}
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
        text={item.show.publisher}
        textClass="font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.titleLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={item.title}
        textClass="font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"
      />
      <MetadataMarqueeLine
        animationIdentityKey={animationIdentityKey}
        availableWidth={availableWidth}
        line={overlayMetadataLayout.detailLine}
        motion={motion}
        onTextMeasurement={onTextMeasurement}
        text={`SHOW · ${item.show.title}`}
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
  return item.artists.map((artist): string => artist.name).join(", ");
}

function providerLabel(presentation: OverlayPresentation): string {
  return presentation.displayName.toLocaleUpperCase("en-US");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata value: ${String(value)}`);
}
