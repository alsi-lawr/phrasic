import type { ReactElement } from "react";
import {
  overlayAnnouncementIdentityKey,
  type OverlayAnnouncement,
  type OverlaySemanticDefinition,
  type OverlaySemanticView,
} from "./overlay-semantics.ts";

export const overlaySemanticHeadingId = "spotify-now-playing-heading";

type OverlaySemanticCompanionProps = {
  readonly semantic: OverlaySemanticView;
};

export function OverlaySemanticCompanion({
  semantic,
}: OverlaySemanticCompanionProps): ReactElement {
  return (
    <section aria-labelledby={overlaySemanticHeadingId} className="sr-only">
      <SemanticDetails definitions={semantic.definitions} />
      <PoliteOverlayAnnouncement announcement={semantic.announcement} />
    </section>
  );
}

type SemanticDetailsProps = {
  readonly definitions: ReadonlyArray<OverlaySemanticDefinition>;
};

function SemanticDetails({ definitions }: SemanticDetailsProps): ReactElement {
  return (
    <dl>
      {definitions.map((definition): ReactElement => (
        <MetadataDefinition key={definition.term} definition={definition} />
      ))}
    </dl>
  );
}

type MetadataDefinitionProps = {
  readonly definition: OverlaySemanticDefinition;
};

function MetadataDefinition({
  definition,
}: MetadataDefinitionProps): ReactElement {
  return (
    <div>
      <dt>{definition.term}</dt>
      <dd>{definition.value}</dd>
    </div>
  );
}

type PoliteOverlayAnnouncementProps = {
  readonly announcement: OverlayAnnouncement;
};

function PoliteOverlayAnnouncement({
  announcement,
}: PoliteOverlayAnnouncementProps): ReactElement {
  const announcementKey = overlayAnnouncementIdentityKey(announcement.identity);

  return (
    <p aria-atomic="true" aria-live="polite" role="status">
      <span key={announcementKey}>{announcement.message}</span>
    </p>
  );
}
