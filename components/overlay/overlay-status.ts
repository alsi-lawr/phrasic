import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";

export type OverlayVisualStatus = {
  readonly label: string;
  readonly message: string;
  readonly tone: "active" | "neutral" | "warning";
};

export function visualStatusForSnapshot(
  snapshot: BrowserPlaybackApplicationSnapshot,
): OverlayVisualStatus {
  if (snapshot.kind === "fatal") {
    return snapshot.reason === "configuration-unavailable"
      ? unavailableStatus("The browser configuration is unavailable.")
      : unavailableStatus("This browser cannot start Spotify playback.");
  }

  switch (snapshot.state.kind) {
    case "initializing":
      return neutralStatus("LOADING", "Loading playback.");
    case "authorization-required":
      return warningStatus("CONNECT", "Spotify authorization is required.");
    case "authorizing":
      return neutralStatus("AUTHORIZING", "Authorizing Spotify.");
    case "empty":
      return neutralStatus("IDLE", "No track is currently playing.");
    case "playing":
      return activeStatus("PLAYING", "Spotify is playing.");
    case "paused":
      return neutralStatus("PAUSED", "Spotify is paused.");
    case "unsupported":
      return warningStatus(
        "UNSUPPORTED",
        "The current Spotify item is unsupported.",
      );
    case "reconnecting":
      return warningStatus("RECONNECTING", "Reconnecting to Spotify.");
    case "failure":
      return unavailableStatus("Playback updates are unavailable.");
  }

  return unreachable(snapshot.state);
}

function activeStatus(label: string, message: string): OverlayVisualStatus {
  return frozenStatus(label, message, "active");
}

function neutralStatus(label: string, message: string): OverlayVisualStatus {
  return frozenStatus(label, message, "neutral");
}

function unavailableStatus(message: string): OverlayVisualStatus {
  return frozenStatus("OFFLINE", message, "warning");
}

function warningStatus(label: string, message: string): OverlayVisualStatus {
  return frozenStatus(label, message, "warning");
}

function frozenStatus(
  label: string,
  message: string,
  tone: OverlayVisualStatus["tone"],
): OverlayVisualStatus {
  const status: OverlayVisualStatus = {
    label,
    message,
    tone,
  };

  return Object.freeze(status);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay status variant: ${String(value)}`);
}
