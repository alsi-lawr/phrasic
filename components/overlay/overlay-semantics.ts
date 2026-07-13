import {
  overlayItemIdentityKey,
  type OverlayItemIdentity,
  type OverlayItemMetadataPresentation,
  type OverlayMetadataView,
} from "./overlay-metadata.ts";
import type { OverlayStatusView, OverlayUiState } from "./overlay-state.ts";

export type OverlayAnnouncementIdentity =
  | {
      readonly kind: "state";
      readonly stateKind: OverlayUiState["kind"];
    }
  | {
      readonly itemIdentity: OverlayItemIdentity;
      readonly kind: "state-and-item";
      readonly stateKind: OverlayUiState["kind"];
    };

export type OverlayAnnouncement = {
  readonly identity: OverlayAnnouncementIdentity;
  readonly message: string;
};

export type OverlaySemanticDefinition = {
  readonly term: string;
  readonly value: string;
};

export type OverlaySemanticView = {
  readonly announcement: OverlayAnnouncement;
  readonly definitions: ReadonlyArray<OverlaySemanticDefinition>;
};

export function semanticViewForOverlayPresentation(
  stateKind: OverlayUiState["kind"],
  status: OverlayStatusView,
  metadata: OverlayMetadataView,
): OverlaySemanticView {
  return Object.freeze({
    announcement: announcementForPresentation(stateKind, metadata),
    definitions: semanticDefinitionsFor(status, metadata),
  });
}

export function overlayAnnouncementIdentityKey(
  identity: OverlayAnnouncementIdentity,
): string {
  switch (identity.kind) {
    case "state":
      return `state:${identity.stateKind}`;
    case "state-and-item":
      return `item:${identity.stateKind}:${overlayItemIdentityKey(identity.itemIdentity)}`;
  }

  return unreachable(identity);
}

function announcementForPresentation(
  stateKind: OverlayUiState["kind"],
  metadata: OverlayMetadataView,
): OverlayAnnouncement {
  return Object.freeze({
    identity: announcementIdentityForMetadata(stateKind, metadata),
    message: announcementMessageForMetadata(metadata),
  });
}

function semanticDefinitionsFor(
  status: OverlayStatusView,
  metadata: OverlayMetadataView,
): ReadonlyArray<OverlaySemanticDefinition> {
  const statusDefinitions = semanticStatusDefinitions(status);

  switch (metadata.kind) {
    case "status":
      return frozenSemanticDefinitions([
        ...statusDefinitions,
        semanticDefinition("Details", metadata.subtitle),
        semanticDefinition("Guidance", metadata.context),
      ]);
    case "track":
      return frozenSemanticDefinitions([
        ...statusDefinitions,
        semanticDefinition("Track", metadata.trackTitle.value),
        semanticDefinition("Artists", artistNames(metadata.artists)),
        semanticDefinition("Album", metadata.album.title.value),
        semanticDefinition(
          "Metadata freshness",
          metadataFreshness(metadata.presentation),
        ),
      ]);
    case "episode":
      return frozenSemanticDefinitions([
        ...statusDefinitions,
        semanticDefinition("Episode", metadata.episodeTitle.value),
        semanticDefinition("Show", metadata.show.title.value),
        semanticDefinition("Publisher", metadata.show.publisher.value),
        semanticDefinition(
          "Metadata freshness",
          metadataFreshness(metadata.presentation),
        ),
      ]);
  }

  return unreachable(metadata);
}

function semanticStatusDefinitions(
  status: OverlayStatusView,
): ReadonlyArray<OverlaySemanticDefinition> {
  return frozenSemanticDefinitions([
    semanticDefinition("Playback state", status.label),
    semanticDefinition("Status", status.message),
  ]);
}

function announcementIdentityForMetadata(
  stateKind: OverlayUiState["kind"],
  metadata: OverlayMetadataView,
): OverlayAnnouncementIdentity {
  switch (metadata.kind) {
    case "status":
      return frozenStateAnnouncementIdentity(stateKind);
    case "episode":
    case "track":
      return frozenItemAnnouncementIdentity(stateKind, metadata.itemIdentity);
  }

  return unreachable(metadata);
}

function announcementMessageForMetadata(metadata: OverlayMetadataView): string {
  switch (metadata.kind) {
    case "status":
      return `${metadata.title} ${metadata.subtitle} ${metadata.context}`;
    case "track":
      return `${itemPresentationAnnouncement(metadata.presentation)} track: ${metadata.trackTitle.value}. Artists: ${artistNames(metadata.artists)}. Album: ${metadata.album.title.value}.`;
    case "episode":
      return `${itemPresentationAnnouncement(metadata.presentation)} episode: ${metadata.episodeTitle.value}. Show: ${metadata.show.title.value}. Publisher: ${metadata.show.publisher.value}.`;
  }

  return unreachable(metadata);
}

function frozenStateAnnouncementIdentity(
  stateKind: OverlayUiState["kind"],
): OverlayAnnouncementIdentity {
  return Object.freeze({ kind: "state", stateKind });
}

function frozenItemAnnouncementIdentity(
  stateKind: OverlayUiState["kind"],
  itemIdentity: OverlayItemIdentity,
): OverlayAnnouncementIdentity {
  return Object.freeze({
    itemIdentity,
    kind: "state-and-item",
    stateKind,
  });
}

function itemPresentationAnnouncement(
  presentation: OverlayItemMetadataPresentation,
): string {
  switch (presentation.kind) {
    case "now-playing":
      return "Now playing";
    case "paused":
      return "Playback paused";
    case "stale":
      return "Reconnecting to Spotify. Last known";
  }

  return unreachable(presentation);
}

function metadataFreshness(
  presentation: OverlayItemMetadataPresentation,
): string {
  switch (presentation.kind) {
    case "now-playing":
      return "Current playback item.";
    case "paused":
      return "Paused playback item.";
    case "stale":
      return "Last known playback item while Spotify reconnects.";
  }

  return unreachable(presentation);
}

function artistNames(
  artists: Extract<OverlayMetadataView, { readonly kind: "track" }>["artists"],
): string {
  return artists.map((artist): string => artist.name.value).join(", ");
}

function semanticDefinition(
  term: string,
  value: string,
): OverlaySemanticDefinition {
  return Object.freeze({ term, value });
}

function frozenSemanticDefinitions(
  definitions: ReadonlyArray<OverlaySemanticDefinition>,
): ReadonlyArray<OverlaySemanticDefinition> {
  return Object.freeze([...definitions]);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay semantic value: ${String(value)}`);
}
