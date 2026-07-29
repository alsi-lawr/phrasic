import { useState, useSyncExternalStore } from "react";

export const reducedMotionMediaQuery = "(prefers-reduced-motion: reduce)";

export type ReducedMotionMediaQuery = {
  readonly matches: boolean;
  readonly addEventListener: (type: "change", listener: () => void) => void;
  readonly removeEventListener: (type: "change", listener: () => void) => void;
};

export type ReducedMotionPreferenceStore = {
  readonly getSnapshot: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
};

const noReducedMotionPreference = (): boolean => false;

export function reducedMotionPreferenceStoreFor(
  mediaQuery: ReducedMotionMediaQuery,
): ReducedMotionPreferenceStore {
  const store: ReducedMotionPreferenceStore = {
    getSnapshot(): boolean {
      return mediaQuery.matches;
    },
    subscribe(listener: () => void): () => void {
      mediaQuery.addEventListener("change", listener);

      return (): void => {
        mediaQuery.removeEventListener("change", listener);
      };
    },
  };

  return store;
}

export function useReducedMotionPreference(): boolean {
  const store = useBrowserReducedMotionStore();

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    noReducedMotionPreference,
  );
}

function useBrowserReducedMotionStore(): ReducedMotionPreferenceStore {
  const [store] = useState<ReducedMotionPreferenceStore>(() =>
    reducedMotionPreferenceStoreFor(browserReducedMotionMediaQuery()),
  );

  return store;
}

function browserReducedMotionMediaQuery(): ReducedMotionMediaQuery {
  const nativeMediaQuery = window.matchMedia(reducedMotionMediaQuery);
  const mediaQuery: ReducedMotionMediaQuery = {
    get matches(): boolean {
      return nativeMediaQuery.matches;
    },
    addEventListener(type, listener): void {
      nativeMediaQuery.addEventListener(type, listener);
    },
    removeEventListener(type, listener): void {
      nativeMediaQuery.removeEventListener(type, listener);
    },
  };

  return mediaQuery;
}
