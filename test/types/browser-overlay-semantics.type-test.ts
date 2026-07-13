import type { ComponentProps } from "react";
import { OverlaySemanticCompanion } from "../../components/overlay/OverlaySemanticCompanion.tsx";
import type { OverlayItemIdentity } from "../../components/overlay/overlay-metadata.ts";
import type {
  OverlayAnnouncementIdentity,
  OverlaySemanticDefinition,
  OverlaySemanticStatus,
  OverlaySemanticView,
} from "../../components/overlay/overlay-semantics.ts";

declare const itemIdentity: OverlayItemIdentity;
declare const semantic: OverlaySemanticView;

const stateAnnouncementIdentity: OverlayAnnouncementIdentity = Object.freeze({
  kind: "state",
  stateKind: "empty",
});
const itemAnnouncementIdentity: OverlayAnnouncementIdentity = Object.freeze({
  itemIdentity,
  kind: "state-and-item",
  stateKind: "playing",
});
const semanticStatus: OverlaySemanticStatus = Object.freeze({
  kind: "paused",
  label: "PAUSED",
  message: "Spotify is paused.",
});
const semanticDefinition: OverlaySemanticDefinition = Object.freeze({
  term: "Track",
  value: "Track title",
});
const companionProps: ComponentProps<typeof OverlaySemanticCompanion> =
  Object.freeze({ semantic });

const invalidStateAnnouncementIdentity: OverlayAnnouncementIdentity = {
  kind: "state",
  // @ts-expect-error State announcement identities can only use declared overlay state kinds.
  stateKind: "loading",
};
const invalidItemAnnouncementIdentity: OverlayAnnouncementIdentity = {
  itemIdentity: {
    // @ts-expect-error Item announcement identities require a validated provider item identifier.
    itemId: "track-1",
    // @ts-expect-error Item announcement identities require a validated provider identifier.
    providerId: "spotify",
  },
  kind: "state-and-item",
  stateKind: "playing",
};
// @ts-expect-error Semantic status values are readonly.
semanticStatus.label = "PLAYING";
// @ts-expect-error Semantic definitions are readonly.
semanticDefinition.value = "Changed title";
// @ts-expect-error The semantic companion accepts its view through a readonly prop.
companionProps.semantic = semantic;

function announcementIdentityKind(
  identity: OverlayAnnouncementIdentity,
): OverlayAnnouncementIdentity["kind"] {
  switch (identity.kind) {
    case "state":
    case "state-and-item":
      return identity.kind;
  }

  const unhandledIdentity: never = identity;
  return unhandledIdentity;
}

void stateAnnouncementIdentity;
void itemAnnouncementIdentity;
void semanticStatus;
void semanticDefinition;
void companionProps;
void invalidStateAnnouncementIdentity;
void invalidItemAnnouncementIdentity;
void announcementIdentityKind(stateAnnouncementIdentity);
