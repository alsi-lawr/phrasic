import {
  type PlaybackWorkerCommand,
  type PlaybackWorkerEvent,
} from "./worker/protocol.ts";
import {
  initialPlaybackState,
  type PlaybackState,
} from "../domain/playback.ts";
import type { BrowserConfigurationResponse } from "./configuration-response.ts";
import type { AuthorizationReturnTarget } from "./auth/provider.ts";
import type { BrowserPlaybackIntegration } from "./integrations/browser-integration.ts";

const defaultDisplayWidth = 1_920;
const minimumDisplayWidth = 320;
const maximumDisplayWidth = 7_680;
const displayQueryParameterNames: ReadonlyArray<string> = ["width", "setup"];

export type BrowserPlaybackWorker = {
  readonly onError: (listener: () => void) => () => void;
  readonly onMessage: (
    listener: (message: PlaybackWorkerEvent) => void,
  ) => () => void;
  readonly postMessage: (command: PlaybackWorkerCommand) => void;
  readonly terminate: () => void;
};

export type BrowserPlaybackApplicationSnapshot =
  | {
      readonly kind: "fatal";
      readonly reason:
        "browser-capability-unavailable" | "configuration-unavailable";
    }
  | {
      readonly kind: "playback";
      readonly state: PlaybackState;
    };

export type BrowserPlaybackApplicationPorts = {
  readonly createWorker: () => BrowserPlaybackWorker;
  readonly fetchConfiguration: (options: {
    readonly signal: AbortSignal;
    readonly url: URL;
  }) => Promise<BrowserConfigurationResponse>;
  readonly integration: BrowserPlaybackIntegration;
  readonly location: {
    readonly current: () => URL;
    readonly navigate: (url: URL) => void;
    readonly replace: (url: URL) => void;
  };
  readonly onPageHide: (listener: () => void) => () => void;
  readonly onVisibilityChange: (listener: () => void) => () => void;
  readonly visibility: () => "hidden" | "visible";
};

export type BrowserPlaybackApplication = {
  readonly beginAuthorization: () => void;
  readonly dispose: () => void;
  readonly getSnapshot: () => BrowserPlaybackApplicationSnapshot;
  readonly logout: () => void;
  readonly retry: () => void;
  readonly start: () => void;
  readonly subscribe: (listener: () => void) => () => void;
};

type ApplicationRuntime =
  | {
      readonly kind: "active";
      readonly abortController: AbortController;
      readonly removeErrorListener: () => void;
      readonly removeMessageListener: () => void;
      readonly removePageHideListener: () => void;
      readonly removeVisibilityListener: () => void;
      readonly worker: BrowserPlaybackWorker;
    }
  | {
      readonly kind: "not-started";
    }
  | {
      readonly kind: "disposed";
    };

type DisplayQuery =
  | {
      readonly kind: "invalid";
    }
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "setup";
    }
  | {
      readonly kind: "width";
      readonly width: number;
    }
  | {
      readonly kind: "width-and-setup";
      readonly width: number;
    };

export function createBrowserPlaybackApplication(
  ports: BrowserPlaybackApplicationPorts,
): BrowserPlaybackApplication {
  let runtime: ApplicationRuntime = { kind: "not-started" };
  let snapshot: BrowserPlaybackApplicationSnapshot = playbackSnapshot(
    initialPlaybackState(),
  );
  const subscribers = new Set<() => void>();

  const application: BrowserPlaybackApplication = {
    beginAuthorization(): void {
      const active = activeRuntime();
      if (active.kind === "unavailable") {
        return;
      }

      postCommand(active.value, {
        kind: "begin-authorization",
        returnTo: displayReturnConfiguration(ports.location.current()),
      });
    },

    dispose(): void {
      if (runtime.kind !== "active") {
        return;
      }

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
        // Termination remains the authoritative teardown when postMessage fails.
      }

      active.worker.terminate();
      subscribers.clear();
    },

    getSnapshot(): BrowserPlaybackApplicationSnapshot {
      return snapshot;
    },

    logout(): void {
      const active = activeRuntime();
      if (active.kind === "unavailable") {
        return;
      }

      postCommand(active.value, { kind: "logout" });
    },

    retry(): void {
      const active = activeRuntime();
      if (active.kind === "unavailable") {
        return;
      }

      postCommand(active.value, { kind: "retry" });
    },

    start(): void {
      if (runtime.kind !== "not-started") {
        return;
      }

      const currentUrl = ports.location.current();
      const applicationUrl = new URL(
        ports.integration.applicationPath,
        currentUrl.origin,
      );

      let worker: BrowserPlaybackWorker;
      try {
        worker = ports.createWorker();
      } catch {
        replaceSnapshot(fatalSnapshot("browser-capability-unavailable"));
        return;
      }

      const abortController = new AbortController();
      const removeMessageListener = worker.onMessage(receiveWorkerMessage);
      const removeErrorListener = worker.onError(workerFailed);
      const removeVisibilityListener = ports.onVisibilityChange(
        forwardVisibilityChange,
      );
      const removePageHideListener = ports.onPageHide(application.dispose);
      const active: Extract<ApplicationRuntime, { readonly kind: "active" }> = {
        kind: "active",
        abortController,
        removeErrorListener,
        removeMessageListener,
        removePageHideListener,
        removeVisibilityListener,
        worker,
      };
      runtime = active;
      void initialize(active, currentUrl, applicationUrl);
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
    active: Extract<ApplicationRuntime, { readonly kind: "active" }>,
    currentUrl: URL,
    applicationUrl: URL,
  ): Promise<void> {
    const prepared = await ports.integration.prepare({
      applicationUrl,
      currentUrl,
      fetchConfiguration: ports.fetchConfiguration,
      signal: active.abortController.signal,
    });
    if (!isCurrent(active)) {
      return;
    }

    if (prepared.kind === "failure") {
      replaceSnapshot(fatalSnapshot("configuration-unavailable"));
      return;
    }

    postCommand(active, {
      kind: "initialize",
      applicationUrl: applicationUrl.toString(),
      configuration: prepared.configuration,
    });
    if (prepared.callbackUrl.kind === "available") {
      postCommand(active, {
        kind: "consume-callback",
        callbackUrl: prepared.callbackUrl.value,
      });
    }
    forwardVisibilityChange();
  }

  function receiveWorkerMessage(message: PlaybackWorkerEvent): void {
    switch (message.kind) {
      case "playback-state":
        replaceSnapshot(playbackSnapshot(message.state));
        return;
      case "authorization-redirect":
        navigateToAuthorization(message.url);
        return;
      case "callback-url-restored":
        restoreCallbackUrl(message.url);
        return;
      case "fatal-initialization-failure":
        replaceSnapshot(
          fatalSnapshot(
            message.code === "invalid-public-configuration"
              ? "configuration-unavailable"
              : "browser-capability-unavailable",
          ),
        );
        return;
      case "safe-diagnostic":
        return;
    }
  }

  function navigateToAuthorization(input: string): void {
    const authorizationUrl = ports.integration.validateAuthorizationUrl(
      input,
      ports.location.current(),
    );
    if (authorizationUrl.kind === "invalid") {
      replaceSnapshot(fatalSnapshot("browser-capability-unavailable"));
      return;
    }

    ports.location.navigate(authorizationUrl.value);
  }

  function restoreCallbackUrl(input: string): void {
    const restored = ports.integration.validateRestoredUrl(
      input,
      ports.location.current(),
    );
    if (restored.kind === "invalid") {
      return;
    }

    ports.location.replace(restored.value);
  }

  function forwardVisibilityChange(): void {
    const active = activeRuntime();
    if (active.kind === "unavailable") {
      return;
    }

    postCommand(active.value, {
      kind: "visibility-change",
      visibility: ports.visibility(),
    });
  }

  function workerFailed(): void {
    replaceSnapshot(fatalSnapshot("browser-capability-unavailable"));
  }

  function postCommand(
    active: Extract<ApplicationRuntime, { readonly kind: "active" }>,
    command: PlaybackWorkerCommand,
  ): void {
    if (!isCurrent(active)) {
      return;
    }

    try {
      active.worker.postMessage(command);
    } catch {
      replaceSnapshot(fatalSnapshot("browser-capability-unavailable"));
    }
  }

  function activeRuntime():
    | {
        readonly kind: "available";
        readonly value: Extract<
          ApplicationRuntime,
          { readonly kind: "active" }
        >;
      }
    | {
        readonly kind: "unavailable";
      } {
    if (runtime.kind !== "active") {
      return { kind: "unavailable" };
    }

    return { kind: "available", value: runtime };
  }

  function isCurrent(
    active: Extract<ApplicationRuntime, { readonly kind: "active" }>,
  ): boolean {
    return runtime.kind === "active" && runtime.worker === active.worker;
  }

  function replaceSnapshot(next: BrowserPlaybackApplicationSnapshot): void {
    if (runtime.kind === "disposed") {
      return;
    }

    snapshot = next;
    for (const subscriber of subscribers) {
      subscriber();
    }
  }
}

function displayReturnConfiguration(
  currentUrl: URL,
): AuthorizationReturnTarget {
  const display = parseDisplayQuery(currentUrl.searchParams);
  const width = displayWidth(display);
  const setup = displaySetupRequested(display);

  return { width, setup };
}

function displayWidth(display: DisplayQuery): number {
  switch (display.kind) {
    case "invalid":
    case "none":
    case "setup":
      return defaultDisplayWidth;
    case "width":
    case "width-and-setup":
      return display.width;
  }

  const unhandledDisplay: never = display;
  throw new Error(`Unhandled display query: ${unhandledDisplay}`);
}

function displaySetupRequested(display: DisplayQuery): boolean {
  switch (display.kind) {
    case "invalid":
    case "none":
    case "width":
      return false;
    case "setup":
    case "width-and-setup":
      return true;
  }

  const unhandledDisplay: never = display;
  throw new Error(`Unhandled display query: ${unhandledDisplay}`);
}

function parseDisplayQuery(parameters: URLSearchParams): DisplayQuery {
  for (const parameter of parameters.keys()) {
    if (displayQueryParameterNames.includes(parameter)) {
      continue;
    }

    return invalidDisplayQuery();
  }

  const widthValues = parameters.getAll("width");
  const setupValues = parameters.getAll("setup");
  if (widthValues.length > 1 || setupValues.length > 1) {
    return invalidDisplayQuery();
  }

  const hasSetup = setupValues.length === 1;
  if (hasSetup && setupValues[0] !== "1") {
    return invalidDisplayQuery();
  }

  if (widthValues.length === 0) {
    return hasSetup ? setupDisplayQuery() : noDisplayQuery();
  }

  const widthValue = widthValues[0];
  if (widthValue === undefined || !/^\d+$/.test(widthValue)) {
    return invalidDisplayQuery();
  }

  const width = Number(widthValue);
  if (
    !Number.isSafeInteger(width) ||
    width < minimumDisplayWidth ||
    width > maximumDisplayWidth
  ) {
    return invalidDisplayQuery();
  }

  return hasSetup ? widthAndSetupDisplayQuery(width) : widthDisplayQuery(width);
}

function invalidDisplayQuery(): DisplayQuery {
  return { kind: "invalid" };
}

function noDisplayQuery(): DisplayQuery {
  return { kind: "none" };
}

function setupDisplayQuery(): DisplayQuery {
  return { kind: "setup" };
}

function widthDisplayQuery(width: number): DisplayQuery {
  return { kind: "width", width };
}

function widthAndSetupDisplayQuery(width: number): DisplayQuery {
  return { kind: "width-and-setup", width };
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return { kind: "playback", state };
}

function fatalSnapshot(
  reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"],
): BrowserPlaybackApplicationSnapshot {
  return { kind: "fatal", reason };
}
