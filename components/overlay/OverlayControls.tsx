import type { ReactElement, ReactNode } from "react";
import type { OverlayControlPlan } from "./overlay-state.ts";

const controlButtonClass =
  "rounded-md border border-slate-500 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

type OverlayControlActions = {
  readonly beginAuthorization: () => void;
  readonly logout: () => void;
  readonly retry: () => void;
};

type OverlayControlsProps = {
  readonly actions: OverlayControlActions;
  readonly plan: OverlayControlPlan;
};

export function OverlayControls({
  actions,
  plan,
}: OverlayControlsProps): ReactElement | null {
  switch (plan.kind) {
    case "none":
      return null;
    case "connect":
      return (
        <ControlNavigation>
          <ControlButton
            label="Connect Spotify"
            onClick={actions.beginAuthorization}
          />
        </ControlNavigation>
      );
    case "disconnect":
      return (
        <ControlNavigation>
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </ControlNavigation>
      );
    case "reconnect-and-disconnect":
      return (
        <ControlNavigation>
          <ControlButton label="Reconnect Spotify" onClick={actions.retry} />
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </ControlNavigation>
      );
    case "retry-and-disconnect":
      return (
        <ControlNavigation>
          <ControlButton label="Retry playback" onClick={actions.retry} />
          <ControlButton label="Disconnect Spotify" onClick={actions.logout} />
        </ControlNavigation>
      );
  }

  return unreachable(plan);
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
  throw new Error(`Unexpected overlay control plan: ${String(value)}`);
}
