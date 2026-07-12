"use client";

import {
  emptyPlaybackWireState,
  failurePlaybackWireState,
  parsePlaybackWireEvent,
  type PlaybackWireState,
} from "@/domain/playback-stream";
import { providerFailure } from "@/domain/playback";
import {
  createContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export type FetchDataContextValue = {
  readonly state: PlaybackWireState;
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
  const [state, setState] = useState<PlaybackWireState>(emptyPlaybackWireState);

  useEffect((): (() => void) => {
    const eventSource = new EventSource("/api/spotify/hook");

    eventSource.onmessage = (event: MessageEvent<unknown>): void => {
      setState(parsePlaybackWireEvent(event.data));
    };

    eventSource.onerror = (): void => {
      setState(failurePlaybackWireState(providerFailure("network")));
    };

    return (): void => {
      eventSource.close();
    };
  }, []);

  return (
    <FetchDataContext.Provider value={{ state }}>
      {children}
    </FetchDataContext.Provider>
  );
}
