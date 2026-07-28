import {
  NativeMonotonicMilliseconds,
  resolveLocalPlaybackPresentation,
  unavailableLocalLastSuccessfulSnapshot,
  type LocalPlaybackPresentation,
} from "../../domain/local-playback.ts";
import type {
  LocalPageVisibility,
  LocalWorkerCommand,
  LocalWorkerEvent,
} from "./protocol.ts";
import { redeemPairingCapability } from "./pairing.ts";

export type BrowserLocalWorker = {
  readonly onError: (listener: () => void) => () => void;
  readonly onMessage: (
    listener: (message: LocalWorkerEvent) => void,
  ) => () => void;
  readonly postMessage: (command: LocalWorkerCommand) => void;
  readonly terminate: () => void;
};

export type BrowserLocalApplicationPorts = {
  readonly createWorker: () => BrowserLocalWorker;
  readonly currentUrl: () => URL;
  readonly fetch: (
    input: URL,
    init: RequestInit,
  ) => Promise<Pick<Response, "ok">>;
  readonly onPageHide: (listener: () => void) => () => void;
  readonly onVisibilityChange: (listener: () => void) => () => void;
  readonly replaceHistory: (path: string) => void;
  readonly visibility: () => LocalPageVisibility;
};

export type BrowserLocalApplication = {
  readonly dispose: () => void;
  readonly getSnapshot: () => LocalPlaybackPresentation;
  readonly start: () => void;
  readonly subscribe: (listener: () => void) => () => void;
};

type ApplicationRuntime =
  | { readonly kind: "not-started" }
  | { readonly kind: "starting"; readonly abortController: AbortController }
  | {
      readonly kind: "active";
      readonly abortController: AbortController;
      readonly removeErrorListener: () => void;
      readonly removeMessageListener: () => void;
      readonly removePageHideListener: () => void;
      readonly removeVisibilityListener: () => void;
      readonly worker: BrowserLocalWorker;
    }
  | { readonly kind: "disposed" };

export function createBrowserLocalApplication(
  ports: BrowserLocalApplicationPorts,
): BrowserLocalApplication {
  let runtime: ApplicationRuntime = { kind: "not-started" };
  let snapshot = unavailablePresentation();
  const subscribers = new Set<() => void>();

  const application: BrowserLocalApplication = {
    dispose(): void {
      switch (runtime.kind) {
        case "not-started":
        case "disposed":
          runtime = { kind: "disposed" };
          subscribers.clear();
          return;
        case "starting":
          runtime.abortController.abort();
          runtime = { kind: "disposed" };
          subscribers.clear();
          return;
        case "active": {
          const active = runtime;
          runtime = { kind: "disposed" };
          active.abortController.abort();
          active.removeErrorListener();
          active.removeMessageListener();
          active.removePageHideListener();
          active.removeVisibilityListener();
          try {
            active.worker.postMessage({ kind: "dispose" });
          } catch {
            // Worker termination is the authoritative teardown.
          }
          active.worker.terminate();
          subscribers.clear();
          return;
        }
      }
    },

    getSnapshot(): LocalPlaybackPresentation {
      return snapshot;
    },

    start(): void {
      if (runtime.kind !== "not-started") {
        return;
      }

      const abortController = new AbortController();
      const starting: Extract<
        ApplicationRuntime,
        { readonly kind: "starting" }
      > = {
        kind: "starting",
        abortController,
      };
      runtime = starting;
      void initialize(starting);
    },

    subscribe(listener: () => void): () => void {
      subscribers.add(listener);
      return (): void => {
        subscribers.delete(listener);
      };
    },
  };

  return application;

  async function initialize(
    starting: Extract<ApplicationRuntime, { readonly kind: "starting" }>,
  ): Promise<void> {
    const pairing = await redeemPairingCapability(
      {
        currentUrl: ports.currentUrl,
        fetch: ports.fetch,
        replaceHistory: ports.replaceHistory,
      },
      starting.abortController.signal,
    );
    if (runtime !== starting) {
      return;
    }
    if (pairing.kind === "unavailable") {
      runtime = { kind: "disposed" };
      replaceSnapshot(unavailablePresentation());
      return;
    }

    activate(starting.abortController);
  }

  function activate(abortController: AbortController): void {
    let worker: BrowserLocalWorker;
    try {
      worker = ports.createWorker();
    } catch {
      runtime = { kind: "disposed" };
      replaceSnapshot(unavailablePresentation());
      return;
    }

    const removeMessageListener = worker.onMessage((message): void => {
      if (message.kind === "presentation") {
        replaceSnapshot(message.presentation);
      }
    });
    const removeErrorListener = worker.onError((): void => {
      replaceSnapshot(unavailablePresentation());
    });
    const removeVisibilityListener = ports.onVisibilityChange((): void => {
      if (runtime.kind === "active") {
        postVisibility(runtime.worker);
      }
    });
    const removePageHideListener = ports.onPageHide(application.dispose);
    runtime = {
      kind: "active",
      abortController,
      removeErrorListener,
      removeMessageListener,
      removePageHideListener,
      removeVisibilityListener,
      worker,
    };
    worker.postMessage({
      kind: "initialize",
      origin: ports.currentUrl().origin,
      visibility: ports.visibility(),
    });
  }

  function postVisibility(worker: BrowserLocalWorker): void {
    try {
      worker.postMessage({
        kind: "visibility-change",
        visibility: ports.visibility(),
      });
    } catch {
      replaceSnapshot(unavailablePresentation());
    }
  }

  function replaceSnapshot(next: LocalPlaybackPresentation): void {
    snapshot = next;
    for (const subscriber of subscribers) {
      subscriber();
    }
  }
}

function unavailablePresentation(): LocalPlaybackPresentation {
  const now = NativeMonotonicMilliseconds.parse(0);
  if (now.kind === "failure") {
    throw new Error("The fixed Local monotonic origin is invalid.");
  }

  return resolveLocalPlaybackPresentation({
    lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
    now: now.value,
    outcome: { kind: "native-session-unavailable" },
  });
}
