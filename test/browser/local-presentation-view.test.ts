import assert from "node:assert/strict";
import { test } from "bun:test";
import { localPlaybackView } from "../../browser/local/presentation-view.ts";
import {
  createLocalSuccessfulSnapshot,
  NativeMonotonicMilliseconds,
  parseLocalPlaybackMetadata,
  resolveLocalPlaybackPresentation,
  trustedSelectedLocalPlayback,
  unavailableLocalLastSuccessfulSnapshot,
} from "../../domain/local-playback.ts";

test("Local presentation text survives the worker structured-clone boundary", () => {
  const parsed = parseLocalPlaybackMetadata({
    artwork: "https://media.example/generated-artwork.png",
    collection: "Generated collection",
    creator: "Generated creator",
    nativeIdentity: "org.mpris.MediaPlayer2.Generated",
    title: "Generated title",
  });
  if (parsed.kind === "failure") {
    throw new Error("The Local view fixture metadata is invalid.");
  }
  const snapshot = createLocalSuccessfulSnapshot({
    activity: "playing",
    metadata: parsed.value,
    observedAt: NativeMonotonicMilliseconds.trusted(1_000),
  });
  const presentation = resolveLocalPlaybackPresentation({
    lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
    now: NativeMonotonicMilliseconds.trusted(1_000),
    outcome: trustedSelectedLocalPlayback({
      reason: "sole-playing",
      snapshot,
    }),
  });

  const transferred = structuredClone(localPlaybackView(presentation));

  assert.equal(transferred.kind, "content");
  if (transferred.kind !== "content") {
    throw new Error("The Local view did not remain content.");
  }
  assert.deepEqual(transferred.snapshot.metadata, {
    artwork: "https://media.example/generated-artwork.png",
    collection: "Generated collection",
    creator: "Generated creator",
    nativeIdentity: "org.mpris.MediaPlayer2.Generated",
    title: "Generated title",
  });
  assert.doesNotMatch(
    Object.values(transferred.snapshot.metadata).join(" "),
    /\[object Object\]/,
  );
});
