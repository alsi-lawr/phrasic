import { createRoot } from "react-dom/client";
import {
  createBrowserLocalApplication,
  type BrowserLocalWorker,
} from "./application.ts";
import { LocalApplication } from "./LocalApplication.tsx";
import type { LocalWorkerEvent } from "./protocol.ts";
import "../globals.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("The Local playback application root is unavailable.");
}

const application = createBrowserLocalApplication(browserPorts());
application.start();
createRoot(rootElement).render(
  <LocalApplication
    application={application}
    prefersReducedMotion={
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    }
  />,
);

function browserPorts() {
  return {
    createWorker(): BrowserLocalWorker {
      const worker = new Worker(
        new URL("/browser/local/worker-entry.ts", window.location.origin),
        { name: "phrasic-local-playback", type: "module" },
      );
      return {
        onError(listener: () => void): () => void {
          const onError = (): void => {
            listener();
          };
          worker.addEventListener("error", onError);
          return (): void => {
            worker.removeEventListener("error", onError);
          };
        },
        onMessage(listener: (message: LocalWorkerEvent) => void): () => void {
          const onMessage = (event: MessageEvent<LocalWorkerEvent>): void => {
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
    },
    currentUrl(): URL {
      return new URL(window.location.href);
    },
    fetch(input: URL, init: RequestInit): Promise<Response> {
      return window.fetch(input, init);
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
    replaceHistory(path: string): void {
      window.history.replaceState(null, "", path);
    },
    visibility(): "hidden" | "visible" {
      return document.visibilityState === "visible" ? "visible" : "hidden";
    },
  };
}
