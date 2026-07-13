import type { ComponentProps } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import SpotifyNowPlayingOverlay from "../../components/overlay/SpotifyNowPlayingOverlay.tsx";
import {
  resolveOverlayGeometry,
  type OverlayDisplayDiagnostic,
  type OverlaySetupMode,
} from "../../components/overlay/overlay-geometry.ts";
import { OverlaySetupDiagnostic } from "../../components/overlay/OverlaySetupDiagnostic.tsx";
import type {
  OverlayControlPlan,
  OverlayUiState,
} from "../../components/overlay/overlay-state.ts";

declare const application: BrowserPlaybackApplication;

const props: ComponentProps<typeof SpotifyNowPlayingOverlay> = Object.freeze({
  application,
});
const geometry = resolveOverlayGeometry(new URLSearchParams("width=1920"));
declare const overlayState: OverlayUiState;
declare const controlPlan: OverlayControlPlan;
declare const setupMode: OverlaySetupMode;
declare const displayDiagnostic: OverlayDisplayDiagnostic;
const noDisplayDiagnostic: OverlayDisplayDiagnostic = Object.freeze({
  kind: "none",
});
const invalidDisplayDiagnostic: OverlayDisplayDiagnostic = Object.freeze({
  kind: "invalid-display-query",
  reason: "fractional-display-width",
});
const setupDiagnosticProps: ComponentProps<typeof OverlaySetupDiagnostic> =
  Object.freeze({ diagnostic: displayDiagnostic });

// @ts-expect-error The overlay application prop remains readonly.
props.application = application;
// @ts-expect-error Validated display widths expose no writable raw value.
geometry.width.value = 320;
// @ts-expect-error Derived display heights expose no writable raw value.
geometry.height.value = 200;
// @ts-expect-error A reconnecting UI state always carries an explicit last item state.
const invalidReconnectingState: OverlayUiState = { kind: "reconnecting" };
// @ts-expect-error Setup mode is discriminated instead of a boolean behavior flag.
const invalidSetupMode: OverlaySetupMode = { kind: "setup", enabled: true };
const invalidDisplayDiagnosticReason: OverlayDisplayDiagnostic = {
  kind: "invalid-display-query",
  // @ts-expect-error Display diagnostics only expose declared safe query failure reasons.
  reason: "user-provided-query",
};
// @ts-expect-error Diagnostic presence is a discriminated union, not a nullable flag.
const nullableDisplayDiagnostic: OverlayDisplayDiagnostic = null;
// @ts-expect-error Diagnostic presence is a discriminated union, not a string flag.
const stringDisplayDiagnostic: OverlayDisplayDiagnostic =
  "invalid-display-query";
// @ts-expect-error Geometry diagnostics remain readonly.
geometry.diagnostic = noDisplayDiagnostic;
// @ts-expect-error Setup diagnostic props remain readonly.
setupDiagnosticProps.diagnostic = noDisplayDiagnostic;
// @ts-expect-error Retry controls are only available together with disconnect controls.
const invalidControlPlan: OverlayControlPlan = { kind: "retry" };

function overlayStateKind(state: OverlayUiState): OverlayUiState["kind"] {
  switch (state.kind) {
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
    case "reconnecting":
    case "failure":
    case "fatal-initialization-failure":
      return state.kind;
  }

  const unhandledState: never = state;
  return unhandledState;
}

function overlayControlPlanKind(
  plan: OverlayControlPlan,
): OverlayControlPlan["kind"] {
  switch (plan.kind) {
    case "none":
    case "connect":
    case "disconnect":
    case "reconnect-and-disconnect":
    case "retry-and-disconnect":
      return plan.kind;
  }

  const unhandledPlan: never = plan;
  return unhandledPlan;
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

void props;
void geometry;
void invalidReconnectingState;
void invalidSetupMode;
void invalidDisplayDiagnosticReason;
void nullableDisplayDiagnostic;
void stringDisplayDiagnostic;
void invalidControlPlan;
void overlayStateKind(overlayState);
void overlayControlPlanKind(controlPlan);
void overlayDisplayDiagnosticKind(displayDiagnostic);
void noDisplayDiagnostic;
void invalidDisplayDiagnostic;
void setupDiagnosticProps;
void setupMode;
