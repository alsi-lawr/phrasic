import { expect, test } from "bun:test";

import { outwardStatusCode } from "../terminator/deadline-status";

test("a Tonic timeout under a valid deadline becomes deadline exceeded", () => {
  expect(
    outwardStatusCode("valid", { code: 1, detail: "Timeout expired" }),
  ).toBe(4);
});

test("a Tonic timeout without a valid deadline remains cancelled", () => {
  expect(
    outwardStatusCode("not-valid", { code: 1, detail: "Timeout expired" }),
  ).toBe(1);
});

test("an unrelated cancellation under a valid deadline remains cancelled", () => {
  expect(
    outwardStatusCode("valid", { code: 1, detail: "Cancelled by caller" }),
  ).toBe(1);
});
