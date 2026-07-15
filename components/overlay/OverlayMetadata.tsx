import type { ReactElement } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { PlaybackState } from "../../domain/playback.ts";
import {
  authorizationRequiredContext,
  playbackFailureSubtitle,
  providerLabel,
  unsupportedSubtitle,
} from "./overlay-copy.ts";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
import { type OverlayTextMeasurementReporter } from "./overlay-layout.ts";
import { type OverlayMotionDecision } from "./overlay-motion.ts";
import type { OverlayPresentation } from "./overlay-presentation.ts";
import { MetadataClipPaths } from "./OverlayMetadataClipPaths.tsx";
import { ItemMetadata } from "./OverlayItemMetadata.tsx";
import { StatusMetadata } from "./OverlayStatusMetadata.tsx";

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

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay metadata value: ${String(value)}`);
}
