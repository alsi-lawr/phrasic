import { createBrowserPkceCryptoPort } from "../auth/pkce.ts";
import {
  createIndexedDbSpotifyAuthStorage,
  createNativeIndexedDbAuthorizationPort,
} from "../auth/storage.ts";
import { createSpotifyAuthFetchPort } from "../auth/token.ts";
import { createPlaybackProviderRegistry } from "../providers/registry.ts";
import { createSpotifyPlaybackProvider } from "../providers/spotify.ts";
import {
  createBrowserRequestDeadlinePort,
  spotifyHttpRequestDeadlineMilliseconds,
  type BrowserRequestDeadlineSchedulerPort,
} from "../request-deadline.ts";
import { createPlaybackWorkerFatalInitializationFailure } from "./protocol.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerEventSink,
  type PlaybackWorkerRuntime,
  type PlaybackWorkerSchedulerPort,
} from "./runtime.ts";

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
    self.addEventListener("message", (event: MessageEvent<unknown>): void => {
      void bootstrap.runtime.receive(event.data);
    });
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
    return Object.freeze({ kind: "unavailable" });
  }

  try {
    const events: PlaybackWorkerEventSink = Object.freeze({
      emit(event): void {
        self.postMessage(event);
      },
    });
    const scheduler = nativeWorkerScheduler();
    const requestDeadline = createBrowserRequestDeadlinePort(
      nativeRequestDeadlineScheduler(),
    );
    const spotifyPlaybackProvider = createSpotifyPlaybackProvider({
      fetchImplementation: self.fetch,
      requestDeadline,
      timeoutMilliseconds: spotifyHttpRequestDeadlineMilliseconds,
    });
    const playbackProviders = createPlaybackProviderRegistry([
      spotifyPlaybackProvider,
    ]);
    if (playbackProviders.kind === "failure") {
      return Object.freeze({ kind: "unavailable" });
    }
    const runtime = createPlaybackWorkerRuntime({
      auth: Object.freeze({
        crypto: createBrowserPkceCryptoPort(self.crypto),
        fetch: createSpotifyAuthFetchPort({
          fetchImplementation: self.fetch,
          requestDeadline,
          timeoutMilliseconds: spotifyHttpRequestDeadlineMilliseconds,
        }),
        storage: createIndexedDbSpotifyAuthStorage(
          createNativeIndexedDbAuthorizationPort(self.indexedDB),
        ),
      }),
      cancellation: Object.freeze({
        create(): AbortController {
          return new AbortController();
        },
      }),
      clock: Object.freeze({
        now(): number {
          return Date.now();
        },
      }),
      events,
      playbackProviderId: spotifyPlaybackProvider.providerId,
      playbackProviders: playbackProviders.value,
      scheduler,
    });

    return Object.freeze({ kind: "ready", runtime });
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
}

function nativeRequestDeadlineScheduler(): BrowserRequestDeadlineSchedulerPort {
  const scheduler: BrowserRequestDeadlineSchedulerPort = {
    schedule(options) {
      const timer = self.setTimeout(options.run, options.delayMilliseconds);
      return Object.freeze({
        cancel(): void {
          self.clearTimeout(timer);
        },
      });
    },
  };

  return Object.freeze(scheduler);
}

function nativeWorkerScheduler(): PlaybackWorkerSchedulerPort {
  const scheduler: PlaybackWorkerSchedulerPort = {
    schedule(options) {
      const timer = self.setTimeout((): void => {
        void options.run();
      }, options.delayMilliseconds);
      return Object.freeze({
        cancel(): void {
          self.clearTimeout(timer);
        },
      });
    },
  };

  return Object.freeze(scheduler);
}
