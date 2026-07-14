import { maximumPlatformTimerDelayMilliseconds } from "../domain/playback.ts";

export const spotifyHttpRequestDeadlineMilliseconds = 15_000;

export type BrowserRequestDeadlineScheduleOptions = {
  readonly delayMilliseconds: number;
  readonly run: () => void;
};

export type BrowserRequestDeadlineScheduledTask = {
  readonly cancel: () => void;
};

export type BrowserRequestDeadlineSchedulerPort = {
  readonly schedule: (
    options: BrowserRequestDeadlineScheduleOptions,
  ) => BrowserRequestDeadlineScheduledTask;
};

export type BrowserRequestDeadlineOutcome =
  | {
      readonly kind: "active";
    }
  | {
      readonly kind: "caller-aborted";
    }
  | {
      readonly kind: "deadline-expired";
    };

export type BrowserRequestDeadline = {
  readonly dispose: () => void;
  readonly outcome: () => BrowserRequestDeadlineOutcome;
  readonly signal: AbortSignal;
};

export type BrowserRequestDeadlineOptions = {
  readonly signal: AbortSignal;
  readonly timeoutMilliseconds: number;
};

export type BrowserRequestDeadlinePort = {
  readonly create: (
    options: BrowserRequestDeadlineOptions,
  ) => BrowserRequestDeadline;
};

export function createBrowserRequestDeadlinePort(
  scheduler: BrowserRequestDeadlineSchedulerPort,
): BrowserRequestDeadlinePort {
  const port: BrowserRequestDeadlinePort = {
    create(options: BrowserRequestDeadlineOptions): BrowserRequestDeadline {
      return createBrowserRequestDeadline(scheduler, options);
    },
  };

  return port;
}

function createBrowserRequestDeadline(
  scheduler: BrowserRequestDeadlineSchedulerPort,
  options: BrowserRequestDeadlineOptions,
): BrowserRequestDeadline {
  if (!isValidTimeoutMilliseconds(options.timeoutMilliseconds)) {
    throw new Error("Browser request deadline must be a safe positive delay.");
  }

  const controller = new AbortController();
  let outcome: BrowserRequestDeadlineOutcome = activeOutcome();
  let scheduledTask: BrowserRequestDeadlineScheduledTask | undefined;
  let observesCallerAbort = false;

  const cleanup = (): void => {
    if (scheduledTask !== undefined) {
      scheduledTask.cancel();
      scheduledTask = undefined;
    }

    if (observesCallerAbort) {
      options.signal.removeEventListener("abort", abortForCaller);
      observesCallerAbort = false;
    }
  };

  const abortForCaller = (): void => {
    if (outcome.kind !== "active") {
      return;
    }

    outcome = callerAbortedOutcome();
    controller.abort();
    cleanup();
  };

  const expireDeadline = (): void => {
    if (outcome.kind !== "active") {
      return;
    }

    outcome = deadlineExpiredOutcome();
    controller.abort();
    cleanup();
  };

  if (options.signal.aborted) {
    abortForCaller();
  } else {
    options.signal.addEventListener("abort", abortForCaller, { once: true });
    observesCallerAbort = true;

    let task: BrowserRequestDeadlineScheduledTask;
    try {
      task = scheduler.schedule({
        delayMilliseconds: options.timeoutMilliseconds,
        run: expireDeadline,
      });
    } catch (error: unknown) {
      cleanup();
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Browser request deadline scheduler failed.", {
        cause: error,
      });
    }

    if (outcome.kind === "active") {
      scheduledTask = task;
    } else {
      task.cancel();
    }
  }

  const deadline: BrowserRequestDeadline = {
    dispose: cleanup,
    outcome(): BrowserRequestDeadlineOutcome {
      return outcome;
    },
    signal: controller.signal,
  };

  return deadline;
}

function isValidTimeoutMilliseconds(timeoutMilliseconds: number): boolean {
  return (
    Number.isSafeInteger(timeoutMilliseconds) &&
    timeoutMilliseconds > 0 &&
    timeoutMilliseconds <= maximumPlatformTimerDelayMilliseconds
  );
}

function activeOutcome(): BrowserRequestDeadlineOutcome {
  return { kind: "active" };
}

function callerAbortedOutcome(): BrowserRequestDeadlineOutcome {
  return { kind: "caller-aborted" };
}

function deadlineExpiredOutcome(): BrowserRequestDeadlineOutcome {
  return { kind: "deadline-expired" };
}
