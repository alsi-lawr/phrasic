import {
  AmbiguityReason,
  CapabilityStatus,
  GetSnapshotResponse,
  PlaybackActivity,
  SelectionReason,
  UnavailableReason,
  type AvailableSnapshot,
} from "../generated/phrasic/local/v1/local_media_pb.js";
import {
  createLocalSuccessfulSnapshot,
  LocalDestination,
  LocalDurationMilliseconds,
  LocalNativeIdentity,
  LocalPositionMilliseconds,
  LocalText,
  NativeMonotonicMilliseconds,
  resolveLocalPlaybackPresentation,
  trustedPolicyStatus,
  trustedSelectedLocalPlayback,
  type LocalActivity,
  type LocalLastSuccessfulSnapshot,
  type LocalPlaybackMetadata,
  type LocalSuccessfulSnapshot,
  type TrustedLocalPlaybackOutcome,
} from "../../domain/local-playback.ts";

export type MappedLocalSnapshot = {
  readonly lastSuccessful: LocalLastSuccessfulSnapshot;
  readonly nativeNowMilliseconds: number;
  readonly pollHintMilliseconds: number;
  readonly presentation: ReturnType<typeof resolveLocalPlaybackPresentation>;
};

export function mapGeneratedSnapshot(
  response: GetSnapshotResponse,
  previous: LocalLastSuccessfulSnapshot,
): MappedLocalSnapshot {
  try {
    return mappedSnapshot(response, previous);
  } catch {
    return unavailableSnapshot(previous, 0);
  }
}

export function mapTransportFailure(
  previous: LocalLastSuccessfulSnapshot,
  nativeNowMilliseconds: number,
): MappedLocalSnapshot {
  return unavailableSnapshot(previous, nativeNowMilliseconds);
}

function mappedSnapshot(
  response: GetSnapshotResponse,
  previous: LocalLastSuccessfulSnapshot,
): MappedLocalSnapshot {
  const nativeNowMilliseconds = response.getObservedAtMonotonicMilliseconds();
  const nativeNow = NativeMonotonicMilliseconds.trusted(nativeNowMilliseconds);
  let lastSuccessful = previous;
  let outcome: TrustedLocalPlaybackOutcome;

  switch (response.getCapability()?.getStatus()) {
    case CapabilityStatus.CAPABILITY_STATUS_UNSUPPORTED_PLATFORM:
      outcome = { kind: "unsupported-platform" };
      break;
    case CapabilityStatus.CAPABILITY_STATUS_NATIVE_SESSION_UNAVAILABLE:
      outcome = { kind: "native-session-unavailable" };
      break;
    case CapabilityStatus.CAPABILITY_STATUS_AVAILABLE:
      switch (response.getOutcomeCase()) {
        case GetSnapshotResponse.OutcomeCase.AVAILABLE: {
          const available = required(response.getAvailable());
          const snapshot = successfulSnapshot(available, nativeNow);
          lastSuccessful = Object.freeze({ kind: "available", snapshot });
          outcome = trustedSelectedLocalPlayback({
            reason: selectionReason(available.getSelectionReason()),
            snapshot,
          });
          break;
        }
        case GetSnapshotResponse.OutcomeCase.EMPTY:
          outcome = emptyOutcome(
            required(response.getEmpty()).getSelectionReason(),
          );
          break;
        case GetSnapshotResponse.OutcomeCase.AMBIGUOUS:
          outcome = ambiguousOutcome(
            required(response.getAmbiguous()).getReason(),
          );
          break;
        case GetSnapshotResponse.OutcomeCase.UNAVAILABLE:
          outcome = unavailableOutcome(
            required(response.getUnavailable()).getReason(),
          );
          break;
        case GetSnapshotResponse.OutcomeCase.STALE: {
          const stale = required(response.getStale());
          const observedAtMilliseconds =
            nativeNowMilliseconds - stale.getLastSuccessAgeMilliseconds();
          if (observedAtMilliseconds < 0) {
            return invalidGeneratedState();
          }
          const snapshot = successfulSnapshot(
            required(stale.getLastSnapshot()),
            NativeMonotonicMilliseconds.trusted(observedAtMilliseconds),
          );
          lastSuccessful = Object.freeze({ kind: "available", snapshot });
          outcome = unavailableOutcome(stale.getReason());
          break;
        }
        case GetSnapshotResponse.OutcomeCase.OUTCOME_NOT_SET:
          return invalidGeneratedState();
      }
      break;
    case CapabilityStatus.CAPABILITY_STATUS_UNSPECIFIED:
    case undefined:
      return invalidGeneratedState();
    default:
      return invalidGeneratedState();
  }

  return Object.freeze({
    lastSuccessful,
    nativeNowMilliseconds,
    pollHintMilliseconds: response.getPollHintMilliseconds(),
    presentation: resolveLocalPlaybackPresentation({
      lastSuccessful,
      now: nativeNow,
      outcome,
    }),
  });
}

function successfulSnapshot(
  available: AvailableSnapshot,
  observedAt: NativeMonotonicMilliseconds,
): LocalSuccessfulSnapshot {
  const item = available.getItem();
  const timeline = available.getTimeline();
  const metadata: LocalPlaybackMetadata = Object.freeze({
    ...(item?.hasTitle() === true
      ? { title: LocalText.trusted(item.getTitle()) }
      : {}),
    ...(item?.hasCreator() === true
      ? { creator: LocalText.trusted(item.getCreator()) }
      : {}),
    ...(item?.hasCollection() === true
      ? { collection: LocalText.trusted(item.getCollection()) }
      : {}),
    ...(item?.hasDestination() === true
      ? { destination: LocalDestination.trusted(item.getDestination()) }
      : {}),
    ...(item?.hasNativeIdentity() === true
      ? {
          nativeIdentity: LocalNativeIdentity.trusted(item.getNativeIdentity()),
        }
      : {}),
    ...(timeline?.hasDurationMilliseconds() === true
      ? {
          duration: LocalDurationMilliseconds.trusted(
            timeline.getDurationMilliseconds(),
          ),
        }
      : {}),
    ...(timeline?.hasPositionMilliseconds() === true
      ? {
          position: LocalPositionMilliseconds.trusted(
            timeline.getPositionMilliseconds(),
          ),
        }
      : {}),
  });

  return createLocalSuccessfulSnapshot({
    activity: localActivity(available.getActivity()),
    metadata,
    observedAt,
  });
}

function localActivity(value: PlaybackActivity): LocalActivity {
  switch (value) {
    case PlaybackActivity.PLAYBACK_ACTIVITY_PLAYING:
      return "playing";
    case PlaybackActivity.PLAYBACK_ACTIVITY_PAUSED:
      return "paused";
    case PlaybackActivity.PLAYBACK_ACTIVITY_STOPPED:
      return "stopped";
    case PlaybackActivity.PLAYBACK_ACTIVITY_UNSPECIFIED:
      return invalidGeneratedState();
  }
  return invalidGeneratedState();
}

function selectionReason(
  value: SelectionReason,
): "sole-not-playing" | "sole-playing" | "strict-pin" {
  switch (value) {
    case SelectionReason.SELECTION_REASON_STRICT_PIN:
      return "strict-pin";
    case SelectionReason.SELECTION_REASON_SOLE_PLAYING:
      return "sole-playing";
    case SelectionReason.SELECTION_REASON_SOLE_NON_PLAYING:
      return "sole-not-playing";
    case SelectionReason.SELECTION_REASON_UNSPECIFIED:
      return invalidGeneratedState();
  }
  return invalidGeneratedState();
}

function emptyOutcome(value: SelectionReason): TrustedLocalPlaybackOutcome {
  switch (value) {
    case SelectionReason.SELECTION_REASON_STRICT_PIN:
      return trustedPolicyStatus({
        kind: "unavailable",
        reason: "strict-pin-unavailable",
      });
    case SelectionReason.SELECTION_REASON_SOLE_PLAYING:
    case SelectionReason.SELECTION_REASON_SOLE_NON_PLAYING:
      return trustedPolicyStatus({ kind: "unavailable", reason: "no-source" });
    case SelectionReason.SELECTION_REASON_UNSPECIFIED:
      return invalidGeneratedState();
  }
  return invalidGeneratedState();
}

function ambiguousOutcome(value: AmbiguityReason): TrustedLocalPlaybackOutcome {
  switch (value) {
    case AmbiguityReason.AMBIGUITY_REASON_MULTIPLE_PLAYING:
      return trustedPolicyStatus({
        kind: "ambiguous",
        reason: "multiple-playing",
      });
    case AmbiguityReason.AMBIGUITY_REASON_MULTIPLE_NON_PLAYING:
      return trustedPolicyStatus({
        kind: "ambiguous",
        reason: "multiple-not-playing",
      });
    case AmbiguityReason.AMBIGUITY_REASON_UNSPECIFIED:
      return invalidGeneratedState();
  }
  return invalidGeneratedState();
}

function unavailableOutcome(
  value: UnavailableReason,
): TrustedLocalPlaybackOutcome {
  switch (value) {
    case UnavailableReason.UNAVAILABLE_REASON_NO_SOURCE:
      return trustedPolicyStatus({ kind: "unavailable", reason: "no-source" });
    case UnavailableReason.UNAVAILABLE_REASON_STRICT_PIN_LOST:
      return trustedPolicyStatus({
        kind: "unavailable",
        reason: "strict-pin-unavailable",
      });
    case UnavailableReason.UNAVAILABLE_REASON_NATIVE_SESSION_UNAVAILABLE:
      return { kind: "native-session-unavailable" };
    case UnavailableReason.UNAVAILABLE_REASON_UNSPECIFIED:
      return invalidGeneratedState();
  }
  return invalidGeneratedState();
}

function unavailableSnapshot(
  previous: LocalLastSuccessfulSnapshot,
  nativeNowMilliseconds: number,
): MappedLocalSnapshot {
  return Object.freeze({
    lastSuccessful: previous,
    nativeNowMilliseconds,
    pollHintMilliseconds: 1_000,
    presentation: resolveLocalPlaybackPresentation({
      lastSuccessful: previous,
      now: NativeMonotonicMilliseconds.trusted(
        Math.max(0, nativeNowMilliseconds),
      ),
      outcome: { kind: "native-session-unavailable" },
    }),
  });
}

function required<Value>(value: Value | undefined): Value {
  return value === undefined ? invalidGeneratedState() : value;
}

function invalidGeneratedState(): never {
  throw new Error("Generated Local state is unavailable.");
}
