import { createRoot } from "react-dom/client";
import {
  createBrowserPlaybackApplication,
  type BrowserConfigurationResponse,
  type BrowserPlaybackApplicationPorts,
  type BrowserPlaybackWorker,
} from "./application.ts";
import NowPlaying from "../components/NowPlaying";
import "./globals.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("The Spotify application root is unavailable.");
}

const application = createBrowserPlaybackApplication(browserApplicationPorts());
application.start();

createRoot(rootElement).render(<NowPlaying application={application} />);

function browserApplicationPorts(): BrowserPlaybackApplicationPorts {
  return Object.freeze({
    createWorker: createPlaybackWorker,
    fetchConfiguration,
    location: Object.freeze({
      current(): URL {
        return new URL(window.location.href);
      },
      navigate(url: URL): void {
        window.location.assign(url.toString());
      },
      replace(url: URL): void {
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      },
    }),
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
  });
}

function createPlaybackWorker(): BrowserPlaybackWorker {
  const worker = new Worker(new URL("./worker/entry.ts", import.meta.url), {
    type: "module",
    name: "obs-nowplaying-playback",
  });

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
    onMessage(listener: (message: unknown) => void): () => void {
      const onMessage = (event: MessageEvent<unknown>): void => {
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

  return Object.freeze(playbackWorker);
}

async function fetchConfiguration(options: {
  readonly signal: AbortSignal;
  readonly url: URL;
}): Promise<BrowserConfigurationResponse> {
  const response = await fetch(options.url, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    signal: options.signal,
  });
  const configurationResponse: BrowserConfigurationResponse = {
    ok: response.ok,
    async readJson(): Promise<unknown> {
      const source: unknown = await response.json();
      return source;
    },
  };

  return Object.freeze(configurationResponse);
}
