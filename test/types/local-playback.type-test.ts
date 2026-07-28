import {
  createLocalSuccessfulSnapshot,
  NativeMonotonicMilliseconds,
  parseLocalPlaybackMetadata,
  trustedSelectedLocalPlayback,
  type LocalPlaybackMetadata,
  type LocalPlaybackPresentation,
  type TrustedLocalPlaybackOutcome,
} from "../../domain/local-playback.ts";
import type { Result } from "../../domain/result.ts";

const timestamp = expectSuccess(NativeMonotonicMilliseconds.parse(0));
const metadata = expectSuccess(
  parseLocalPlaybackMetadata({ title: "Track title" }),
);
const snapshot = createLocalSuccessfulSnapshot({
  activity: "playing",
  metadata,
  observedAt: timestamp,
});
const selected = trustedSelectedLocalPlayback({
  reason: "sole-playing",
  snapshot,
});

const invalidMetadata: LocalPlaybackMetadata = {
  // @ts-expect-error Local titles require boundary validation.
  title: "Track title",
};
const invalidOutcome: TrustedLocalPlaybackOutcome = {
  kind: "policy-selected",
  selection: { kind: "selected", reason: "sole-playing" },
  // @ts-expect-error A selected Local policy outcome requires a trusted snapshot.
  snapshot: undefined,
};
const invalidPresentation: LocalPlaybackPresentation = {
  // @ts-expect-error Local presentation actions never expose authorization controls.
  action: { kind: "begin-authorization" },
  kind: "metadata-unavailable",
};

function presentationKind(
  presentation: LocalPlaybackPresentation,
): LocalPlaybackPresentation["kind"] {
  switch (presentation.kind) {
    case "content":
    case "metadata-unavailable":
    case "stale-content":
    case "unavailable":
      return presentation.kind;
  }

  const unhandledPresentation: never = presentation;
  return unhandledPresentation;
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Local type fixture.");
}

void invalidMetadata;
void invalidOutcome;
void invalidPresentation;
void presentationKind;
void selected;
