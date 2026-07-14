import { createPlaybackProviderRegistry } from "../providers/registry.ts";
import {
  createPlaybackWorkerFatalInitializationFailure,
  parsePlaybackWorkerCommand,
  type PlaybackWorkerEvent,
} from "../worker/protocol.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerEventSink,
  type PlaybackWorkerSchedulerPort,
} from "../worker/runtime.ts";
import { parseFakeControlCommand } from "./control.ts";
import { createFakeMusicProviderRuntime } from "./provider.ts";

const provider = createFakeMusicProviderRuntime();
const providers = createPlaybackProviderRegistry([provider.playback]);

if (providers.kind === "failure" || typeof AbortController === "undefined") {
  self.postMessage(
    createPlaybackWorkerFatalInitializationFailure(
      "browser-capability-unavailable",
    ),
  );
} else {
  const events: PlaybackWorkerEventSink = Object.freeze({
    emit(event: PlaybackWorkerEvent): void {
      self.postMessage(event);
    },
  });
  const runtime = createPlaybackWorkerRuntime({
    authorization: provider.authorization,
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
    playbackProviderId: provider.playback.providerId,
    playbackProviders: providers.value,
    scheduler: nativeWorkerScheduler(),
  });
  let terminal = false;
  const applicationUrl = new URL("/fake/", self.location.origin);

  self.addEventListener("message", (event: MessageEvent<unknown>): void => {
    void receive(event.data);
  });

  async function receive(message: unknown): Promise<void> {
    const command = parsePlaybackWorkerCommand(message);
    if (command.kind === "success") {
      if (terminal) {
        return;
      }

      await runtime.receive(command.value);
      if (command.value.kind === "dispose") {
        provider.dispose();
        terminal = true;
      }
      return;
    }

    const control = parseFakeControlCommand(message, applicationUrl);
    if (control.kind === "failure" || terminal) {
      return;
    }

    const applied = provider.applyControl(control.value);
    switch (applied.kind) {
      case "none":
        return;
      case "playback-changed":
        await runtime.receive(Object.freeze({ kind: "retry" }));
        return;
      case "fatal":
        terminal = true;
        await runtime.receive(Object.freeze({ kind: "dispose" }));
        provider.dispose();
        self.postMessage(
          createPlaybackWorkerFatalInitializationFailure(
            applied.reason === "configuration-unavailable"
              ? "invalid-public-configuration"
              : "browser-capability-unavailable",
          ),
        );
        return;
    }

    return unreachable(applied);
  }
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

function unreachable(value: never): never {
  throw new Error(`Unexpected Fake Music worker result: ${String(value)}`);
}
