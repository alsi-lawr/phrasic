import assert from "node:assert/strict";
import { test } from "bun:test";
import { policyBScenarioFixtures } from "../domain/local-policy-fixtures.ts";
import {
  createLocalSuccessfulSnapshot,
  NativeMonotonicMilliseconds,
  parseLocalPlaybackMetadata,
  resolveLocalPlaybackPresentation,
  trustedPolicyStatus,
  trustedSelectedLocalPlayback,
  unavailableLocalLastSuccessfulSnapshot,
  type LocalPlaybackMetadata,
  type LocalPlaybackPresentation,
  type TrustedLocalPlaybackOutcome,
} from "../domain/local-playback.ts";
import type { Result } from "../domain/result.ts";

test("Local metadata validates every optional field and omits every absent field", () => {
  const complete = metadata({
    artwork: "https://media.example/artwork.png",
    collection: "Collection title",
    creator: "Creator name",
    destination: "https://media.example/item",
    duration: 240_000,
    nativeIdentity: "native-identity",
    position: 12_000,
    title: "Track title",
  });

  assert.deepEqual(Object.keys(complete), [
    "title",
    "creator",
    "collection",
    "destination",
    "artwork",
    "duration",
    "position",
    "nativeIdentity",
  ]);
  assert.equal(complete.title?.toString(), "Track title");
  assert.equal(complete.creator?.toString(), "Creator name");
  assert.equal(complete.collection?.toString(), "Collection title");
  assert.equal(complete.destination?.toString(), "https://media.example/item");
  assert.equal(
    complete.artwork?.toString(),
    "https://media.example/artwork.png",
  );
  assert.equal(complete.duration?.toNumber(), 240_000);
  assert.equal(complete.position?.toNumber(), 12_000);
  assert.equal(complete.nativeIdentity?.toString(), "native-identity");

  const optionalFields: ReadonlyArray<OptionalMetadataCase> = [
    { field: "artwork", value: "https://media.example/artwork.png" },
    { field: "collection", value: "Collection title" },
    { field: "creator", value: "Creator name" },
    { field: "destination", value: "https://media.example/item" },
    { field: "duration", value: 240_000 },
    { field: "nativeIdentity", value: "native-identity" },
    { field: "position", value: 12_000 },
    { field: "title", value: "Track title" },
  ];

  for (const optionalField of optionalFields) {
    const single = metadata({ [optionalField.field]: optionalField.value });
    assert.deepEqual(Object.keys(single), [optionalField.field]);
  }

  assert.deepEqual(expectFailure(parseLocalPlaybackMetadata({ title: "" })), {
    field: "title",
    kind: "invalid-local-metadata",
    reason: "value-must-not-be-empty",
  });
  assert.deepEqual(
    expectFailure(parseLocalPlaybackMetadata({ unknown: "value" })),
    {
      field: "metadata",
      kind: "invalid-local-metadata",
      reason: "unexpected-field",
    },
  );
});

test("Local title absence is a non-content metadata-unavailable state", () => {
  const snapshot = successfulSnapshot(0, metadata({ creator: "Creator only" }));
  const presentation = resolveLocalPlaybackPresentation({
    lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
    now: monotonic(0),
    outcome: trustedSelectedLocalPlayback({ reason: "sole-playing", snapshot }),
  });

  assert.deepEqual(presentation, {
    action: { kind: "automatic-status" },
    kind: "metadata-unavailable",
  });
});

test("Local paused and stopped snapshots are neutral idle states", () => {
  for (const activity of ["paused", "stopped"] as const) {
    const snapshot = createLocalSuccessfulSnapshot({
      activity,
      metadata: metadata({
        artwork: "https://media.example/previous-artwork.png",
        title: "Previous title",
      }),
      observedAt: monotonic(0),
    });
    const presentation = resolveLocalPlaybackPresentation({
      lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
      now: monotonic(0),
      outcome: trustedSelectedLocalPlayback({
        reason: "sole-not-playing",
        snapshot,
      }),
    });

    assert.deepEqual(presentation, {
      action: { kind: "automatic-status" },
      kind: "idle",
    });
  }
});

test("Local monotonic freshness is inclusive at five and thirty seconds", () => {
  const snapshot = successfulSnapshot(0, metadata({ title: "Track title" }));
  const outcome = trustedSelectedLocalPlayback({
    reason: "sole-playing",
    snapshot,
  });
  const cases: ReadonlyArray<FreshnessCase> = [
    { expectedKind: "content", now: 5_000 },
    { expectedKind: "stale-content", now: 5_001 },
    { expectedKind: "stale-content", now: 30_000 },
    { expectedKind: "unavailable", now: 30_001 },
  ];

  for (const freshnessCase of cases) {
    const presentation = resolveLocalPlaybackPresentation({
      lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
      now: monotonic(freshnessCase.now),
      outcome,
    });
    assert.equal(presentation.kind, freshnessCase.expectedKind);
    assert.equal(
      presentation.action.kind,
      freshnessCase.expectedKind === "content"
        ? "automatic-status"
        : "automatic-retry",
    );
  }
});

test("Local retries retain stale content only after five seconds and discard it after thirty", () => {
  const snapshot = successfulSnapshot(0, metadata({ title: "Track title" }));
  const outcome = trustedPolicyStatus({
    kind: "unavailable",
    reason: "no-source",
  });
  const retained = resolveLocalPlaybackPresentation({
    lastSuccessful: Object.freeze({ kind: "available", snapshot }),
    now: monotonic(5_001),
    outcome,
  });
  const expired = resolveLocalPlaybackPresentation({
    lastSuccessful: Object.freeze({ kind: "available", snapshot }),
    now: monotonic(30_001),
    outcome,
  });

  assert.equal(retained.kind, "stale-content");
  if (retained.kind === "stale-content") {
    assert.equal(retained.action.kind, "automatic-retry");
    assert.equal(retained.snapshot.metadata.title.toString(), "Track title");
    assert.equal(retained.status, "no-source");
  }
  assert.deepEqual(expired, {
    action: { kind: "automatic-retry" },
    kind: "unavailable",
    status: "no-source",
  });
});

test("Local status outcomes remain automatic and distinguish support, session, ambiguity, and compatibility", () => {
  const cases: ReadonlyArray<StatusCase> = [
    {
      expectedStatus: "unsupported-platform",
      outcome: Object.freeze({ kind: "unsupported-platform" }),
    },
    {
      expectedStatus: "native-session-unavailable",
      outcome: Object.freeze({ kind: "native-session-unavailable" }),
    },
    {
      expectedStatus: "incompatible-api",
      outcome: Object.freeze({ kind: "incompatible-api" }),
    },
    {
      expectedStatus: "ambiguous-sources",
      outcome: trustedPolicyStatus({
        kind: "ambiguous",
        reason: "multiple-playing",
      }),
    },
    {
      expectedStatus: "no-source",
      outcome: trustedPolicyStatus({
        kind: "unavailable",
        reason: "no-source",
      }),
    },
    {
      expectedStatus: "strict-pin-unavailable",
      outcome: trustedPolicyStatus({
        kind: "unavailable",
        reason: "strict-pin-unavailable",
      }),
    },
  ];

  for (const statusCase of cases) {
    const presentation = resolveLocalPlaybackPresentation({
      lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
      now: monotonic(0),
      outcome: statusCase.outcome,
    });
    assert.deepEqual(presentation, {
      action: { kind: "automatic-retry" },
      kind: "unavailable",
      status: statusCase.expectedStatus,
    });
  }
});

test("Local policy fixtures cover trusted policy-B outcomes without source ordering or history", () => {
  const scenarios = policyBScenarioFixtures.map(
    (fixture): string => fixture.scenario,
  );

  assert.deepEqual(scenarios, [
    "available-strict-pin",
    "lost-strict-pin",
    "sole-playing-source",
    "multiple-playing-sources",
    "sole-paused-source",
    "sole-stopped-source",
    "multiple-not-playing-sources",
    "no-source",
  ]);
  for (const fixture of policyBScenarioFixtures) {
    assert.deepEqual(Object.keys(fixture), ["outcome", "scenario"]);
    assert.equal("source" in fixture.outcome, false);
    assert.equal("history" in fixture.outcome, false);
    assert.equal("order" in fixture.outcome, false);
  }
});

type OptionalMetadataCase = {
  readonly field:
    | "artwork"
    | "collection"
    | "creator"
    | "destination"
    | "duration"
    | "nativeIdentity"
    | "position"
    | "title";
  readonly value: number | string;
};

type FreshnessCase = {
  readonly expectedKind: LocalPlaybackPresentation["kind"];
  readonly now: number;
};

type StatusCase = {
  readonly expectedStatus: Extract<
    LocalPlaybackPresentation,
    { readonly kind: "unavailable" }
  >["status"];
  readonly outcome: TrustedLocalPlaybackOutcome;
};

function metadata(input: object): LocalPlaybackMetadata {
  return expectSuccess(parseLocalPlaybackMetadata(input));
}

function successfulSnapshot(
  observedAt: number,
  snapshotMetadata: LocalPlaybackMetadata,
) {
  return createLocalSuccessfulSnapshot({
    activity: "playing",
    metadata: snapshotMetadata,
    observedAt: monotonic(observedAt),
  });
}

function monotonic(value: number): NativeMonotonicMilliseconds {
  return expectSuccess(NativeMonotonicMilliseconds.parse(value));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Local result.");
}

function expectFailure<Value, Failure>(
  result: Result<Value, Failure>,
): Failure {
  if (result.kind === "failure") {
    return result.error;
  }

  throw new Error("Expected a failed Local result.");
}
