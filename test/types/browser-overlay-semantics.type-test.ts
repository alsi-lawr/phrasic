import type { ComponentProps } from "react";
import { OverlaySemanticCompanion } from "../../components/overlay/OverlaySemanticCompanion.tsx";
import type { OverlayItemIdentity } from "../../components/overlay/overlay-metadata.ts";
import type {
  OverlayAnnouncementIdentity,
  OverlaySemanticDefinition,
  OverlaySemanticView,
} from "../../components/overlay/overlay-semantics.ts";
import type { OverlayViewModel } from "../../components/overlay/overlay-view-model.ts";

declare const itemIdentity: OverlayItemIdentity;
declare const viewModel: OverlayViewModel;

const stateAnnouncementIdentity: OverlayAnnouncementIdentity = Object.freeze({
  kind: "state",
  stateKind: "empty",
});
const itemAnnouncementIdentity: OverlayAnnouncementIdentity = Object.freeze({
  itemIdentity,
  kind: "state-and-item",
  stateKind: "playing",
});
const semanticDefinition: OverlaySemanticDefinition = Object.freeze({
  term: "Track",
  value: "Track title",
});
const semanticView: OverlaySemanticView = Object.freeze({
  announcement: Object.freeze({
    identity: stateAnnouncementIdentity,
    message: "Spotify is connected.",
  }),
  definitions: [semanticDefinition],
});
const companionProps: ComponentProps<typeof OverlaySemanticCompanion> =
  Object.freeze({ semantic: semanticView });

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
// @ts-expect-error Semantic definitions are readonly.
semanticDefinition.value = "Changed title";
// @ts-expect-error The semantic companion accepts its view through a readonly prop.
companionProps.semantic = semanticView;
Object.keys(
  // @ts-expect-error Semantic data no longer carries a parallel metadata projection.
  semanticView.metadata,
);
// @ts-expect-error The complete model remains readonly after projection.
viewModel.semantic = semanticView;

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
void semanticDefinition;
void semanticView;
void companionProps;
void invalidStateAnnouncementIdentity;
void invalidItemAnnouncementIdentity;
void announcementIdentityKind(stateAnnouncementIdentity);
