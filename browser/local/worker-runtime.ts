import {
  unavailableLocalLastSuccessfulSnapshot,
  type LocalLastSuccessfulSnapshot,
} from "../../domain/local-playback.ts";
import type { LocalGeneratedClient } from "./generated-client.ts";
import {
  mapGeneratedSnapshot,
  mapTransportFailure,
  type MappedLocalSnapshot,
} from "./generated-mapper.ts";
import { localPlaybackView } from "./presentation-view.ts";
import type {
  LocalPageVisibility,
  LocalWorkerCommand,
  LocalWorkerEvent,
} from "./protocol.ts";

type LocalWorkerPorts = {
  readonly createClient: (origin: string) => LocalGeneratedClient;
  readonly monotonicNow: () => number;
  readonly publish: (event: LocalWorkerEvent) => void;
  readonly schedule: (
    run: () => void,
    delayMilliseconds: number,
  ) => ReturnType<typeof setTimeout>;
  readonly cancelSchedule: (identifier: ReturnType<typeof setTimeout>) => void;
};

export type LocalWorkerRuntime = {
  readonly receive: (command: LocalWorkerCommand) => void;
};

type RuntimeState =
  | { readonly kind: "not-initialized" }
  | { readonly kind: "disposed" }
  | {
      readonly kind: "active";
      readonly client: LocalGeneratedClient;
      readonly instance:
        | { readonly kind: "pending" }
        | { readonly kind: "available"; readonly value: Uint8Array };
      readonly visibility: LocalPageVisibility;
    };

const retryDelaysMilliseconds: ReadonlyArray<number> = [
  250, 500, 1_000, 2_000, 5_000,
];
const requestDeadlineMilliseconds = 2_000;

export function createLocalWorkerRuntime(
  ports: LocalWorkerPorts,
): LocalWorkerRuntime {
  let state: RuntimeState = { kind: "not-initialized" };
  let request: AbortController | undefined;
  let requestDeadline: ReturnType<typeof setTimeout> | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let retryIndex = 0;
  let lastSuccessful: LocalLastSuccessfulSnapshot =
    unavailableLocalLastSuccessfulSnapshot();
  let lastNativeNowMilliseconds = 0;
  let lastResponseAt = ports.monotonicNow();

  return {
    receive(command: LocalWorkerCommand): void {
      switch (command.kind) {
        case "initialize":
          if (state.kind !== "not-initialized") {
            return;
          }
          state = {
            kind: "active",
            client: ports.createClient(command.origin),
            instance: { kind: "pending" },
            visibility: command.visibility,
          };
          if (command.visibility === "visible") {
            beginPoll();
          }
          return;
        case "visibility-change":
          if (state.kind !== "active") {
            return;
          }
          state = { ...state, visibility: command.visibility };
          if (command.visibility === "hidden") {
            stopCurrentWork();
          } else {
            beginPoll();
          }
          return;
        case "dispose":
          state = { kind: "disposed" };
          stopCurrentWork();
          return;
      }
    },
  };

  function beginPoll(): void {
    if (
      state.kind !== "active" ||
      state.visibility !== "visible" ||
      request !== undefined
    ) {
      return;
    }
    clearScheduled();

    const active = state;
    const abortController = new AbortController();
    request = abortController;
    requestDeadline = ports.schedule(
      (): void => abortController.abort(),
      requestDeadlineMilliseconds,
    );
    void poll(active, abortController);
  }

  async function poll(
    active: Extract<RuntimeState, { readonly kind: "active" }>,
    abortController: AbortController,
  ): Promise<void> {
    try {
      const instance =
        active.instance.kind === "available"
          ? active.instance.value
          : await active.client.getInstanceId(abortController.signal);
      if (!isCurrent(active, abortController)) {
        return;
      }
      state = { ...active, instance: { kind: "available", value: instance } };
      const response = await active.client.getSnapshot(
        instance,
        abortController.signal,
      );
      if (!isCurrent(state, abortController) || state.kind !== "active") {
        return;
      }
      const mapped = mapGeneratedSnapshot(response, lastSuccessful);
      acceptSnapshot(mapped);
      retryIndex = 0;
      finishRequest();
      scheduleNext(mapped.pollHintMilliseconds);
    } catch {
      if (!isCurrent(state, abortController) || state.kind !== "active") {
        return;
      }
      const elapsed = Math.max(0, ports.monotonicNow() - lastResponseAt);
      const mapped = mapTransportFailure(
        lastSuccessful,
        lastNativeNowMilliseconds + elapsed,
      );
      acceptSnapshot(mapped);
      finishRequest();
      const retryDelay =
        retryDelaysMilliseconds[
          Math.min(retryIndex, retryDelaysMilliseconds.length - 1)
        ] ?? 5_000;
      retryIndex = Math.min(retryIndex + 1, retryDelaysMilliseconds.length);
      scheduleNext(retryDelay);
    }
  }

  function acceptSnapshot(mapped: MappedLocalSnapshot): void {
    lastSuccessful = mapped.lastSuccessful;
    lastNativeNowMilliseconds = mapped.nativeNowMilliseconds;
    lastResponseAt = ports.monotonicNow();
    ports.publish({
      kind: "presentation",
      presentation: localPlaybackView(mapped.presentation),
    });
  }

  function isCurrent(
    active: RuntimeState,
    abortController: AbortController,
  ): boolean {
    return (
      state.kind === "active" &&
      active.kind === "active" &&
      state.client === active.client &&
      request === abortController
    );
  }

  function finishRequest(): void {
    request = undefined;
    if (requestDeadline !== undefined) {
      ports.cancelSchedule(requestDeadline);
      requestDeadline = undefined;
    }
  }

  function scheduleNext(delayMilliseconds: number): void {
    if (state.kind !== "active" || state.visibility !== "visible") {
      return;
    }
    clearScheduled();
    scheduled = ports.schedule(beginPoll, delayMilliseconds);
  }

  function stopCurrentWork(): void {
    request?.abort();
    request = undefined;
    if (requestDeadline !== undefined) {
      ports.cancelSchedule(requestDeadline);
      requestDeadline = undefined;
    }
    clearScheduled();
  }

  function clearScheduled(): void {
    if (scheduled === undefined) {
      return;
    }
    ports.cancelSchedule(scheduled);
    scheduled = undefined;
  }
}
