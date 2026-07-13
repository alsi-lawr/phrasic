import type { ComponentProps } from "react";
import Artist from "../../components/artist/Artist.tsx";
import { type PlaybackWorkerContextValue } from "../../components/playback/PlaybackWorkerContext.ts";
import Title from "../../components/title/Title.tsx";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type { LastPlaybackItem, PlaybackState } from "../../domain/playback.ts";
import type {
  PlaybackWireItemAvailability,
  PlaybackWireState,
} from "../../browser/worker/playback-wire.ts";

declare const trustedState: PlaybackState;
declare const trustedItem: LastPlaybackItem;
declare const wireState: PlaybackWireState;
declare const wireItem: PlaybackWireItemAvailability;

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
const artistProps: ComponentProps<typeof Artist> = Object.freeze({
  item: trustedItem,
});
const titleProps: ComponentProps<typeof Title> = Object.freeze({
  item: trustedItem,
});

// @ts-expect-error React receives trusted domain playback states, not worker wire values.
const untrustedSnapshot: BrowserPlaybackApplicationSnapshot = Object.freeze({
  kind: "playback",
  state: wireState,
});
// @ts-expect-error The React playback context cannot expose bearer tokens.
context.accessToken = "token-value";
// @ts-expect-error Artist accepts only trusted now-playing items.
const untrustedArtistProps: ComponentProps<typeof Artist> = Object.freeze({
  item: wireItem,
});
// @ts-expect-error Title accepts only trusted now-playing items.
const untrustedTitleProps: ComponentProps<typeof Title> = Object.freeze({
  item: wireItem,
});

void context;
void artistProps;
void titleProps;
void untrustedSnapshot;
void untrustedArtistProps;
void untrustedTitleProps;
