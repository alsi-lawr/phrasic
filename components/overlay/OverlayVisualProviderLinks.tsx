import type { ReactElement, ReactNode } from "react";
import type { BrowserPlaybackApplicationSnapshot } from "../../browser/application.ts";
import type {
  Creator,
  NowPlayingItem,
  PlaybackState,
  ProviderLink,
} from "../../domain/playback.ts";
import { overlayViewBox } from "./overlay-geometry.ts";
import {
  overlayArtworkRoundedClipPathData,
  overlayMetadataLayout,
  type OverlayTextLineLayout,
} from "./overlay-layout.ts";
import type { OverlayPresentation } from "./overlay-presentation.ts";

type OverlayVisualProviderLinksProps = {
  readonly availableWidth: number;
  readonly presentation: OverlayPresentation;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayVisualProviderLinks({
  availableWidth,
  presentation,
  snapshot,
}: OverlayVisualProviderLinksProps): ReactElement | null {
  switch (snapshot.kind) {
    case "fatal":
      return null;
    case "playback":
      return (
        <ProviderLinksForPlaybackState
          availableWidth={availableWidth}
          presentation={presentation}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type ProviderLinksForPlaybackStateProps = {
  readonly availableWidth: number;
  readonly presentation: OverlayPresentation;
  readonly state: PlaybackState;
};

function ProviderLinksForPlaybackState({
  availableWidth,
  presentation,
  state,
}: ProviderLinksForPlaybackStateProps): ReactElement | null {
  switch (state.kind) {
    case "playing":
    case "paused":
      return (
        <ProviderLinksForItem
          availableWidth={availableWidth}
          item={state.snapshot.item}
          presentation={presentation}
        />
      );
    case "reconnecting":
      return (
        <ReconnectingProviderLinks
          availableWidth={availableWidth}
          presentation={presentation}
          state={state}
        />
      );
    case "initializing":
    case "authorization-required":
    case "authorizing":
    case "empty":
    case "unsupported":
    case "failure":
      return null;
  }

  return unreachable(state);
}

type ReconnectingProviderLinksProps = {
  readonly availableWidth: number;
  readonly presentation: OverlayPresentation;
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingProviderLinks({
  availableWidth,
  presentation,
  state,
}: ReconnectingProviderLinksProps): ReactElement | null {
  switch (state.lastItem.kind) {
    case "available":
      return (
        <ProviderLinksForItem
          availableWidth={availableWidth}
          item={state.lastItem.item}
          presentation={presentation}
        />
      );
    case "unavailable":
      return null;
  }

  return unreachable(state.lastItem);
}

type ProviderLinksForItemProps = {
  readonly availableWidth: number;
  readonly item: NowPlayingItem;
  readonly presentation: OverlayPresentation;
};

function ProviderLinksForItem({
  availableWidth,
  item,
  presentation,
}: ProviderLinksForItemProps): ReactElement | null {
  switch (item.kind) {
    case "track":
      return (
        <TrackProviderLinks
          availableWidth={availableWidth}
          item={item}
          presentation={presentation}
        />
      );
    case "episode":
      return (
        <EpisodeProviderLinks
          availableWidth={availableWidth}
          item={item}
          presentation={presentation}
        />
      );
  }

  return unreachable(item);
}

type TrackProviderLinksProps = {
  readonly availableWidth: number;
  readonly item: Extract<NowPlayingItem, { readonly kind: "track" }>;
  readonly presentation: OverlayPresentation;
};

type SelectedCreatorLink = {
  readonly creator: Creator;
  readonly providerLink: ProviderLink;
};

function TrackProviderLinks({
  availableWidth,
  item,
  presentation,
}: TrackProviderLinksProps): ReactElement | null {
  const trackLink = selectedProviderLink(item.links, presentation.providerId);
  const albumLink = selectedProviderLink(
    item.collection.links,
    presentation.providerId,
  );
  if (trackLink === undefined || albumLink === undefined) {
    return null;
  }

  const creatorLinks: SelectedCreatorLink[] = [];
  for (const creator of item.artists) {
    const creatorLink = selectedProviderLink(
      creator.links,
      presentation.providerId,
    );
    if (creatorLink === undefined) {
      return null;
    }

    creatorLinks.push({ creator, providerLink: creatorLink });
  }

  return (
    <ProviderDestinationNavigation presentation={presentation}>
      <VisualProviderLink
        href={trackLink.href}
        label={`LISTEN ON ${providerLabel(presentation)}: TRACK — ${item.title.value}`}
      >
        <ArtworkLinkRegion />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.titleLine}
        />
      </VisualProviderLink>
      {creatorLinks.map(({ creator, providerLink }, index): ReactElement => (
        <VisualProviderLink
          key={`creator:${providerLink.href}:${creator.name.value}`}
          href={providerLink.href}
          label={`OPEN CREATOR ON ${providerLabel(presentation)}: ${creator.name.value}`}
        >
          <CreatorLinkRegion
            availableWidth={availableWidth}
            precedingText={creatorPrecedingText(item.artists, index)}
            text={creator.name.value}
          />
        </VisualProviderLink>
      ))}
      <VisualProviderLink
        href={albumLink.href}
        label={`OPEN ALBUM ON ${providerLabel(presentation)}: ${item.collection.title.value}`}
      >
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
        />
      </VisualProviderLink>
    </ProviderDestinationNavigation>
  );
}

type EpisodeProviderLinksProps = {
  readonly availableWidth: number;
  readonly item: Extract<NowPlayingItem, { readonly kind: "episode" }>;
  readonly presentation: OverlayPresentation;
};

function EpisodeProviderLinks({
  availableWidth,
  item,
  presentation,
}: EpisodeProviderLinksProps): ReactElement | null {
  const episodeLink = selectedProviderLink(item.links, presentation.providerId);
  const showLink = selectedProviderLink(
    item.show.links,
    presentation.providerId,
  );
  if (episodeLink === undefined || showLink === undefined) {
    return null;
  }

  return (
    <ProviderDestinationNavigation presentation={presentation}>
      <VisualProviderLink
        href={episodeLink.href}
        label={`LISTEN ON ${providerLabel(presentation)}: EPISODE — ${item.title.value}`}
      >
        <ArtworkLinkRegion />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.titleLine}
        />
      </VisualProviderLink>
      <VisualProviderLink
        href={showLink.href}
        label={`OPEN SHOW ON ${providerLabel(presentation)}: ${item.show.title.value}`}
      >
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.creatorLine}
        />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
        />
      </VisualProviderLink>
    </ProviderDestinationNavigation>
  );
}

type ProviderDestinationNavigationProps = {
  readonly children: ReactNode;
  readonly presentation: OverlayPresentation;
};

function ProviderDestinationNavigation({
  children,
  presentation,
}: ProviderDestinationNavigationProps): ReactElement {
  return (
    <nav
      aria-label={`${presentation.displayName} destinations`}
      className="pointer-events-none absolute inset-0"
    >
      {children}
    </nav>
  );
}

type VisualProviderLinkProps = {
  readonly children: ReactNode;
  readonly href: string;
  readonly label: string;
};

function VisualProviderLink({
  children,
  href,
  label,
}: VisualProviderLinkProps): ReactElement {
  return (
    <a
      aria-label={`${label} (opens in a new tab)`}
      className="group absolute inset-0 block pointer-events-none outline-none"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <svg
        aria-hidden="true"
        className="block h-full w-full"
        focusable="false"
        viewBox={overlayViewBox}
      >
        {children}
      </svg>
    </a>
  );
}

function ArtworkLinkRegion(): ReactElement {
  return (
    <path
      d={overlayArtworkRoundedClipPathData}
      className="pointer-events-auto cursor-pointer fill-transparent stroke-transparent stroke-0 group-focus-visible:stroke-white group-focus-visible:stroke-40"
    />
  );
}

type MetadataLinkRegionProps = {
  readonly availableWidth: number;
  readonly line: OverlayTextLineLayout;
};

function MetadataLinkRegion({
  availableWidth,
  line,
}: MetadataLinkRegionProps): ReactElement {
  return (
    <rect
      x={overlayMetadataLayout.x}
      y={line.clipY}
      width={availableWidth}
      height={line.clipHeight}
      className="pointer-events-auto cursor-pointer fill-transparent stroke-transparent stroke-0 group-focus-visible:stroke-white group-focus-visible:stroke-40"
    />
  );
}

type CreatorLinkRegionProps = {
  readonly availableWidth: number;
  readonly precedingText: string;
  readonly text: string;
};

function CreatorLinkRegion({
  availableWidth,
  precedingText,
  text,
}: CreatorLinkRegionProps): ReactElement {
  const line = overlayMetadataLayout.creatorLine;

  return (
    <>
      <rect
        x={overlayMetadataLayout.x}
        y={line.clipY}
        width={availableWidth}
        height={line.clipHeight}
        className="pointer-events-none fill-none stroke-transparent stroke-0 group-focus-visible:stroke-white group-focus-visible:stroke-40"
      />
      <text
        x={overlayMetadataLayout.x}
        y={line.y}
        className="font-overlay-display fill-none text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"
      >
        <tspan className="pointer-events-none">{precedingText}</tspan>
        <tspan className="pointer-events-auto cursor-pointer fill-transparent">
          {text}
        </tspan>
      </text>
    </>
  );
}

function selectedProviderLink(
  links: ReadonlyArray<ProviderLink>,
  providerId: string,
): ProviderLink | undefined {
  return links.find((link): boolean => link.providerId === providerId);
}

function providerLabel(presentation: OverlayPresentation): string {
  return presentation.displayName.toLocaleUpperCase("en-US");
}

function creatorPrecedingText(
  artists: ReadonlyArray<Creator>,
  creatorIndex: number,
): string {
  if (creatorIndex === 0) {
    return "";
  }

  return `${artists
    .slice(0, creatorIndex)
    .map((artist): string => artist.name.value)
    .join(", ")}, `;
}

function unreachable(value: never): never {
  throw new Error(`Unexpected visible provider link: ${String(value)}`);
}
