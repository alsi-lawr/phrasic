"use client";

import { parsePlaybackEvent } from "@/domain/playback-stream";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
} from "@/domain/playback";
import {
  createContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type FetchDataContextValue = {
  readonly state: PlaybackState;
};

type FetchDataProviderProps = {
  readonly children: ReactNode;
};

export const FetchDataContext = createContext<
  FetchDataContextValue | undefined
>(undefined);

export function FetchDataProvider({
  children,
}: FetchDataProviderProps): ReactElement {
  const [state, setState] = useState<PlaybackState>(initialPlaybackState);
  const value: FetchDataContextValue = Object.freeze({ state });

  useEffect((): (() => void) => {
    const eventSource = new EventSource("/api/spotify/hook");

    eventSource.onmessage = (event: MessageEvent<unknown>): void => {
      setState(parsePlaybackEvent(event.data));
    };

    eventSource.onerror = (): void => {
      setState(networkFailureState);
    };

    return (): void => {
      eventSource.close();
    };
  }, []);

  return (
    <FetchDataContext.Provider value={value}>
      {children}
    </FetchDataContext.Provider>
  );
}

function networkFailureState(state: PlaybackState): PlaybackState {
  const transition = transitionPlaybackState(state, {
    kind: "failure",
    failure: providerFailure("network"),
  });
  if (transition.kind === "success") {
    return transition.value;
  }

  throw new Error("Expected playback failure transition to succeed");
}
