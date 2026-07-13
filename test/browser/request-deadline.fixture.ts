import type {
  BrowserRequestDeadlineScheduleOptions,
  BrowserRequestDeadlineSchedulerPort,
} from "../../browser/request-deadline.ts";

type ScheduledDeadline = {
  readonly delayMilliseconds: number;
  readonly run: () => void;
  cancelled: boolean;
  executed: boolean;
};

export class ManualRequestDeadlineScheduler implements BrowserRequestDeadlineSchedulerPort {
  private readonly deadlines: ScheduledDeadline[] = [];

  get cancelledDeadlineCount(): number {
    return this.deadlines.filter((deadline) => deadline.cancelled).length;
  }

  activeDelays(): ReadonlyArray<number> {
    return this.deadlines
      .filter((deadline) => !deadline.cancelled && !deadline.executed)
      .map((deadline) => deadline.delayMilliseconds)
      .sort((first, second) => first - second);
  }

  runNextWithDelay(delayMilliseconds: number): void {
    const deadline = this.deadlines.find(
      (candidate) =>
        !candidate.cancelled &&
        !candidate.executed &&
        candidate.delayMilliseconds === delayMilliseconds,
    );
    if (deadline === undefined) {
      throw new Error(
        `Expected a request deadline of ${delayMilliseconds} milliseconds.`,
      );
    }

    deadline.executed = true;
    deadline.run();
  }

  schedule(options: BrowserRequestDeadlineScheduleOptions): {
    readonly cancel: () => void;
  } {
    const deadline: ScheduledDeadline = {
      delayMilliseconds: options.delayMilliseconds,
      run: options.run,
      cancelled: false,
      executed: false,
    };
    this.deadlines.push(deadline);

    return Object.freeze({
      cancel(): void {
        deadline.cancelled = true;
      },
    });
  }
}
