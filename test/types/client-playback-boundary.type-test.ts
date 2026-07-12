import type { LastPlaybackItem, PlaybackState } from "../../domain/playback.ts";
import { parsePlaybackEvent } from "../../domain/playback-stream.ts";
import type {
  PlaybackWireItemAvailability,
  PlaybackWireState,
} from "../../domain/playback-stream.ts";
import Artist from "../../components/artist/Artist.tsx";
import { type FetchDataContextValue } from "../../components/hookintoupdates/FetchDataProvider.tsx";
import Title from "../../components/title/Title.tsx";
import type { ComponentProps } from "react";

declare const trustedState: PlaybackState;
declare const trustedItem: LastPlaybackItem;
declare const wireState: PlaybackWireState;
declare const wireItem: PlaybackWireItemAvailability;

const context: FetchDataContextValue = Object.freeze({ state: trustedState });
const parsedState: PlaybackState = parsePlaybackEvent("{}");
const artistProps: ComponentProps<typeof Artist> = Object.freeze({
  item: trustedItem,
});
const titleProps: ComponentProps<typeof Title> = Object.freeze({
  item: trustedItem,
});

// @ts-expect-error Fetch context accepts only trusted playback states.
const untrustedContext: FetchDataContextValue = Object.freeze({
  state: wireState,
});
// @ts-expect-error Artist accepts only trusted now-playing items.
const untrustedArtistProps: ComponentProps<typeof Artist> = Object.freeze({
  item: wireItem,
});
// @ts-expect-error Title accepts only trusted now-playing items.
const untrustedTitleProps: ComponentProps<typeof Title> = Object.freeze({
  item: wireItem,
});
// @ts-expect-error EventSource parsing commits wire values to trusted playback states.
const parsedWireState: PlaybackWireState = parsePlaybackEvent("{}");

void context;
void parsedState;
void artistProps;
void titleProps;
void untrustedContext;
void untrustedArtistProps;
void untrustedTitleProps;
void parsedWireState;
