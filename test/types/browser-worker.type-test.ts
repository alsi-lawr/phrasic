import type { PlaybackWireState } from "../../domain/playback-stream.ts";
import type {
  PlaybackWorkerCommand,
  PlaybackWorkerEvent,
  PlaybackWorkerSafeDiagnostic,
} from "../../browser/worker/protocol.ts";

const wireState: PlaybackWireState = { kind: "empty" };

const initialize: PlaybackWorkerCommand = {
  kind: "initialize",
  applicationUrl: "https://nowplaying.example/nowplaying",
  configuration: {
    spotify: {
      clientId: "browser-client-id",
      redirectUri: "https://nowplaying.example/spotify/",
    },
  },
};

const playbackEvent: PlaybackWorkerEvent = {
  kind: "playback-state",
  state: wireState,
};

const diagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "playback-poll",
  code: "playback-rate-limited",
  metadata: {
    kind: "http-status-and-retry-after",
    status: 429,
    retryAfterMilliseconds: 7_000,
  },
};

const tokenBearingCommand: PlaybackWorkerCommand = {
  kind: "retry",
  // @ts-expect-error Worker commands cannot carry bearer tokens.
  accessToken: "token-value",
};

const tokenBearingEvent: PlaybackWorkerEvent = {
  kind: "playback-state",
  state: wireState,
  // @ts-expect-error Worker playback events expose only provider-neutral wire state.
  accessToken: "token-value",
};

const payloadBearingDiagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "playback-poll",
  code: "playback-payload-invalid",
  metadata: { kind: "none" },
  // @ts-expect-error Safe diagnostics cannot contain provider payloads.
  payload: { access_token: "token-value" },
};

const callbackBearingDiagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "authorization",
  code: "authorization-required",
  metadata: { kind: "none" },
  // @ts-expect-error Safe diagnostics cannot contain callback values.
  callbackUrl: "https://nowplaying.example/spotify/?code=callback-value",
};

const headersBearingDiagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "playback-poll",
  code: "playback-server-failure",
  metadata: { kind: "none" },
  // @ts-expect-error Safe diagnostics cannot contain request headers.
  headers: { Authorization: "Bearer token-value" },
};

const bodyBearingDiagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "token-refresh",
  code: "authorization-transient-failure",
  metadata: { kind: "none" },
  // @ts-expect-error Safe diagnostics cannot contain request bodies.
  body: "refresh_token=token-value",
};

const rawErrorBearingDiagnostic: PlaybackWorkerSafeDiagnostic = {
  kind: "safe-diagnostic",
  operation: "storage",
  code: "storage-failure",
  metadata: { kind: "none" },
  // @ts-expect-error Safe diagnostics cannot contain raw errors.
  error: new Error("raw error"),
};

void initialize;
void playbackEvent;
void diagnostic;
void tokenBearingCommand;
void tokenBearingEvent;
void payloadBearingDiagnostic;
void callbackBearingDiagnostic;
void headersBearingDiagnostic;
void bodyBearingDiagnostic;
void rawErrorBearingDiagnostic;
