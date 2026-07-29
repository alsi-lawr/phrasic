import { createBrowserPkceCryptoPort } from "../auth/pkce.ts";
import type { BrowserFetch } from "../fetch.ts";
import { createIndexedDbSpotifyAuthStorage } from "../auth/storage.ts";
import { createNativeIndexedDbAuthorizationPort } from "../auth/indexeddb-authorization.ts";
import { createSpotifyAuthFetchPort } from "../auth/spotify-auth-fetch.ts";
import { createSpotifyAuthorizationProvider } from "../auth/spotify-provider.ts";
import { createSpotifyPlaybackProvider } from "../providers/spotify.ts";
import {
  createBrowserRequestDeadlinePort,
  spotifyHttpRequestDeadlineMilliseconds,
  type BrowserRequestDeadlineSchedulerPort,
} from "../request-deadline.ts";
import {
  createPlaybackWorkerFatalInitializationFailure,
  type PlaybackWorkerCommand,
} from "./protocol.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerRuntime,
} from "./runtime.ts";
import type {
  PlaybackWorkerEventSink,
  PlaybackWorkerSchedulerPort,
} from "./runtime-ports.ts";

type WorkerBootstrap =
  | {
      readonly kind: "ready";
      readonly runtime: PlaybackWorkerRuntime;
    }
  | {
      readonly kind: "unavailable";
    };

const bootstrap = createWorkerBootstrap();

switch (bootstrap.kind) {
  case "ready":
    self.addEventListener(
      "message",
      (event: MessageEvent<PlaybackWorkerCommand>): void => {
        void bootstrap.runtime.receive(event.data);
      },
    );
    break;
  case "unavailable":
    self.postMessage(
      createPlaybackWorkerFatalInitializationFailure(
        "browser-capability-unavailable",
      ),
    );
    break;
}

function createWorkerBootstrap(): WorkerBootstrap {
  if (
    typeof self.fetch !== "function" ||
    typeof self.indexedDB === "undefined" ||
    typeof self.crypto === "undefined" ||
    typeof AbortController === "undefined"
  ) {
    return { kind: "unavailable" };
  }

  try {
    const fetchImplementation: BrowserFetch = (input, init) =>
      self.fetch(input, init);
    const events: PlaybackWorkerEventSink = {
      emit(event): void {
        self.postMessage(event);
      },
    };
    const scheduler = nativeWorkerScheduler();
    const requestDeadline = createBrowserRequestDeadlinePort(
      nativeRequestDeadlineScheduler(),
    );
    const spotifyPlaybackProvider = createSpotifyPlaybackProvider({
      fetchImplementation,
      requestDeadline,
      timeoutMilliseconds: spotifyHttpRequestDeadlineMilliseconds,
    });
    const runtime = createPlaybackWorkerRuntime({
      authorization: createSpotifyAuthorizationProvider({
        crypto: createBrowserPkceCryptoPort(self.crypto),
        fetch: createSpotifyAuthFetchPort({
          fetchImplementation,
          requestDeadline,
          timeoutMilliseconds: spotifyHttpRequestDeadlineMilliseconds,
        }),
        storage: createIndexedDbSpotifyAuthStorage(
          createNativeIndexedDbAuthorizationPort(self.indexedDB),
        ),
      }),
      cancellation: {
        create(): AbortController {
          return new AbortController();
        },
      },
      clock: {
        now(): number {
          return Date.now();
        },
      },
      events,
      playbackProvider: spotifyPlaybackProvider,
      scheduler,
    });

    return { kind: "ready", runtime };
  } catch {
    return { kind: "unavailable" };
  }
}

function nativeRequestDeadlineScheduler(): BrowserRequestDeadlineSchedulerPort {
  const scheduler: BrowserRequestDeadlineSchedulerPort = {
    schedule(options) {
      const timer = self.setTimeout(options.run, options.delayMilliseconds);
      return {
        cancel(): void {
          self.clearTimeout(timer);
        },
      };
    },
  };

  return scheduler;
}

function nativeWorkerScheduler(): PlaybackWorkerSchedulerPort {
  const scheduler: PlaybackWorkerSchedulerPort = {
    schedule(options) {
      const timer = self.setTimeout((): void => {
        void options.run();
      }, options.delayMilliseconds);
      return {
        cancel(): void {
          self.clearTimeout(timer);
        },
      };
    },
  };

  return scheduler;
}
