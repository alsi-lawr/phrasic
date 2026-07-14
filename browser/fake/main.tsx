import { createRoot } from "react-dom/client";
import {
  createBrowserPlaybackApplication,
  type BrowserPlaybackApplicationPorts,
  type BrowserPlaybackWorker,
} from "../application.ts";
import type { BrowserConfigurationResponse } from "../configuration-response.ts";
import { fakeBrowserIntegration } from "./browser-integration.ts";
import { parseFakeControlEnvelope } from "./control.ts";
import { fakeMusicOverlayPresentation } from "./presentation.ts";
import NowPlayingOverlay from "../../components/overlay/NowPlayingOverlay.tsx";
import "../globals.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("The Fake Music application root is unavailable.");
}

const application = createBrowserPlaybackApplication(browserApplicationPorts());
application.start();

createRoot(rootElement).render(
  <NowPlayingOverlay
    application={application}
    presentation={fakeMusicOverlayPresentation}
  />,
);

function browserApplicationPorts(): BrowserPlaybackApplicationPorts {
  return Object.freeze({
    createWorker: createPlaybackWorker,
    fetchConfiguration(): Promise<BrowserConfigurationResponse> {
      return Promise.reject(
        new Error("Fake Music has no runtime configuration request."),
      );
    },
    integration: fakeBrowserIntegration,
    location: Object.freeze({
      current(): URL {
        return new URL(window.location.href);
      },
      navigate(): void {},
      replace(): void {},
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
  const worker = new Worker(new URL("./worker-entry.ts", import.meta.url), {
    type: "module",
    name: "phrasic-fake-playback",
  });
  const forwardControl = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const control = parseFakeControlEnvelope(
      event.data,
      new URL(window.location.href),
    );
    if (control.kind === "success") {
      worker.postMessage(control.value);
    }
  };
  window.addEventListener("message", forwardControl);

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
      window.removeEventListener("message", forwardControl);
      worker.terminate();
    },
  };

  return Object.freeze(playbackWorker);
}
