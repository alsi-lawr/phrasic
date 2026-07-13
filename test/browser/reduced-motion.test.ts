import assert from "node:assert/strict";
import test from "node:test";
import {
  reducedMotionPreferenceStoreFor,
  type ReducedMotionMediaQuery,
} from "../../components/overlay/reduced-motion.ts";

test("the reduced-motion store observes native changes and removes its exact subscription", () => {
  const mediaQuery = new TestReducedMotionMediaQuery(false);
  const store = reducedMotionPreferenceStoreFor(mediaQuery);
  const snapshots: boolean[] = [];

  const unsubscribe = store.subscribe((): void => {
    snapshots.push(store.getSnapshot());
  });

  assert.equal(store.getSnapshot(), false);
  assert.equal(mediaQuery.listenerCount, 1);

  mediaQuery.setMatches(true);

  assert.equal(store.getSnapshot(), true);
  assert.deepEqual(snapshots, [true]);

  unsubscribe();

  assert.equal(mediaQuery.listenerCount, 0);
  mediaQuery.setMatches(false);
  assert.deepEqual(snapshots, [true]);
});

class TestReducedMotionMediaQuery implements ReducedMotionMediaQuery {
  private readonly listeners = new Set<() => void>();
  private currentMatches: boolean;

  public constructor(matches: boolean) {
    this.currentMatches = matches;
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public get matches(): boolean {
    return this.currentMatches;
  }

  public addEventListener(type: "change", listener: () => void): void {
    if (type !== "change") {
      throw new Error(`Unexpected media query event: ${type}`);
    }

    this.listeners.add(listener);
  }

  public removeEventListener(type: "change", listener: () => void): void {
    if (type !== "change") {
      throw new Error(`Unexpected media query event: ${type}`);
    }

    this.listeners.delete(listener);
  }

  public setMatches(matches: boolean): void {
    this.currentMatches = matches;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
