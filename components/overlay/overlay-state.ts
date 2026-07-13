import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { PlaybackState } from "../../domain/playback.ts";

export type FatalInitializationFailureReason = Extract<
  BrowserPlaybackApplicationSnapshot,
  { readonly kind: "fatal" }
>["reason"];

type FatalInitializationFailureOverlayState = {
  readonly kind: "fatal-initialization-failure";
  readonly reason: FatalInitializationFailureReason;
};

export type OverlayUiState =
  FatalInitializationFailureOverlayState | PlaybackState;

export type OverlayStatusView = {
  readonly label: string;
  readonly message: string;
};

export function overlayUiStateForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
): OverlayUiState {
  switch (snapshot.kind) {
    case "fatal":
      return fatalInitializationFailureOverlayState(snapshot.reason);
    case "playback":
      return snapshot.state;
  }

  return unreachable(snapshot);
}

function fatalInitializationFailureOverlayState(
  reason: FatalInitializationFailureReason,
): FatalInitializationFailureOverlayState {
  return Object.freeze({
    kind: "fatal-initialization-failure",
    reason,
  });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay state: ${String(value)}`);
}
