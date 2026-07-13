import type { ReactElement, ReactNode } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { PlaybackState } from "../../domain/playback.ts";
import type { OverlaySetupMode } from "./overlay-geometry.ts";

const controlButtonClass =
  "rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

type OverlayControlActions = {
  readonly beginAuthorization: () => void;
  readonly logout: () => void;
  readonly retry: () => void;
};

type OverlayControlsProps = {
  readonly actions: OverlayControlActions;
  readonly setupMode: OverlaySetupMode;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayControls({
  actions,
  setupMode,
  snapshot,
}: OverlayControlsProps): ReactElement | null {
  switch (snapshot.kind) {
    case "fatal":
      return null;
    case "playback":
      return (
        <ControlsForPlaybackState
          actions={actions}
          setupMode={setupMode}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type ControlsForPlaybackStateProps = {
  readonly actions: OverlayControlActions;
  readonly setupMode: OverlaySetupMode;
  readonly state: PlaybackState;
};

function ControlsForPlaybackState({
  actions,
  setupMode,
  state,
}: ControlsForPlaybackStateProps): ReactElement | null {
  switch (state.kind) {
    case "initializing":
      return null;
    case "authorization-required":
      return (
        <ControlNavigation>
          <ControlButton
            label="Connect Spotify"
            onClick={actions.beginAuthorization}
          />
        </ControlNavigation>
      );
    case "authorizing":
    case "empty":
    case "playing":
    case "paused":
    case "unsupported":
      return (
        <SetupControls setupMode={setupMode}>
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </SetupControls>
      );
    case "reconnecting":
      return (
        <SetupControls setupMode={setupMode}>
          <ControlButton label="Reconnect Spotify" onClick={actions.retry} />
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </SetupControls>
      );
    case "failure":
      return (
        <SetupControls setupMode={setupMode}>
          <ControlButton label="Retry playback" onClick={actions.retry} />
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </SetupControls>
      );
  }

  return unreachable(state);
}

type SetupControlsProps = {
  readonly children: ReactNode;
  readonly setupMode: OverlaySetupMode;
};

function SetupControls({
  children,
  setupMode,
}: SetupControlsProps): ReactElement | null {
  switch (setupMode.kind) {
    case "overlay":
      return null;
    case "setup":
      return <ControlNavigation>{children}</ControlNavigation>;
  }

  return unreachable(setupMode);
}

type ControlNavigationProps = {
  readonly children: ReactNode;
};

function ControlNavigation({ children }: ControlNavigationProps): ReactElement {
  return (
    <nav
      className="m-0 flex w-full items-center gap-2 p-2"
      aria-label="Spotify playback controls"
    >
      {children}
    </nav>
  );
}

type ControlButtonProps = {
  readonly label: string;
  readonly onClick: () => void;
};

function ControlButton({ label, onClick }: ControlButtonProps): ReactElement {
  return (
    <button className={controlButtonClass} type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay controls value: ${String(value)}`);
}
