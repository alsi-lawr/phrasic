export type DeadlineValidity = "not-valid" | "valid";

type NativeStatusCause = {
  readonly code: number;
  readonly detail: string;
};

const cancelledStatus = 1;
const deadlineExceededStatus = 4;

export const outwardStatusCode = (
  deadline: DeadlineValidity,
  nativeStatus: NativeStatusCause,
): number =>
  deadline === "valid" &&
  nativeStatus.code === cancelledStatus &&
  nativeStatus.detail === "Timeout expired"
    ? deadlineExceededStatus
    : nativeStatus.code;
