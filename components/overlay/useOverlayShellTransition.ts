import { useEffect, useReducer, useRef } from "react";
import type { OverlayMotionDecision } from "./overlay-motion.ts";

export type OverlayShellTransitionPhase = "collapsing" | "opening" | "stable";

const shellTransitionDurationMilliseconds = 1_000;

export type OverlayTransitionSnapshot<Snapshot> = {
  readonly identity: string;
  readonly snapshot: Snapshot;
};

type OverlayShellTransitionState<Snapshot> = {
  readonly identity: string;
  readonly phase: OverlayShellTransitionPhase;
  readonly snapshot: Snapshot;
};

type OverlayShellTransitionAction<Snapshot> =
  | { readonly kind: "begin-collapse" }
  | { readonly kind: "finish-opening" }
  | {
      readonly kind: "show-snapshot";
      readonly current: OverlayTransitionSnapshot<Snapshot>;
    }
  | {
      readonly kind: "synchronize";
      readonly current: OverlayTransitionSnapshot<Snapshot>;
    };

export type OverlayShellTransition<Snapshot> = {
  readonly completeWidthTransition: () => void;
  readonly identity: string;
  readonly phase: OverlayShellTransitionPhase;
  readonly snapshot: Snapshot;
};

export function useOverlayShellTransition<Snapshot>(
  current: OverlayTransitionSnapshot<Snapshot>,
  motion: OverlayMotionDecision,
): OverlayShellTransition<Snapshot> {
  const [state, dispatch] = useReducer(
    overlayShellTransitionReducer<Snapshot>,
    current,
    initialOverlayShellTransitionState,
  );
  const currentIdentity = current.identity;
  const currentSnapshot = current.snapshot;
  const currentRef = useRef(current);

  useEffect(() => {
    currentRef.current = {
      identity: currentIdentity,
      snapshot: currentSnapshot,
    };
  }, [currentIdentity, currentSnapshot]);

  useEffect(() => {
    if (motion.kind === "reduced" || state.phase === "stable") {
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      switch (state.phase) {
        case "collapsing":
          dispatch({
            kind: "show-snapshot",
            current: currentRef.current,
          });
          return;
        case "opening":
          dispatch(
            currentRef.current.identity === state.identity
              ? { kind: "finish-opening" }
              : { kind: "begin-collapse" },
          );
          return;
      }
    }, shellTransitionDurationMilliseconds);

    return () => globalThis.clearTimeout(timeout);
  }, [currentIdentity, motion.kind, state.identity, state.phase]);

  if (
    motion.kind === "reduced" &&
    (state.phase !== "stable" || currentIdentity !== state.identity)
  ) {
    const synchronized = {
      identity: currentIdentity,
      snapshot: currentSnapshot,
    };
    dispatch({ kind: "synchronize", current: synchronized });
    return immediateOverlayShellTransition(synchronized);
  }

  if (
    motion.kind === "enabled" &&
    state.phase === "stable" &&
    currentIdentity !== state.identity
  ) {
    dispatch({ kind: "begin-collapse" });
  }

  const completeWidthTransition = (): void => {
    switch (state.phase) {
      case "collapsing":
        dispatch({
          kind: "show-snapshot",
          current: {
            identity: currentIdentity,
            snapshot: currentSnapshot,
          },
        });
        return;
      case "opening":
        dispatch(
          currentIdentity === state.identity
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
    identity: state.identity,
    phase: state.phase,
    snapshot:
      state.identity === currentIdentity ? currentSnapshot : state.snapshot,
  };
}

function initialOverlayShellTransitionState<Snapshot>(
  current: OverlayTransitionSnapshot<Snapshot>,
): OverlayShellTransitionState<Snapshot> {
  return { ...current, phase: "stable" };
}

function immediateOverlayShellTransition<Snapshot>(
  current: OverlayTransitionSnapshot<Snapshot>,
): OverlayShellTransition<Snapshot> {
  return {
    completeWidthTransition: noOperation,
    identity: current.identity,
    phase: "stable",
    snapshot: current.snapshot,
  };
}

function overlayShellTransitionReducer<Snapshot>(
  state: OverlayShellTransitionState<Snapshot>,
  action: OverlayShellTransitionAction<Snapshot>,
): OverlayShellTransitionState<Snapshot> {
  switch (action.kind) {
    case "begin-collapse":
      return { ...state, phase: "collapsing" };
    case "finish-opening":
      return { ...state, phase: "stable" };
    case "show-snapshot":
      return { ...action.current, phase: "opening" };
    case "synchronize":
      return { ...action.current, phase: "stable" };
  }

  return unreachable(action);
}

function noOperation(): void {}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay shell transition: ${String(value)}`);
}
