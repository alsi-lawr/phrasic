import {
  createPlaybackWorkerFatalInitializationFailure,
  type PlaybackWorkerCommand,
  type PlaybackWorkerEvent,
} from "../worker/protocol.ts";
import {
  createPlaybackWorkerRuntime,
  type PlaybackWorkerEventSink,
  type PlaybackWorkerSchedulerPort,
} from "../worker/runtime.ts";
import type { FakeControlCommand } from "./control.ts";
import { createFakeMusicProviderRuntime } from "./provider.ts";

const provider = createFakeMusicProviderRuntime();

if (typeof AbortController === "undefined") {
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
    playbackProvider: provider.playback,
    scheduler: nativeWorkerScheduler(),
  });
  let terminal = false;

  self.addEventListener(
    "message",
    (event: MessageEvent<PlaybackWorkerCommand | FakeControlCommand>): void => {
      void receive(event.data);
    },
  );

  async function receive(
    message: PlaybackWorkerCommand | FakeControlCommand,
  ): Promise<void> {
    switch (message.kind) {
      case "initialize":
      case "begin-authorization":
      case "consume-callback":
      case "retry":
      case "visibility-change":
      case "logout":
        if (terminal) {
          return;
        }

        await runtime.receive(message);
        return;
      case "dispose":
        if (terminal) {
          return;
        }

        await runtime.receive(message);
        provider.dispose();
        terminal = true;
        return;
      case "resolve-authorization":
      case "expire-authorization":
      case "set-empty":
      case "set-track":
      case "set-episode":
      case "set-unsupported":
      case "set-provider-failure":
      case "set-fatal": {
        if (terminal) {
          return;
        }

        const applied = provider.applyControl(message);
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
