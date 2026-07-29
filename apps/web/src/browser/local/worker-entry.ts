import { createLocalGeneratedClient } from "./generated-client.ts";
import type { LocalWorkerCommand } from "./protocol.ts";
import { createLocalWorkerRuntime } from "./worker-runtime.ts";

const runtime = createLocalWorkerRuntime({
  cancelSchedule(identifier): void {
    clearTimeout(identifier);
  },
  createClient: createLocalGeneratedClient,
  monotonicNow(): number {
    return performance.now();
  },
  publish(event): void {
    globalThis.postMessage(event);
  },
  schedule(run, delayMilliseconds): ReturnType<typeof setTimeout> {
    return globalThis.setTimeout(run, delayMilliseconds);
  },
});

globalThis.addEventListener(
  "message",
  (event: MessageEvent<LocalWorkerCommand>): void => {
    runtime.receive(event.data);
  },
);
