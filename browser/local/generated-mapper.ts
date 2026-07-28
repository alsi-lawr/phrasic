import {
  AmbiguityReason,
  CapabilityStatus,
  GetSnapshotResponse,
  PlaybackActivity,
  SelectionReason,
  UnavailableReason,
  type AvailableSnapshot,
  type PlaybackItem,
  type Timeline,
} from "../generated/phrasic/local/v1/local_media_pb.js";
import {
  createLocalSuccessfulSnapshot,
  NativeMonotonicMilliseconds,
  parseLocalPlaybackMetadata,
  resolveLocalPlaybackPresentation,
  trustedPolicyStatus,
  trustedSelectedLocalPlayback,
  type LocalActivity,
  type LocalLastSuccessfulSnapshot,
  type LocalPlaybackMetadata,
  type LocalPlaybackPresentation,
  type LocalSuccessfulSnapshot,
  type TrustedLocalPlaybackOutcome,
} from "../../domain/local-playback.ts";
import { failed, succeeded, type Result } from "../../domain/result.ts";

export type MappedLocalSnapshot = {
  readonly lastSuccessful: LocalLastSuccessfulSnapshot;
  readonly nativeNowMilliseconds: number;
  readonly pollHintMilliseconds: number;
  readonly presentation: LocalPlaybackPresentation;
};

type MappingFailure = { readonly kind: "mapping-failure" };

const minimumPollHintMilliseconds = 500;
const maximumPollHintMilliseconds = 5_000;

export function mapGeneratedSnapshot(
  response: GetSnapshotResponse,
  previous: LocalLastSuccessfulSnapshot,
): MappedLocalSnapshot {
  const nativeNow = monotonic(response.getObservedAtMonotonicMilliseconds());
  const mapped = mapOutcome(response, nativeNow);

  if (nativeNow.kind === "failure" || mapped.kind === "failure") {
    return unavailableSnapshot(previous, 0);
  }

  const lastSuccessful =
    mapped.value.successful === undefined
      ? previous
      : Object.freeze({
          kind: "available",
          snapshot: mapped.value.successful,
        });
  return Object.freeze({
    lastSuccessful,
    nativeNowMilliseconds: response.getObservedAtMonotonicMilliseconds(),
    pollHintMilliseconds: clampPollHint(response.getPollHintMilliseconds()),
    presentation: resolveLocalPlaybackPresentation({
      lastSuccessful,
      now: mapped.value.now,
      outcome: mapped.value.outcome,
    }),
  });
}

export function mapTransportFailure(
  previous: LocalLastSuccessfulSnapshot,
  nativeNowMilliseconds: number,
): MappedLocalSnapshot {
  return unavailableSnapshot(previous, nativeNowMilliseconds);
}

type MappedOutcome = {
  readonly now: NativeMonotonicMilliseconds;
  readonly outcome: TrustedLocalPlaybackOutcome;
  readonly successful?: LocalSuccessfulSnapshot;
};

function mapOutcome(
  response: GetSnapshotResponse,
  nativeNow: Result<NativeMonotonicMilliseconds, MappingFailure>,
): Result<MappedOutcome, MappingFailure> {
  if (nativeNow.kind === "failure") {
    return nativeNow;
  }

  const capability = response.getCapability()?.getStatus();
  switch (capability) {
    case CapabilityStatus.CAPABILITY_STATUS_UNSUPPORTED_PLATFORM:
      return succeeded({
        now: nativeNow.value,
        outcome: { kind: "unsupported-platform" },
      });
    case CapabilityStatus.CAPABILITY_STATUS_NATIVE_SESSION_UNAVAILABLE:
      return succeeded({
        now: nativeNow.value,
        outcome: { kind: "native-session-unavailable" },
      });
    case CapabilityStatus.CAPABILITY_STATUS_AVAILABLE:
      break;
    case CapabilityStatus.CAPABILITY_STATUS_UNSPECIFIED:
    case undefined:
      return failed(mappingFailure());
    default:
      return failed(mappingFailure());
  }

  switch (response.getOutcomeCase()) {
    case GetSnapshotResponse.OutcomeCase.AVAILABLE:
      return mapAvailableOutcome(response.getAvailable(), nativeNow.value);
    case GetSnapshotResponse.OutcomeCase.EMPTY:
      return mapEmptyOutcome(response, nativeNow.value);
    case GetSnapshotResponse.OutcomeCase.AMBIGUOUS:
      return mapAmbiguousOutcome(response, nativeNow.value);
    case GetSnapshotResponse.OutcomeCase.UNAVAILABLE:
      return succeeded({
        now: nativeNow.value,
        outcome: unavailableOutcome(response.getUnavailable()?.getReason()),
      });
    case GetSnapshotResponse.OutcomeCase.STALE:
      return mapStaleOutcome(response, nativeNow.value);
    case GetSnapshotResponse.OutcomeCase.OUTCOME_NOT_SET:
      return succeeded({
        now: nativeNow.value,
        outcome: { kind: "native-session-unavailable" },
      });
  }

  return failed(mappingFailure());
}

function mapEmptyOutcome(
  response: GetSnapshotResponse,
  now: NativeMonotonicMilliseconds,
): Result<MappedOutcome, MappingFailure> {
  const reason = unavailableReason(response.getEmpty()?.getSelectionReason());
  return reason.kind === "failure"
    ? reason
    : succeeded({
        now,
        outcome: trustedPolicyStatus({
          kind: "unavailable",
          reason: reason.value,
        }),
      });
}

function mapAmbiguousOutcome(
  response: GetSnapshotResponse,
  now: NativeMonotonicMilliseconds,
): Result<MappedOutcome, MappingFailure> {
  const reason = ambiguityReason(response.getAmbiguous()?.getReason());
  return reason.kind === "failure"
    ? reason
    : succeeded({
        now,
        outcome: trustedPolicyStatus({
          kind: "ambiguous",
          reason: reason.value,
        }),
      });
}

function mapAvailableOutcome(
  available: AvailableSnapshot | undefined,
  now: NativeMonotonicMilliseconds,
): Result<MappedOutcome, MappingFailure> {
  if (available === undefined) {
    return failed(mappingFailure());
  }
  const snapshot = mapAvailableSnapshot(available, now);
  if (snapshot.kind === "failure") {
    return snapshot;
  }
  const reason = selectionReason(available.getSelectionReason());
  if (reason.kind === "failure") {
    return reason;
  }
  return succeeded({
    now,
    outcome: trustedSelectedLocalPlayback({
      reason: reason.value,
      snapshot: snapshot.value,
    }),
    successful: snapshot.value,
  });
}

function mapStaleOutcome(
  response: GetSnapshotResponse,
  nativeNow: NativeMonotonicMilliseconds,
): Result<MappedOutcome, MappingFailure> {
  const stale = response.getStale();
  const available = stale?.getLastSnapshot();
  if (stale === undefined || available === undefined) {
    return failed(mappingFailure());
  }
  const age = stale.getLastSuccessAgeMilliseconds();
  const observedAt = response.getObservedAtMonotonicMilliseconds() - age;
  const observedAtMonotonic = monotonic(Math.max(0, observedAt));
  if (observedAtMonotonic.kind === "failure") {
    return observedAtMonotonic;
  }
  const snapshot = mapAvailableSnapshot(available, observedAtMonotonic.value);
  if (snapshot.kind === "failure") {
    return snapshot;
  }
  return succeeded({
    now: nativeNow,
    outcome: unavailableOutcome(stale.getReason()),
    successful: snapshot.value,
  });
}

function mapAvailableSnapshot(
  available: AvailableSnapshot,
  observedAt: NativeMonotonicMilliseconds,
): Result<LocalSuccessfulSnapshot, MappingFailure> {
  const activity = localActivity(available.getActivity());
  if (activity.kind === "failure") {
    return activity;
  }
  const metadata = mapMetadata(available.getItem(), available.getTimeline());
  if (metadata.kind === "failure") {
    return failed(mappingFailure());
  }

  return succeeded(
    createLocalSuccessfulSnapshot({
      activity: activity.value,
      metadata: metadata.value,
      observedAt,
    }),
  );
}

function mapMetadata(
  item: PlaybackItem | undefined,
  timeline: Timeline | undefined,
): Result<LocalPlaybackMetadata, MappingFailure> {
  const input = {
    ...(item?.hasTitle() === true ? { title: item.getTitle() } : {}),
    ...(item?.hasCreator() === true ? { creator: item.getCreator() } : {}),
    ...(item?.hasCollection() === true
      ? { collection: item.getCollection() }
      : {}),
    ...(item?.hasDestination() === true
      ? { destination: item.getDestination() }
      : {}),
    ...(item?.hasNativeIdentity() === true
      ? { nativeIdentity: item.getNativeIdentity() }
      : {}),
    ...(timeline?.hasDurationMilliseconds() === true
      ? { duration: timeline.getDurationMilliseconds() }
      : {}),
    ...(timeline?.hasPositionMilliseconds() === true
      ? { position: timeline.getPositionMilliseconds() }
      : {}),
  };
  const parsed = parseLocalPlaybackMetadata(input);
  return parsed.kind === "success"
    ? succeeded(parsed.value)
    : failed(mappingFailure());
}

function localActivity(
  value: PlaybackActivity,
): Result<LocalActivity, MappingFailure> {
  switch (value) {
    case PlaybackActivity.PLAYBACK_ACTIVITY_PLAYING:
      return succeeded("playing");
    case PlaybackActivity.PLAYBACK_ACTIVITY_PAUSED:
      return succeeded("paused");
    case PlaybackActivity.PLAYBACK_ACTIVITY_STOPPED:
      return succeeded("stopped");
    case PlaybackActivity.PLAYBACK_ACTIVITY_UNSPECIFIED:
      return failed(mappingFailure());
  }

  return failed(mappingFailure());
}

function selectionReason(
  value: SelectionReason,
): Result<"sole-not-playing" | "sole-playing" | "strict-pin", MappingFailure> {
  switch (value) {
    case SelectionReason.SELECTION_REASON_STRICT_PIN:
      return succeeded("strict-pin");
    case SelectionReason.SELECTION_REASON_SOLE_PLAYING:
      return succeeded("sole-playing");
    case SelectionReason.SELECTION_REASON_SOLE_NON_PLAYING:
      return succeeded("sole-not-playing");
    case SelectionReason.SELECTION_REASON_UNSPECIFIED:
      return failed(mappingFailure());
  }

  return failed(mappingFailure());
}

function ambiguityReason(
  value: AmbiguityReason | undefined,
): Result<"multiple-not-playing" | "multiple-playing", MappingFailure> {
  switch (value) {
    case AmbiguityReason.AMBIGUITY_REASON_MULTIPLE_PLAYING:
      return succeeded("multiple-playing");
    case AmbiguityReason.AMBIGUITY_REASON_MULTIPLE_NON_PLAYING:
      return succeeded("multiple-not-playing");
    case AmbiguityReason.AMBIGUITY_REASON_UNSPECIFIED:
    case undefined:
      return failed(mappingFailure());
  }
  return failed(mappingFailure());
}

function unavailableReason(
  value: SelectionReason | undefined,
): Result<"no-source" | "strict-pin-unavailable", MappingFailure> {
  switch (value) {
    case SelectionReason.SELECTION_REASON_STRICT_PIN:
      return succeeded("strict-pin-unavailable");
    case SelectionReason.SELECTION_REASON_SOLE_PLAYING:
    case SelectionReason.SELECTION_REASON_SOLE_NON_PLAYING:
      return succeeded("no-source");
    case SelectionReason.SELECTION_REASON_UNSPECIFIED:
    case undefined:
      return failed(mappingFailure());
  }
  return failed(mappingFailure());
}

function unavailableOutcome(
  value: UnavailableReason | undefined,
): TrustedLocalPlaybackOutcome {
  switch (value) {
    case UnavailableReason.UNAVAILABLE_REASON_STRICT_PIN_LOST:
      return trustedPolicyStatus({
        kind: "unavailable",
        reason: "strict-pin-unavailable",
      });
    case UnavailableReason.UNAVAILABLE_REASON_NO_SOURCE:
      return trustedPolicyStatus({ kind: "unavailable", reason: "no-source" });
    case UnavailableReason.UNAVAILABLE_REASON_UNSPECIFIED:
    case UnavailableReason.UNAVAILABLE_REASON_NATIVE_SESSION_UNAVAILABLE:
    case undefined:
      return { kind: "native-session-unavailable" };
  }

  return { kind: "native-session-unavailable" };
}

function unavailableSnapshot(
  previous: LocalLastSuccessfulSnapshot,
  nativeNowMilliseconds: number,
): MappedLocalSnapshot {
  const now = monotonic(nativeNowMilliseconds);
  const safeNow =
    now.kind === "success" ? now.value : successfulMonotonicOrigin();
  return Object.freeze({
    lastSuccessful: previous,
    nativeNowMilliseconds,
    pollHintMilliseconds: 1_000,
    presentation: resolveLocalPlaybackPresentation({
      lastSuccessful: previous,
      now: safeNow,
      outcome: { kind: "native-session-unavailable" },
    }),
  });
}

function monotonic(
  value: number,
): Result<NativeMonotonicMilliseconds, MappingFailure> {
  const parsed = NativeMonotonicMilliseconds.parse(value);
  return parsed.kind === "success"
    ? succeeded(parsed.value)
    : failed(mappingFailure());
}

function successfulMonotonicOrigin(): NativeMonotonicMilliseconds {
  const origin = NativeMonotonicMilliseconds.parse(0);
  if (origin.kind === "failure") {
    throw new Error("The fixed Local monotonic origin is invalid.");
  }
  return origin.value;
}

function clampPollHint(value: number): number {
  if (!Number.isSafeInteger(value)) {
    return 1_000;
  }
  return Math.min(
    maximumPollHintMilliseconds,
    Math.max(minimumPollHintMilliseconds, value),
  );
}

function mappingFailure(): MappingFailure {
  return { kind: "mapping-failure" };
}
