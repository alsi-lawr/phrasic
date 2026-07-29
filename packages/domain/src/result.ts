export type Result<Value, Failure> =
  | {
      readonly kind: "success";
      readonly value: Value;
    }
  | {
      readonly kind: "failure";
      readonly error: Failure;
    };

export function succeeded<Value>(value: Value): Result<Value, never> {
  return { kind: "success", value };
}

export function failed<Failure>(error: Failure): Result<never, Failure> {
  return { kind: "failure", error };
}
