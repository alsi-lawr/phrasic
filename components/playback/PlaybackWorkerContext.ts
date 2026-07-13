import { createContext } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";

export type PlaybackWorkerContextValue = {
  readonly beginAuthorization: () => void;
  readonly logout: () => void;
  readonly retry: () => void;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export const PlaybackWorkerContext = createContext<
  PlaybackWorkerContextValue | undefined
>(undefined);
