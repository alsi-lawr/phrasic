import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeTestRunner,
  type NativeTestRunner,
} from "./toolchain.fixture.ts";

test("Node runs an erasable TypeScript node:test module", () => {
  const runner: NativeTestRunner = nativeTestRunner();

  assert.equal(runner, "node:test");
});
