import { useContext } from "react";
import {
  PlaybackWorkerContext,
  type PlaybackWorkerContextValue,
} from "./PlaybackWorkerContext.ts";

export function usePlaybackWorker(): PlaybackWorkerContextValue {
  const context = useContext(PlaybackWorkerContext);
  if (context === undefined) {
    throw new Error(
      "usePlaybackWorker must be used within a PlaybackWorkerProvider.",
    );
  }

  return context;
}
