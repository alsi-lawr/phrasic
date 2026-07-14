import {
  useEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import {
  PlaybackWorkerContext,
  type PlaybackWorkerContextValue,
} from "./PlaybackWorkerContext.ts";

type PlaybackWorkerProviderProps = {
  readonly application: BrowserPlaybackApplication;
  readonly children: ReactNode;
};

export function PlaybackWorkerProvider({
  application,
  children,
}: PlaybackWorkerProviderProps): ReactElement {
  const snapshot = useSyncExternalStore(
    application.subscribe,
    application.getSnapshot,
    application.getSnapshot,
  );

  useEffect((): (() => void) => {
    return (): void => {
      application.dispose();
    };
  }, [application]);

  const value: PlaybackWorkerContextValue = {
    beginAuthorization: application.beginAuthorization,
    logout: application.logout,
    retry: application.retry,
    snapshot,
  };

  return (
    <PlaybackWorkerContext.Provider value={value}>
      {children}
    </PlaybackWorkerContext.Provider>
  );
}
