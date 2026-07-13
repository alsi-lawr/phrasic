import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserPlaybackApplication,
  type BrowserPlaybackApplication,
  type BrowserPlaybackApplicationPorts,
  type BrowserPlaybackWorker,
} from "../../browser/application.ts";
import type { PlaybackWorkerCommand } from "../../browser/worker/protocol.ts";

test("the browser application fetches same-origin configuration and validates worker messages before state commits", async () => {
  const fixture = applicationFixture({
    currentUrl:
      "https://nowplaying.example/spotify/?code=callback-code&state=callback-state",
  });

  fixture.application.start();
  await settleApplicationWork();

  assert.deepEqual(fixture.configurationUrls, [
    "https://nowplaying.example/config.json",
  ]);
  assert.deepEqual(fixture.configurationPageUrls, [
    "https://nowplaying.example/spotify/",
  ]);
  assert.deepEqual(fixture.replacedUrls, [
    "https://nowplaying.example/spotify/",
  ]);
  assert.deepEqual(commandKinds(fixture.worker.commands), [
    "initialize",
    "consume-callback",
    "visibility-change",
  ]);

  const initialize = fixture.worker.commands[0];
  if (initialize === undefined || initialize.kind !== "initialize") {
    throw new Error("Expected an initialize command.");
  }
  assert.deepEqual(initialize.configuration, {
    spotify: {
      clientId: "browser-client-id",
      redirectUri: "https://nowplaying.example/spotify/",
    },
  });

  fixture.worker.emitMessage({
    kind: "playback-state",
    state: { kind: "empty", accessToken: "must-not-reach-react" },
  });
  assert.deepEqual(fixture.application.getSnapshot(), {
    kind: "playback",
    state: { kind: "initializing" },
  });

  fixture.worker.emitMessage({
    kind: "playback-state",
    state: { kind: "empty" },
  });
  assert.deepEqual(fixture.application.getSnapshot(), {
    kind: "playback",
    state: { kind: "empty" },
  });

  fixture.worker.emitMessage({
    kind: "callback-url-restored",
    url: "https://nowplaying.example/spotify/?width=1280&setup=1",
  });
  assert.deepEqual(fixture.replacedUrls, [
    "https://nowplaying.example/spotify/",
    "https://nowplaying.example/spotify/?width=1280&setup=1",
  ]);

  fixture.worker.emitMessage({
    kind: "callback-url-restored",
    url: "https://attacker.example/spotify/?width=1280&setup=1",
  });

  const invalidRestorations: ReadonlyArray<string> = [
    "https://nowplaying.example/spotify/?width=1280&width=1281",
    "https://nowplaying.example/spotify/?width=1280.5",
    "https://nowplaying.example/spotify/?width=1280&setup=1&setup=1",
    "https://nowplaying.example/spotify/?width=1280&setup=true",
    "https://nowplaying.example/spotify/?width=1280&debug=true",
  ];
  for (const url of invalidRestorations) {
    fixture.worker.emitMessage({ kind: "callback-url-restored", url });
  }

  assert.equal(fixture.replacedUrls.length, 2);
});

test("the browser application strips callback credentials before configuration or diagnostics and retains only valid display settings", async () => {
  const callbackCode = "callback-code-sentinel";
  const callbackState = "callback-state-sentinel";
  const callbackDescription = "callback-description-sentinel";
  const fixture = applicationFixture({
    currentUrl:
      `https://nowplaying.example/spotify/?code=${callbackCode}` +
      `&state=${callbackState}&error=access_denied` +
      `&error_description=${callbackDescription}&width=1280&setup=1`,
  });

  fixture.application.start();
  fixture.worker.emitMessage({
    kind: "safe-diagnostic",
    operation: "authorization",
    code: "authorization-denied",
    metadata: { kind: "none" },
  });

  assert.deepEqual(fixture.replacedUrls, [
    "https://nowplaying.example/spotify/?width=1280&setup=1",
  ]);
  assert.doesNotMatch(
    fixture.replacedUrls.join("\n"),
    /callback-(?:code|state|description)-sentinel/,
  );

  await settleApplicationWork();
  assert.deepEqual(fixture.configurationPageUrls, [
    "https://nowplaying.example/spotify/?width=1280&setup=1",
  ]);

  const consumeCallback = fixture.worker.commands[1];
  if (
    consumeCallback === undefined ||
    consumeCallback.kind !== "consume-callback"
  ) {
    throw new Error("Expected exactly one callback consumption command.");
  }
  assert.equal(
    consumeCallback.callbackUrl,
    `https://nowplaying.example/spotify/?code=${callbackCode}` +
      `&state=${callbackState}&error=access_denied` +
      `&error_description=${callbackDescription}`,
  );

  fixture.application.start();
  assert.deepEqual(commandKinds(fixture.worker.commands), [
    "initialize",
    "consume-callback",
    "visibility-change",
  ]);
});

test("the browser application never restores unknown, repeated, or malformed callback display parameters", () => {
  const invalidDisplayQueries: ReadonlyArray<string> = [
    "width=1280&width=1281",
    "width=1280.5",
    "width=319",
    "setup=true",
    "setup=1&setup=1",
    "width=1280&setup=1&debug=true",
  ];

  for (const query of invalidDisplayQueries) {
    const fixture = applicationFixture({
      currentUrl:
        "https://nowplaying.example/spotify/?code=callback-code" +
        `&state=callback-state&${query}`,
    });

    fixture.application.start();

    assert.deepEqual(fixture.replacedUrls, [
      "https://nowplaying.example/spotify/",
    ]);
  }
});

test("the browser application falls back to the default display configuration when authorization starts from invalid settings", async () => {
  const invalidDisplayQueries: ReadonlyArray<string> = [
    "width=1280&width=1281",
    "width=1280.5",
    "setup=1&setup=1",
    "width=1280&debug=true",
  ];

  for (const query of invalidDisplayQueries) {
    const fixture = applicationFixture({
      currentUrl: `https://nowplaying.example/spotify/?${query}`,
    });
    fixture.application.start();
    await settleApplicationWork();
    fixture.application.beginAuthorization();

    assert.deepEqual(fixture.worker.commands[2], {
      kind: "begin-authorization",
      returnTo: { width: 1920, setup: false },
    });
  }
});

test("the browser application exposes semantic controls, visibility forwarding, and worker teardown", async () => {
  const fixture = applicationFixture({
    currentUrl: "https://nowplaying.example/spotify/?width=1280&setup=1",
  });

  fixture.application.start();
  await settleApplicationWork();
  fixture.application.beginAuthorization();
  fixture.setVisibility("hidden");
  fixture.application.retry();
  fixture.application.logout();

  const beginAuthorization = fixture.worker.commands[2];
  assert.deepEqual(beginAuthorization, {
    kind: "begin-authorization",
    returnTo: { width: 1280, setup: true },
  });
  assert.deepEqual(commandKinds(fixture.worker.commands), [
    "initialize",
    "visibility-change",
    "begin-authorization",
    "visibility-change",
    "retry",
    "logout",
  ]);

  fixture.application.dispose();
  assert.equal(fixture.worker.terminated, true);
  assert.equal(fixture.worker.commands.at(-1)?.kind, "dispose");

  fixture.worker.emitMessage({
    kind: "playback-state",
    state: { kind: "empty" },
  });
  assert.deepEqual(fixture.application.getSnapshot(), {
    kind: "playback",
    state: { kind: "initializing" },
  });
});

test("the browser application accepts only Spotify authorization redirects and safe configuration", async () => {
  const fixture = applicationFixture({
    currentUrl: "https://nowplaying.example/spotify/",
  });

  fixture.application.start();
  await settleApplicationWork();
  const authorizationUrl = validSpotifyAuthorizationUrl("authorization-state");
  fixture.worker.emitMessage({
    kind: "authorization-redirect",
    url: authorizationUrl,
  });
  assert.deepEqual(fixture.navigatedUrls, [authorizationUrl]);

  fixture.worker.emitMessage({
    kind: "authorization-redirect",
    url: "https://attacker.example/authorize?state=authorization-state",
  });
  assert.deepEqual(fixture.application.getSnapshot(), {
    kind: "fatal",
    reason: "browser-capability-unavailable",
  });

  const credentialRedirect = applicationFixture({
    currentUrl: "https://nowplaying.example/spotify/",
  });
  credentialRedirect.application.start();
  await settleApplicationWork();
  const invalidAuthorizationUrl = new URL(
    validSpotifyAuthorizationUrl("authorization-state"),
  );
  invalidAuthorizationUrl.searchParams.set(
    "client_secret",
    "must-not-enter-a-url",
  );
  credentialRedirect.worker.emitMessage({
    kind: "authorization-redirect",
    url: invalidAuthorizationUrl.toString(),
  });
  assert.deepEqual(credentialRedirect.navigatedUrls, []);
  assert.deepEqual(credentialRedirect.application.getSnapshot(), {
    kind: "fatal",
    reason: "browser-capability-unavailable",
  });

  const invalidConfiguration = applicationFixture({
    currentUrl: "https://nowplaying.example/spotify/",
    configuration: {
      spotify: {
        clientId: "browser-client-id",
        clientSecret: "must-not-be-accepted",
        redirectUri: "https://nowplaying.example/spotify/",
      },
    },
  });
  invalidConfiguration.application.start();
  await settleApplicationWork();
  assert.deepEqual(invalidConfiguration.application.getSnapshot(), {
    kind: "fatal",
    reason: "configuration-unavailable",
  });
  assert.deepEqual(invalidConfiguration.worker.commands, []);
});

type ApplicationFixtureOptions = {
  readonly configuration?: unknown;
  readonly currentUrl: string;
};

type ApplicationFixture = {
  readonly application: BrowserPlaybackApplication;
  readonly configurationPageUrls: string[];
  readonly configurationUrls: string[];
  readonly navigatedUrls: string[];
  readonly replacedUrls: string[];
  readonly setVisibility: (visibility: "hidden" | "visible") => void;
  readonly worker: FakeWorker;
};

function applicationFixture(
  options: ApplicationFixtureOptions,
): ApplicationFixture {
  const worker = new FakeWorker();
  const configurationPageUrls: string[] = [];
  const configurationUrls: string[] = [];
  const navigatedUrls: string[] = [];
  const replacedUrls: string[] = [];
  let currentUrl = new URL(options.currentUrl);
  let visibility: "hidden" | "visible" = "visible";
  let pageHideListener: (() => void) | undefined;
  let visibilityListener: (() => void) | undefined;
  const configuration = options.configuration ?? validConfiguration();
  const ports: BrowserPlaybackApplicationPorts = {
    createWorker(): BrowserPlaybackWorker {
      return worker;
    },
    async fetchConfiguration(request): Promise<{
      readonly ok: boolean;
      readonly readJson: () => Promise<unknown>;
    }> {
      configurationPageUrls.push(currentUrl.toString());
      configurationUrls.push(request.url.toString());
      return Object.freeze({
        ok: true,
        async readJson(): Promise<unknown> {
          return configuration;
        },
      });
    },
    location: Object.freeze({
      current(): URL {
        return new URL(currentUrl);
      },
      navigate(url: URL): void {
        navigatedUrls.push(url.toString());
      },
      replace(url: URL): void {
        currentUrl = new URL(url);
        replacedUrls.push(currentUrl.toString());
      },
    }),
    onPageHide(listener: () => void): () => void {
      pageHideListener = listener;
      return (): void => {
        if (pageHideListener === listener) {
          pageHideListener = undefined;
        }
      };
    },
    onVisibilityChange(listener: () => void): () => void {
      visibilityListener = listener;
      return (): void => {
        if (visibilityListener === listener) {
          visibilityListener = undefined;
        }
      };
    },
    visibility(): "hidden" | "visible" {
      return visibility;
    },
  };
  const application = createBrowserPlaybackApplication(Object.freeze(ports));

  return Object.freeze({
    application,
    configurationPageUrls,
    configurationUrls,
    navigatedUrls,
    replacedUrls,
    setVisibility(nextVisibility: "hidden" | "visible"): void {
      visibility = nextVisibility;
      visibilityListener?.();
    },
    worker,
  });
}

function validConfiguration(): unknown {
  return Object.freeze({
    spotify: Object.freeze({
      clientId: "browser-client-id",
      redirectUri: "https://nowplaying.example/spotify/",
    }),
  });
}

function validSpotifyAuthorizationUrl(state: string): string {
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", "browser-client-id");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", "https://nowplaying.example/spotify/");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", "authorization-code-challenge");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "user-read-currently-playing");

  return url.toString();
}

function commandKinds(
  commands: ReadonlyArray<PlaybackWorkerCommand>,
): ReadonlyArray<PlaybackWorkerCommand["kind"]> {
  return commands.map((command): PlaybackWorkerCommand["kind"] => command.kind);
}

async function settleApplicationWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class FakeWorker implements BrowserPlaybackWorker {
  private readonly errorListeners = new Set<() => void>();
  private readonly messageListeners = new Set<(message: unknown) => void>();
  private readonly postedCommands: PlaybackWorkerCommand[] = [];
  private didTerminate = false;

  get commands(): ReadonlyArray<PlaybackWorkerCommand> {
    return Object.freeze([...this.postedCommands]);
  }

  get terminated(): boolean {
    return this.didTerminate;
  }

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  onError(listener: () => void): () => void {
    this.errorListeners.add(listener);
    return (): void => {
      this.errorListeners.delete(listener);
    };
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.add(listener);
    return (): void => {
      this.messageListeners.delete(listener);
    };
  }

  postMessage(command: PlaybackWorkerCommand): void {
    this.postedCommands.push(command);
  }

  terminate(): void {
    this.didTerminate = true;
  }
}
