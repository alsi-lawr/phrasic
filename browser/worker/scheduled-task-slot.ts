import type {
  PlaybackWorkerScheduledTask,
  PlaybackWorkerSchedulerPort,
} from "./runtime-ports.ts";

export type ScheduledTaskSlot = {
  readonly cancel: () => void;
  readonly isScheduled: () => boolean;
  readonly schedule: (
    delayMilliseconds: number,
    run: () => Promise<void>,
  ) => boolean;
};

export function createScheduledTaskSlot(
  scheduler: PlaybackWorkerSchedulerPort,
  onFailure: () => void,
): ScheduledTaskSlot {
  let task: PlaybackWorkerScheduledTask | undefined;
  let generation = 0;

  const cancel = (): void => {
    generation += 1;
    const scheduledTask = task;
    task = undefined;
    if (scheduledTask === undefined) return;
    try {
      scheduledTask.cancel();
    } catch {
      onFailure();
    }
  };

  const isScheduled = (): boolean => task !== undefined;

  const schedule = (
    delayMilliseconds: number,
    run: () => Promise<void>,
  ): boolean => {
    cancel();
    const scheduledGeneration = generation;
    let invokedBeforeScheduleReturned = false;
    try {
      const scheduledTask = scheduler.schedule({
        delayMilliseconds,
        run(): Promise<void> {
          if (generation !== scheduledGeneration) return Promise.resolve();
          invokedBeforeScheduleReturned = true;
          task = undefined;
          return run();
        },
      });
      if (
        generation === scheduledGeneration &&
        !invokedBeforeScheduleReturned
      ) {
        task = scheduledTask;
      }
      return true;
    } catch {
      onFailure();
      return false;
    }
  };

  return { cancel, isScheduled, schedule };
}
