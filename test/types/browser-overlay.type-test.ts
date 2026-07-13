import type { ComponentProps } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import SpotifyNowPlayingOverlay from "../../components/overlay/SpotifyNowPlayingOverlay.tsx";
import {
  resolveOverlayGeometry,
  type OverlaySetupMode,
} from "../../components/overlay/overlay-geometry.ts";
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

void props;
void geometry;
void invalidReconnectingState;
void invalidSetupMode;
void invalidControlPlan;
void overlayStateKind(overlayState);
void overlayControlPlanKind(controlPlan);
void setupMode;
