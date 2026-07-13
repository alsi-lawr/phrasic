import type { ReactElement } from "react";
import type {
  OverlaySpotifyLink,
  OverlaySpotifyLinks,
} from "./overlay-spotify-links.ts";
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
      <SpotifyLinks links={semantic.spotifyLinks} />
      <PoliteOverlayAnnouncement announcement={semantic.announcement} />
    </section>
  );
}

type SpotifyLinksProps = {
  readonly links: OverlaySpotifyLinks;
};

function SpotifyLinks({ links }: SpotifyLinksProps): ReactElement | null {
  switch (links.kind) {
    case "not-applicable":
    case "unavailable":
      return null;
    case "available":
      return (
        <nav aria-label="Spotify destinations">
          <ul>
            {links.links.map((link): ReactElement => (
              <li key={`${link.destination}:${link.providerLink.href}`}>
                <SpotifyLink link={link} />
              </li>
            ))}
          </ul>
        </nav>
      );
  }

  return unreachable(links);
}

type SpotifyLinkProps = {
  readonly link: OverlaySpotifyLink;
};

function SpotifyLink({ link }: SpotifyLinkProps): ReactElement {
  return (
    <a
      aria-label={`${link.label} (opens in a new tab)`}
      href={link.providerLink.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {link.label}
    </a>
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

function unreachable(value: never): never {
  throw new Error(`Unexpected Spotify links: ${String(value)}`);
}
