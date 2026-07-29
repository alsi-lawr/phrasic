import { createRoot } from "react-dom/client";
import {
  createBrowserPlaybackApplication,
  type BrowserPlaybackApplicationPorts,
  type BrowserPlaybackWorker,
} from "./application.ts";
import type { PlaybackWorkerEvent } from "./worker/protocol.ts";
import { fetchBrowserConfiguration } from "./configuration-fetch.ts";
import NowPlayingOverlay from "../components/overlay/NowPlayingOverlay.tsx";
import { spotifyOverlayPresentation } from "./providers/spotify-presentation.ts";
import { spotifyBrowserIntegration } from "./integrations/spotify-browser-integration.ts";
import "./globals.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("The Spotify application root is unavailable.");
}

const application = createBrowserPlaybackApplication(browserApplicationPorts());
application.start();

createRoot(rootElement).render(
  <NowPlayingOverlay
    application={application}
    presentation={spotifyOverlayPresentation}
  />,
);

function browserApplicationPorts(): BrowserPlaybackApplicationPorts {
  return {
    createWorker: createPlaybackWorker,
    fetchConfiguration(options) {
      return fetchBrowserConfiguration({
        fetchImplementation(input, init) {
          return window.fetch(input, init);
        },
        signal: options.signal,
        url: options.url,
      });
    },
    integration: spotifyBrowserIntegration,
    location: {
      current(): URL {
        return new URL(window.location.href);
      },
      navigate(url: URL): void {
        window.location.assign(url.toString());
      },
      replace(url: URL): void {
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      },
    },
    onPageHide(listener: () => void): () => void {
      window.addEventListener("pagehide", listener, { once: true });

      return (): void => {
        window.removeEventListener("pagehide", listener);
      };
    },
    onVisibilityChange(listener: () => void): () => void {
      document.addEventListener("visibilitychange", listener);

      return (): void => {
        document.removeEventListener("visibilitychange", listener);
      };
    },
    visibility(): "hidden" | "visible" {
      return document.visibilityState === "visible" ? "visible" : "hidden";
    },
  };
}

function createPlaybackWorker(): BrowserPlaybackWorker {
  const worker = new Worker(
    new URL("/browser/worker/entry.ts", window.location.origin),
    {
      type: "module",
      name: "phrasic-playback",
    },
  );

  const playbackWorker: BrowserPlaybackWorker = {
    onError(listener: () => void): () => void {
      const onError = (): void => {
        listener();
      };
      worker.addEventListener("error", onError);

      return (): void => {
        worker.removeEventListener("error", onError);
      };
    },
    onMessage(listener: (message: PlaybackWorkerEvent) => void): () => void {
      const onMessage = (event: MessageEvent<PlaybackWorkerEvent>): void => {
        listener(event.data);
      };
      worker.addEventListener("message", onMessage);

      return (): void => {
        worker.removeEventListener("message", onMessage);
      };
    },
    postMessage(command): void {
      worker.postMessage(command);
    },
    terminate(): void {
      worker.terminate();
    },
  };

  return playbackWorker;
}
