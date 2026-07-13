import {
  metadataViewForOverlayState,
  overlayItemIdentityKey,
  type OverlayItemIdentity,
  type OverlayItemMetadataPresentation,
  type OverlayMetadataView,
} from "./overlay-metadata.ts";
import {
  visualTreatmentForOverlayState,
  type OverlayUiState,
} from "./overlay-state.ts";

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

export type OverlaySemanticStatus = {
  readonly kind: OverlayUiState["kind"];
  readonly label: string;
  readonly message: string;
};

export type OverlaySemanticDefinition = {
  readonly term: string;
  readonly value: string;
};

export type OverlaySemanticView = {
  readonly announcement: OverlayAnnouncement;
  readonly definitions: ReadonlyArray<OverlaySemanticDefinition>;
  readonly metadata: OverlayMetadataView;
  readonly status: OverlaySemanticStatus;
};

export function semanticViewForOverlayState(
  state: OverlayUiState,
): OverlaySemanticView {
  const metadata = metadataViewForOverlayState(state);
  const status = semanticStatusForOverlayState(state);
  const semanticView: OverlaySemanticView = {
    announcement: announcementForOverlayState(state, metadata),
    definitions: semanticDefinitionsFor(status, metadata),
    metadata,
    status,
  };

  return Object.freeze(semanticView);
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

function semanticStatusForOverlayState(
  state: OverlayUiState,
): OverlaySemanticStatus {
  const treatment = visualTreatmentForOverlayState(state);
  const status: OverlaySemanticStatus = {
    kind: state.kind,
    label: treatment.label,
    message: treatment.message,
  };

  return Object.freeze(status);
}

function announcementForOverlayState(
  state: OverlayUiState,
  metadata: OverlayMetadataView,
): OverlayAnnouncement {
  const announcement: OverlayAnnouncement = {
    identity: announcementIdentityForMetadata(state, metadata),
    message: announcementMessageForMetadata(metadata),
  };

  return Object.freeze(announcement);
}

function semanticDefinitionsFor(
  status: OverlaySemanticStatus,
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
  status: OverlaySemanticStatus,
): ReadonlyArray<OverlaySemanticDefinition> {
  return frozenSemanticDefinitions([
    semanticDefinition("Playback state", status.label),
    semanticDefinition("Status", status.message),
  ]);
}

function announcementIdentityForMetadata(
  state: OverlayUiState,
  metadata: OverlayMetadataView,
): OverlayAnnouncementIdentity {
  switch (metadata.kind) {
    case "status":
      return frozenStateAnnouncementIdentity(state.kind);
    case "episode":
    case "track":
      return frozenItemAnnouncementIdentity(state.kind, metadata.itemIdentity);
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
  const identity: OverlayAnnouncementIdentity = {
    kind: "state",
    stateKind,
  };

  return Object.freeze(identity);
}

function frozenItemAnnouncementIdentity(
  stateKind: OverlayUiState["kind"],
  itemIdentity: OverlayItemIdentity,
): OverlayAnnouncementIdentity {
  const identity: OverlayAnnouncementIdentity = {
    itemIdentity,
    kind: "state-and-item",
    stateKind,
  };

  return Object.freeze(identity);
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
  const definition: OverlaySemanticDefinition = { term, value };

  return Object.freeze(definition);
}

function frozenSemanticDefinitions(
  definitions: ReadonlyArray<OverlaySemanticDefinition>,
): ReadonlyArray<OverlaySemanticDefinition> {
  return Object.freeze([...definitions]);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay semantic value: ${String(value)}`);
}
