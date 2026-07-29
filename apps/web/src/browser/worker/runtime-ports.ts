import type { AuthorizationProviderPort } from "../auth/provider.ts";
import type { PlaybackProviderPort } from "../providers/provider.ts";
import type { PlaybackWorkerEvent } from "./protocol.ts";

export type PlaybackWorkerClockPort = { readonly now: () => number };
export type PlaybackWorkerScheduledTask = { readonly cancel: () => void };
export type PlaybackWorkerScheduleOptions = {
  readonly delayMilliseconds: number;
  readonly run: () => Promise<void>;
};
export type PlaybackWorkerSchedulerPort = {
  readonly schedule: (
    options: PlaybackWorkerScheduleOptions,
  ) => PlaybackWorkerScheduledTask;
};
export type PlaybackWorkerCancellationPort = {
  readonly create: () => AbortController;
};
export type PlaybackWorkerEventSink = {
  readonly emit: (event: PlaybackWorkerEvent) => void;
};
export type PlaybackWorkerRuntimePorts = {
  readonly authorization: AuthorizationProviderPort;
  readonly cancellation: PlaybackWorkerCancellationPort;
  readonly clock: PlaybackWorkerClockPort;
  readonly events: PlaybackWorkerEventSink;
  readonly playbackProvider: PlaybackProviderPort;
  readonly scheduler: PlaybackWorkerSchedulerPort;
};
