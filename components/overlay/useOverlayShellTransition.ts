import { useEffect, useReducer } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import { overlayAnimationIdentityKey } from "./overlay-identities.ts";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

export type OverlayShellTransitionPhase = "collapsing" | "opening" | "stable";

const shellTransitionDurationMilliseconds = 1_000;

type OverlayShellTransitionState = {
  readonly phase: OverlayShellTransitionPhase;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

type OverlayShellTransitionAction =
  | { readonly kind: "begin-collapse" }
  | { readonly kind: "finish-opening" }
  | {
      readonly kind: "show-snapshot";
      readonly snapshot: BrowserPlaybackApplicationSnapshot;
    }
  | {
      readonly kind: "synchronize";
      readonly snapshot: BrowserPlaybackApplicationSnapshot;
    };

export type OverlayShellTransition = {
  readonly completeWidthTransition: () => void;
  readonly phase: OverlayShellTransitionPhase;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function useOverlayShellTransition(
  snapshot: BrowserPlaybackApplicationSnapshot,
  motion: OverlayMotionDecision,
): OverlayShellTransition {
  const [state, dispatch] = useReducer(
    overlayShellTransitionReducer,
    snapshot,
    initialOverlayShellTransitionState,
  );
  const currentIdentity = overlayAnimationIdentityKey(snapshot);
  const displayedIdentity = overlayAnimationIdentityKey(state.snapshot);

  useEffect(() => {
    if (motion.kind === "reduced" || state.phase === "stable") {
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      switch (state.phase) {
        case "collapsing":
          dispatch({ kind: "show-snapshot", snapshot });
          return;
        case "opening":
          dispatch(
            currentIdentity === displayedIdentity
              ? { kind: "finish-opening" }
              : { kind: "begin-collapse" },
          );
          return;
      }
    }, shellTransitionDurationMilliseconds);

    return () => globalThis.clearTimeout(timeout);
  }, [currentIdentity, displayedIdentity, motion.kind, snapshot, state.phase]);

  if (
    motion.kind === "reduced" &&
    (state.phase !== "stable" || currentIdentity !== displayedIdentity)
  ) {
    dispatch({ kind: "synchronize", snapshot });
    return immediateOverlayShellTransition(snapshot);
  }

  if (
    motion.kind === "enabled" &&
    state.phase === "stable" &&
    currentIdentity !== displayedIdentity
  ) {
    dispatch({ kind: "begin-collapse" });
  }

  const completeWidthTransition = (): void => {
    switch (state.phase) {
      case "collapsing":
        dispatch({ kind: "show-snapshot", snapshot });
        return;
      case "opening":
        dispatch(
          currentIdentity === displayedIdentity
            ? { kind: "finish-opening" }
            : { kind: "begin-collapse" },
        );
        return;
      case "stable":
        return;
    }

    return unreachable(state.phase);
  };

  return {
    completeWidthTransition,
    phase: state.phase,
    snapshot: state.snapshot,
  };
}

function initialOverlayShellTransitionState(
  snapshot: BrowserPlaybackApplicationSnapshot,
): OverlayShellTransitionState {
  return { phase: "stable", snapshot };
}

function immediateOverlayShellTransition(
  snapshot: BrowserPlaybackApplicationSnapshot,
): OverlayShellTransition {
  return {
    completeWidthTransition: noOperation,
    phase: "stable",
    snapshot,
  };
}

function overlayShellTransitionReducer(
  state: OverlayShellTransitionState,
  action: OverlayShellTransitionAction,
): OverlayShellTransitionState {
  switch (action.kind) {
    case "begin-collapse":
      return { ...state, phase: "collapsing" };
    case "finish-opening":
      return { ...state, phase: "stable" };
    case "show-snapshot":
      return { phase: "opening", snapshot: action.snapshot };
    case "synchronize":
      return { phase: "stable", snapshot: action.snapshot };
  }

  return unreachable(action);
}

function noOperation(): void {}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay shell transition: ${String(value)}`);
}
