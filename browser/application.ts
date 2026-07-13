import {
  parseSpotifyPublicConfiguration,
  type SpotifyPublicConfiguration,
} from "./config.ts";
import {
  deserializePlaybackWireState,
  type PlaybackWireState,
} from "./worker/playback-wire.ts";
import {
  parsePlaybackWorkerEvent,
  type PlaybackWorkerCommand,
} from "./worker/protocol.ts";
import {
  initialPlaybackState,
  providerFailure,
  transitionPlaybackState,
  type PlaybackState,
} from "../domain/playback.ts";

const defaultDisplayWidth = 1_920;
const minimumDisplayWidth = 320;
const maximumDisplayWidth = 7_680;
const spotifyAuthorizationOrigin = "https://accounts.spotify.com";
const spotifyAuthorizationParameterNames: ReadonlyArray<string> = Object.freeze(
  [
    "client_id",
    "response_type",
    "redirect_uri",
    "code_challenge_method",
    "code_challenge",
    "state",
    "scope",
  ],
);
const callbackQueryParameterNames: ReadonlyArray<string> = Object.freeze([
  "code",
  "error",
  "error_description",
  "error_uri",
  "state",
]);
const displayQueryParameterNames: ReadonlyArray<string> = Object.freeze([
  "width",
  "setup",
]);

export type BrowserConfigurationResponse = {
  readonly ok: boolean;
  readonly readJson: () => Promise<unknown>;
};

export type BrowserPlaybackWorker = {
  readonly onError: (listener: () => void) => () => void;
  readonly onMessage: (listener: (message: unknown) => void) => () => void;
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

type CallbackCommand =
  | {
      readonly kind: "none";
    }
  | {
      readonly callbackUrl: string;
      readonly kind: "pending";
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

type RestoredCallbackUrl =
  | {
      readonly kind: "invalid";
    }
  | {
      readonly kind: "valid";
      readonly value: URL;
    };

type SpotifyAuthorizationUrl =
  | {
      readonly kind: "invalid";
    }
  | {
      readonly kind: "valid";
      readonly value: URL;
    };

type WorkerPublicConfiguration = {
  readonly spotify: {
    readonly clientId: string;
    readonly redirectUri: string;
  };
};

export function createBrowserPlaybackApplication(
  ports: BrowserPlaybackApplicationPorts,
): BrowserPlaybackApplication {
  let runtime: ApplicationRuntime = Object.freeze({ kind: "not-started" });
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
      runtime = Object.freeze({ kind: "disposed" });
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
      const callback = captureCallbackCommand(currentUrl);
      const applicationUrl = new URL("/spotify/", currentUrl.origin);

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
      const active: Extract<ApplicationRuntime, { readonly kind: "active" }> =
        Object.freeze({
          kind: "active",
          abortController,
          removeErrorListener,
          removeMessageListener,
          removePageHideListener,
          removeVisibilityListener,
          worker,
        });
      runtime = active;
      void initialize(active, callback, applicationUrl);
    },

    subscribe(listener: () => void): () => void {
      subscribers.add(listener);

      return (): void => {
        subscribers.delete(listener);
      };
    },
  };

  return Object.freeze(application);

  async function initialize(
    active: Extract<ApplicationRuntime, { readonly kind: "active" }>,
    callback: CallbackCommand,
    applicationUrl: URL,
  ): Promise<void> {
    const configurationUrl = new URL("/config.json", applicationUrl.origin);

    let response: BrowserConfigurationResponse;
    try {
      response = await ports.fetchConfiguration({
        signal: active.abortController.signal,
        url: configurationUrl,
      });
    } catch {
      if (isCurrent(active)) {
        replaceSnapshot(fatalSnapshot("configuration-unavailable"));
      }
      return;
    }

    if (!isCurrent(active)) {
      return;
    }

    if (!response.ok) {
      replaceSnapshot(fatalSnapshot("configuration-unavailable"));
      return;
    }

    let source: unknown;
    try {
      source = await response.readJson();
    } catch {
      if (isCurrent(active)) {
        replaceSnapshot(fatalSnapshot("configuration-unavailable"));
      }
      return;
    }

    if (!isCurrent(active)) {
      return;
    }

    const configuration = parseSpotifyPublicConfiguration(source, {
      applicationUrl,
    });
    if (configuration.kind === "failure") {
      replaceSnapshot(fatalSnapshot("configuration-unavailable"));
      return;
    }

    postCommand(active, {
      kind: "initialize",
      applicationUrl: applicationUrl.toString(),
      configuration: serializeWorkerPublicConfiguration(configuration.value),
    });
    if (callback.kind === "pending") {
      postCommand(active, {
        kind: "consume-callback",
        callbackUrl: callback.callbackUrl,
      });
    }
    forwardVisibilityChange();
  }

  function receiveWorkerMessage(message: unknown): void {
    const event = parsePlaybackWorkerEvent(message);
    if (event.kind === "failure") {
      return;
    }

    switch (event.value.kind) {
      case "playback-state":
        commitPlaybackWireState(event.value.state);
        return;
      case "authorization-redirect":
        navigateToSpotifyAuthorization(event.value.url);
        return;
      case "callback-url-restored":
        restoreCallbackUrl(event.value.url);
        return;
      case "fatal-initialization-failure":
        replaceSnapshot(
          fatalSnapshot(
            event.value.code === "invalid-public-configuration"
              ? "configuration-unavailable"
              : "browser-capability-unavailable",
          ),
        );
        return;
      case "safe-diagnostic":
        return;
    }
  }

  function commitPlaybackWireState(state: PlaybackWireState): void {
    const deserialized = deserializePlaybackWireState(state);
    if (deserialized.kind === "failure") {
      replaceSnapshot(playbackSnapshot(malformedWorkerPlaybackState()));
      return;
    }

    replaceSnapshot(playbackSnapshot(deserialized.value));
  }

  function navigateToSpotifyAuthorization(input: string): void {
    const authorizationUrl = parseSpotifyAuthorizationUrl(
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
    const restored = parseRestoredCallbackUrl(input, ports.location.current());
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
      return Object.freeze({ kind: "unavailable" });
    }

    return Object.freeze({ kind: "available", value: runtime });
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

function captureCallbackCommand(currentUrl: URL): CallbackCommand {
  const isCallback = callbackQueryParameterNames.some((parameter): boolean =>
    currentUrl.searchParams.has(parameter),
  );

  if (!isCallback) {
    return Object.freeze({ kind: "none" });
  }

  const callbackUrl = new URL(currentUrl);
  for (const parameter of displayQueryParameterNames) {
    callbackUrl.searchParams.delete(parameter);
  }

  return Object.freeze({
    kind: "pending",
    callbackUrl: callbackUrl.toString(),
  });
}

function displayReturnConfiguration(currentUrl: URL): unknown {
  const display = parseDisplayQuery(currentUrl.searchParams);
  const width = displayWidth(display);
  const setup = displaySetupRequested(display);

  return Object.freeze({ width, setup });
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

    return frozenInvalidDisplayQuery();
  }

  const widthValues = parameters.getAll("width");
  const setupValues = parameters.getAll("setup");
  if (widthValues.length > 1 || setupValues.length > 1) {
    return frozenInvalidDisplayQuery();
  }

  const hasSetup = setupValues.length === 1;
  if (hasSetup && setupValues[0] !== "1") {
    return frozenInvalidDisplayQuery();
  }

  if (widthValues.length === 0) {
    return hasSetup ? frozenSetupDisplayQuery() : frozenNoDisplayQuery();
  }

  const widthValue = widthValues[0];
  if (widthValue === undefined || !/^\d+$/.test(widthValue)) {
    return frozenInvalidDisplayQuery();
  }

  const width = Number(widthValue);
  if (
    !Number.isSafeInteger(width) ||
    width < minimumDisplayWidth ||
    width > maximumDisplayWidth
  ) {
    return frozenInvalidDisplayQuery();
  }

  return hasSetup
    ? frozenWidthAndSetupDisplayQuery(width)
    : frozenWidthDisplayQuery(width);
}

function frozenInvalidDisplayQuery(): DisplayQuery {
  return Object.freeze({ kind: "invalid" });
}

function frozenNoDisplayQuery(): DisplayQuery {
  return Object.freeze({ kind: "none" });
}

function frozenSetupDisplayQuery(): DisplayQuery {
  return Object.freeze({ kind: "setup" });
}

function frozenWidthDisplayQuery(width: number): DisplayQuery {
  return Object.freeze({ kind: "width", width });
}

function frozenWidthAndSetupDisplayQuery(width: number): DisplayQuery {
  return Object.freeze({ kind: "width-and-setup", width });
}

function serializeWorkerPublicConfiguration(
  configuration: SpotifyPublicConfiguration,
): WorkerPublicConfiguration {
  const serialized: WorkerPublicConfiguration = {
    spotify: Object.freeze({
      clientId: configuration.spotify.clientId.toAuthorizationParameter(),
      redirectUri: configuration.spotify.redirectUri.toAuthorizationParameter(),
    }),
  };

  return Object.freeze(serialized);
}

function parseSpotifyAuthorizationUrl(
  input: string,
  applicationUrl: URL,
): SpotifyAuthorizationUrl {
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.origin !== spotifyAuthorizationOrigin ||
      url.pathname !== "/authorize" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !hasExpectedSpotifyAuthorizationParameters(url, applicationUrl)
    ) {
      return Object.freeze({ kind: "invalid" });
    }

    return Object.freeze({ kind: "valid", value: url });
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
}

function hasExpectedSpotifyAuthorizationParameters(
  authorizationUrl: URL,
  applicationUrl: URL,
): boolean {
  const parameters = authorizationUrl.searchParams;
  const hasOneValueForEachParameter = spotifyAuthorizationParameterNames.every(
    (parameter): boolean => parameters.getAll(parameter).length === 1,
  );
  const parameterCount = Array.from(parameters.keys()).length;
  if (
    !hasOneValueForEachParameter ||
    parameterCount !== spotifyAuthorizationParameterNames.length
  ) {
    return false;
  }

  const responseType = parameters.getAll("response_type")[0];
  const codeChallengeMethod = parameters.getAll("code_challenge_method")[0];
  const scope = parameters.getAll("scope")[0];
  if (
    responseType !== "code" ||
    codeChallengeMethod !== "S256" ||
    scope !== "user-read-currently-playing"
  ) {
    return false;
  }

  const publicParameters: ReadonlyArray<string | undefined> = [
    parameters.getAll("client_id")[0],
    parameters.getAll("code_challenge")[0],
    parameters.getAll("state")[0],
  ];
  if (
    publicParameters.some(
      (parameter): boolean =>
        parameter === undefined || parameter.trim().length === 0,
    )
  ) {
    return false;
  }

  const redirectUri = parameters.getAll("redirect_uri")[0];
  if (redirectUri === undefined) {
    return false;
  }

  return isSameOriginSpotifyCallback(redirectUri, applicationUrl);
}

function isSameOriginSpotifyCallback(
  input: string,
  applicationUrl: URL,
): boolean {
  try {
    const redirectUri = new URL(input);
    return (
      redirectUri.protocol === "https:" &&
      redirectUri.origin === applicationUrl.origin &&
      redirectUri.pathname === "/spotify/" &&
      redirectUri.username === "" &&
      redirectUri.password === "" &&
      redirectUri.search === "" &&
      redirectUri.hash === ""
    );
  } catch {
    return false;
  }
}

function parseRestoredCallbackUrl(
  input: string,
  currentUrl: URL,
): RestoredCallbackUrl {
  try {
    const parsed = new URL(input);
    if (
      parsed.origin !== currentUrl.origin ||
      parsed.pathname !== "/spotify/" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.hash !== ""
    ) {
      return Object.freeze({ kind: "invalid" });
    }

    const widthValues = parsed.searchParams.getAll("width");
    const setupValues = parsed.searchParams.getAll("setup");
    const parameterCount = Array.from(parsed.searchParams.keys()).length;
    if (
      widthValues.length !== 1 ||
      setupValues.length > 1 ||
      parameterCount !== widthValues.length + setupValues.length
    ) {
      return Object.freeze({ kind: "invalid" });
    }

    const width = widthValues[0];
    if (width === undefined || !/^\d+$/.test(width)) {
      return Object.freeze({ kind: "invalid" });
    }

    const parsedWidth = Number(width);
    if (
      !Number.isSafeInteger(parsedWidth) ||
      parsedWidth < minimumDisplayWidth ||
      parsedWidth > maximumDisplayWidth
    ) {
      return Object.freeze({ kind: "invalid" });
    }

    const setup = setupValues[0];
    if (setup !== undefined && setup !== "1") {
      return Object.freeze({ kind: "invalid" });
    }

    const restored = new URL("/spotify/", currentUrl.origin);
    restored.searchParams.set("width", `${parsedWidth}`);
    if (setup === "1") {
      restored.searchParams.set("setup", "1");
    }

    return Object.freeze({ kind: "valid", value: restored });
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
}

function malformedWorkerPlaybackState(): PlaybackState {
  const failed = transitionPlaybackState(initialPlaybackState(), {
    kind: "failure",
    failure: providerFailure("malformed-response"),
  });
  if (failed.kind === "success") {
    return failed.value;
  }

  throw new Error(
    "The initial playback state must accept a failure transition.",
  );
}

function playbackSnapshot(
  state: PlaybackState,
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "playback", state });
}

function fatalSnapshot(
  reason: Extract<
    BrowserPlaybackApplicationSnapshot,
    { readonly kind: "fatal" }
  >["reason"],
): BrowserPlaybackApplicationSnapshot {
  return Object.freeze({ kind: "fatal", reason });
}
