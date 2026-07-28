import type { LocalUnavailableStatus } from "../../domain/local-playback.ts";
import type { LocalPlaybackView } from "../../browser/local/presentation-view.ts";

export function localPresentationLabel(
  presentation: LocalPlaybackView,
): string {
  switch (presentation.kind) {
    case "content":
      return localActivityLabel(presentation.snapshot.activity);
    case "idle":
      return "LOCAL PLAYBACK";
    case "metadata-unavailable":
      return "PLAYBACK METADATA UNAVAILABLE";
    case "stale-content":
      return "LOCAL PLAYBACK STALE";
    case "unavailable":
      return "LOCAL PLAYBACK UNAVAILABLE";
  }

  return unreachable(presentation);
}

export function localPresentationMessage(
  presentation: LocalPlaybackView,
): string {
  switch (presentation.kind) {
    case "content":
      return `${localActivityLabel(presentation.snapshot.activity)} local playback.`;
    case "idle":
      return "Waiting for active playback.";
    case "metadata-unavailable":
      return "Playback metadata unavailable.";
    case "stale-content":
      return `Local playback is stale. ${localUnavailableStatusMessage(presentation.status)}`;
    case "unavailable":
      return `Local playback unavailable. ${localUnavailableStatusMessage(presentation.status)}`;
  }

  return unreachable(presentation);
}

export function localAutomaticActionMessage(
  presentation: LocalPlaybackView,
): string {
  switch (presentation.action.kind) {
    case "automatic-status":
      return "Local playback status updates automatically.";
    case "automatic-retry":
      return "Local playback retries automatically.";
  }

  return unreachable(presentation.action);
}

function localActivityLabel(
  activity: "paused" | "playing" | "stopped",
): string {
  switch (activity) {
    case "playing":
      return "PLAYING";
    case "paused":
      return "PAUSED";
    case "stopped":
      return "STOPPED";
  }

  return unreachable(activity);
}

function localUnavailableStatusMessage(status: LocalUnavailableStatus): string {
  switch (status) {
    case "ambiguous-sources":
      return "Multiple Local media sources are equally eligible.";
    case "incompatible-api":
      return "The Local playback API is incompatible.";
    case "native-session-unavailable":
      return "The Local native session is unavailable.";
    case "no-source":
      return "No Local media source is available.";
    case "strict-pin-unavailable":
      return "The pinned Local media source is unavailable.";
    case "unsupported-platform":
      return "This platform does not support Local playback.";
  }

  return unreachable(status);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local presentation value: ${String(value)}`);
}
