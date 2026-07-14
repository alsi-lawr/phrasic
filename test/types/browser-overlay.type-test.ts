import type { ComponentProps } from "react";
import type {
  BrowserPlaybackApplication,
  BrowserPlaybackApplicationSnapshot,
} from "../../browser/application.ts";
import { OverlayArtwork } from "../../components/overlay/OverlayArtwork.tsx";
import { OverlayControls } from "../../components/overlay/OverlayControls.tsx";
import { OverlayMetadata } from "../../components/overlay/OverlayMetadata.tsx";
import { OverlaySemanticCompanion } from "../../components/overlay/OverlaySemanticCompanion.tsx";
import { OverlaySetupDiagnostic } from "../../components/overlay/OverlaySetupDiagnostic.tsx";
import { OverlayVisual } from "../../components/overlay/OverlayVisual.tsx";
import { OverlayVisualSpotifyLinks } from "../../components/overlay/OverlayVisualSpotifyLinks.tsx";
import SpotifyNowPlayingOverlay from "../../components/overlay/SpotifyNowPlayingOverlay.tsx";
import {
  overlayAnimationIdentityKey,
  overlayItemIdentityKey,
  overlayLiveAnnouncementKey,
} from "../../components/overlay/overlay-identities.ts";
import {
  resolveOverlayGeometry,
  type OverlayDisplayDiagnostic,
  type OverlaySetupMode,
} from "../../components/overlay/overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";
import type { NowPlayingItem } from "../../domain/playback.ts";

declare const application: BrowserPlaybackApplication;
declare const item: NowPlayingItem;
declare const snapshot: BrowserPlaybackApplicationSnapshot;

const overlayProps: ComponentProps<typeof SpotifyNowPlayingOverlay> =
  Object.freeze({ application });
const geometry = resolveOverlayGeometry(new URLSearchParams("width=1920"));
const motion = overlayMotionDecisionForPreference(false);
const setupMode: OverlaySetupMode = resolveOverlayGeometry(
  new URLSearchParams("setup=1"),
).setupMode;
const displayDiagnostic: OverlayDisplayDiagnostic = Object.freeze({
  kind: "none",
});
const invalidDisplayDiagnostic: OverlayDisplayDiagnostic = Object.freeze({
  kind: "invalid-display-query",
  reason: "fractional-display-width",
});
const controlsProps: ComponentProps<typeof OverlayControls> = Object.freeze({
  actions: Object.freeze({
    beginAuthorization: (): void => {},
    logout: (): void => {},
    retry: (): void => {},
  }),
  setupMode,
  snapshot,
});
const artworkProps: ComponentProps<typeof OverlayArtwork> = Object.freeze({
  motion,
  snapshot,
});
const metadataProps: ComponentProps<typeof OverlayMetadata> = Object.freeze({
  availableWidth: 3_096,
  motion,
  onTextMeasurement: (): void => {},
  snapshot,
});
const semanticProps: ComponentProps<typeof OverlaySemanticCompanion> =
  Object.freeze({ snapshot });
const visualProps: ComponentProps<typeof OverlayVisual> = Object.freeze({
  geometry,
  motion,
  snapshot,
});
const visualSpotifyLinkProps: ComponentProps<typeof OverlayVisualSpotifyLinks> =
  Object.freeze({ availableWidth: 3_096, snapshot });
const setupDiagnosticProps: ComponentProps<typeof OverlaySetupDiagnostic> =
  Object.freeze({ diagnostic: displayDiagnostic });
const itemIdentity = overlayItemIdentityKey(item);
const animationIdentity = overlayAnimationIdentityKey(snapshot);
const liveAnnouncementIdentity = overlayLiveAnnouncementKey(snapshot);

// @ts-expect-error The overlay application prop remains readonly.
overlayProps.application = application;
// @ts-expect-error Validated display widths expose no writable raw value.
geometry.width.value = 320;
// @ts-expect-error Derived display heights expose no writable raw value.
geometry.height.value = 200;
// @ts-expect-error Setup mode is discriminated instead of a boolean behavior flag.
const invalidSetupMode: OverlaySetupMode = { kind: "setup", enabled: true };
const invalidDisplayDiagnosticReason: OverlayDisplayDiagnostic = {
  kind: "invalid-display-query",
  // @ts-expect-error Display diagnostics only expose declared safe query failure reasons.
  reason: "user-provided-query",
};
// @ts-expect-error Diagnostic presence is a discriminated union, not a nullable flag.
const nullableDisplayDiagnostic: OverlayDisplayDiagnostic = null;
// @ts-expect-error Overlay controls consume immutable application snapshots.
controlsProps.snapshot = snapshot;
// @ts-expect-error Artwork consumes an immutable application snapshot.
artworkProps.snapshot = snapshot;
// @ts-expect-error Metadata consumes an immutable application snapshot.
metadataProps.snapshot = snapshot;
// @ts-expect-error The semantic companion consumes an immutable application snapshot.
semanticProps.snapshot = snapshot;
// @ts-expect-error The visual overlay consumes an immutable application snapshot.
visualProps.snapshot = snapshot;
// @ts-expect-error Spotify destinations consume an immutable application snapshot.
visualSpotifyLinkProps.snapshot = snapshot;
// @ts-expect-error Setup diagnostic props remain readonly.
setupDiagnosticProps.diagnostic = displayDiagnostic;
const invalidFatalSnapshot: BrowserPlaybackApplicationSnapshot = {
  kind: "fatal",
  // @ts-expect-error Fatal application snapshots only expose declared initialization reasons.
  reason: "network-unavailable",
};

function snapshotKind(
  value: BrowserPlaybackApplicationSnapshot,
): BrowserPlaybackApplicationSnapshot["kind"] {
  switch (value.kind) {
    case "fatal":
    case "playback":
      return value.kind;
  }

  const unhandledSnapshot: never = value;
  return unhandledSnapshot;
}

function overlayDisplayDiagnosticKind(
  diagnostic: OverlayDisplayDiagnostic,
): OverlayDisplayDiagnostic["kind"] {
  switch (diagnostic.kind) {
    case "none":
    case "invalid-display-query":
      return diagnostic.kind;
  }

  const unhandledDiagnostic: never = diagnostic;
  return unhandledDiagnostic;
}

void overlayProps;
void geometry;
void invalidSetupMode;
void invalidDisplayDiagnosticReason;
void nullableDisplayDiagnostic;
void invalidFatalSnapshot;
void controlsProps;
void artworkProps;
void metadataProps;
void semanticProps;
void visualProps;
void visualSpotifyLinkProps;
void setupDiagnosticProps;
void itemIdentity;
void animationIdentity;
void liveAnnouncementIdentity;
void snapshotKind(snapshot);
void overlayDisplayDiagnosticKind(displayDiagnostic);
void invalidDisplayDiagnostic;
