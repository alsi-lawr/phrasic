import { type PlaybackWorkerContextValue } from "../../components/playback/PlaybackWorkerContext.ts";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { PlaybackState } from "../../domain/playback.ts";

declare const trustedState: PlaybackState;

const snapshot: BrowserPlaybackApplicationSnapshot = Object.freeze({
  kind: "playback",
  state: trustedState,
});
const context: PlaybackWorkerContextValue = Object.freeze({
  beginAuthorization: (): void => undefined,
  logout: (): void => undefined,
  retry: (): void => undefined,
  snapshot,
});

// @ts-expect-error The React playback context cannot expose bearer tokens.
context.accessToken = "token-value";

void context;
