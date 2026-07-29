import assert from "node:assert/strict";
import { test } from "bun:test";
import type { GetSnapshotResponse } from "../../apps/web/src/browser/generated/phrasic/local/v1/local_media_pb.js";
import type { LocalGeneratedClient } from "../../apps/web/src/browser/local/generated-client.ts";
import { createLocalWorkerRuntime } from "../../apps/web/src/browser/local/worker-runtime.ts";

test("Local worker keeps one request in flight and aborts it when hidden", () => {
  let instanceCalls = 0;
  let requestSignal: AbortSignal | undefined;
  const client: LocalGeneratedClient = {
    getInstanceId(signal): Promise<Uint8Array> {
      instanceCalls += 1;
      requestSignal = signal;
      return new Promise(() => {});
    },
    getSnapshot(): Promise<GetSnapshotResponse> {
      return new Promise(() => {});
    },
  };
  const scheduled: Array<ReturnType<typeof setTimeout>> = [];
  const runtime = createLocalWorkerRuntime({
    createClient: () => client,
    monotonicNow: () => 0,
    publish: () => {},
    schedule(run, delayMilliseconds) {
      const timer = setTimeout(run, delayMilliseconds);
      scheduled.push(timer);
      return timer;
    },
    cancelSchedule(timer) {
      clearTimeout(timer);
    },
  });

  runtime.receive({
    kind: "initialize",
    origin: "http://127.0.0.1:4173",
    visibility: "visible",
  });
  runtime.receive({ kind: "visibility-change", visibility: "visible" });

  assert.equal(instanceCalls, 1);
  assert.equal(requestSignal?.aborted, false);

  runtime.receive({ kind: "visibility-change", visibility: "hidden" });
  assert.equal(requestSignal?.aborted, true);
  for (const timer of scheduled) {
    clearTimeout(timer);
  }
});

test("Local worker schedules the bounded retry ladder after failure", async () => {
  const delays: Array<number> = [];
  const scheduled: Array<ReturnType<typeof setTimeout>> = [];
  const client: LocalGeneratedClient = {
    getInstanceId(): Promise<Uint8Array> {
      return Promise.reject(new Error("native bridge unavailable"));
    },
    getSnapshot(): Promise<GetSnapshotResponse> {
      return Promise.reject(new Error("native bridge unavailable"));
    },
  };
  const runtime = createLocalWorkerRuntime({
    createClient: () => client,
    monotonicNow: () => 0,
    publish: () => {},
    schedule(run, delayMilliseconds) {
      delays.push(delayMilliseconds);
      const timer = setTimeout(run, 60_000);
      scheduled.push(timer);
      return timer;
    },
    cancelSchedule(timer) {
      clearTimeout(timer);
    },
  });

  runtime.receive({
    kind: "initialize",
    origin: "http://127.0.0.1:4173",
    visibility: "visible",
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(delays, [2_000, 250]);
  runtime.receive({ kind: "dispose" });
  for (const timer of scheduled) {
    clearTimeout(timer);
  }
});
