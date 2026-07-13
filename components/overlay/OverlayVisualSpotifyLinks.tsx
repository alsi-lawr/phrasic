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

const spotifyProviderId = "spotify";

type OverlayVisualSpotifyLinksProps = {
  readonly availableWidth: number;
  readonly snapshot: BrowserPlaybackApplicationSnapshot;
};

export function OverlayVisualSpotifyLinks({
  availableWidth,
  snapshot,
}: OverlayVisualSpotifyLinksProps): ReactElement | null {
  switch (snapshot.kind) {
    case "fatal":
      return null;
    case "playback":
      return (
        <SpotifyLinksForPlaybackState
          availableWidth={availableWidth}
          state={snapshot.state}
        />
      );
  }

  return unreachable(snapshot);
}

type SpotifyLinksForPlaybackStateProps = {
  readonly availableWidth: number;
  readonly state: PlaybackState;
};

function SpotifyLinksForPlaybackState({
  availableWidth,
  state,
}: SpotifyLinksForPlaybackStateProps): ReactElement | null {
  switch (state.kind) {
    case "playing":
    case "paused":
      return (
        <SpotifyLinksForItem
          availableWidth={availableWidth}
          item={state.snapshot.item}
        />
      );
    case "reconnecting":
      return (
        <ReconnectingSpotifyLinks
          availableWidth={availableWidth}
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

type ReconnectingSpotifyLinksProps = {
  readonly availableWidth: number;
  readonly state: Extract<PlaybackState, { readonly kind: "reconnecting" }>;
};

function ReconnectingSpotifyLinks({
  availableWidth,
  state,
}: ReconnectingSpotifyLinksProps): ReactElement | null {
  switch (state.lastItem.kind) {
    case "available":
      return (
        <SpotifyLinksForItem
          availableWidth={availableWidth}
          item={state.lastItem.item}
        />
      );
    case "unavailable":
      return null;
  }

  return unreachable(state.lastItem);
}

type SpotifyLinksForItemProps = {
  readonly availableWidth: number;
  readonly item: NowPlayingItem;
};

function SpotifyLinksForItem({
  availableWidth,
  item,
}: SpotifyLinksForItemProps): ReactElement | null {
  switch (item.kind) {
    case "track":
      return <TrackSpotifyLinks availableWidth={availableWidth} item={item} />;
    case "episode":
      return <EpisodeSpotifyLinks availableWidth={availableWidth} item={item} />;
  }

  return unreachable(item);
}

type TrackSpotifyLinksProps = {
  readonly availableWidth: number;
  readonly item: Extract<NowPlayingItem, { readonly kind: "track" }>;
};

type SelectedCreatorLink = {
  readonly creator: Creator;
  readonly providerLink: ProviderLink;
};

function TrackSpotifyLinks({
  availableWidth,
  item,
}: TrackSpotifyLinksProps): ReactElement | null {
  const trackLink = item.links.find(isSpotifyProviderLink);
  const albumLink = item.collection.links.find(isSpotifyProviderLink);
  if (trackLink === undefined || albumLink === undefined) {
    return null;
  }

  const creatorLinks: SelectedCreatorLink[] = [];
  for (const creator of item.artists) {
    const creatorLink = creator.links.find(isSpotifyProviderLink);
    if (creatorLink === undefined) {
      return null;
    }

    creatorLinks.push({ creator, providerLink: creatorLink });
  }

  return (
    <SpotifyDestinationNavigation>
      <VisualSpotifyLink
        href={trackLink.href}
        label={`LISTEN ON SPOTIFY: TRACK — ${item.title.value}`}
      >
        <ArtworkLinkRegion />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.titleLine}
        />
      </VisualSpotifyLink>
      {creatorLinks.map(
        ({ creator, providerLink }, index): ReactElement => (
          <VisualSpotifyLink
            key={`creator:${providerLink.href}:${creator.name.value}`}
            href={providerLink.href}
            label={`OPEN CREATOR ON SPOTIFY: ${creator.name.value}`}
          >
            <CreatorLinkRegion
              availableWidth={availableWidth}
              precedingText={creatorPrecedingText(item.artists, index)}
              text={creator.name.value}
            />
          </VisualSpotifyLink>
        ),
      )}
      <VisualSpotifyLink
        href={albumLink.href}
        label={`OPEN ALBUM ON SPOTIFY: ${item.collection.title.value}`}
      >
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
        />
      </VisualSpotifyLink>
    </SpotifyDestinationNavigation>
  );
}

type EpisodeSpotifyLinksProps = {
  readonly availableWidth: number;
  readonly item: Extract<NowPlayingItem, { readonly kind: "episode" }>;
};

function EpisodeSpotifyLinks({
  availableWidth,
  item,
}: EpisodeSpotifyLinksProps): ReactElement | null {
  const episodeLink = item.links.find(isSpotifyProviderLink);
  const showLink = item.show.links.find(isSpotifyProviderLink);
  if (episodeLink === undefined || showLink === undefined) {
    return null;
  }

  return (
    <SpotifyDestinationNavigation>
      <VisualSpotifyLink
        href={episodeLink.href}
        label={`LISTEN ON SPOTIFY: EPISODE — ${item.title.value}`}
      >
        <ArtworkLinkRegion />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.titleLine}
        />
      </VisualSpotifyLink>
      <VisualSpotifyLink
        href={showLink.href}
        label={`OPEN SHOW ON SPOTIFY: ${item.show.title.value}`}
      >
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.creatorLine}
        />
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
        />
      </VisualSpotifyLink>
    </SpotifyDestinationNavigation>
  );
}

type SpotifyDestinationNavigationProps = {
  readonly children: ReactNode;
};

function SpotifyDestinationNavigation({
  children,
}: SpotifyDestinationNavigationProps): ReactElement {
  return (
    <nav
      aria-label="Spotify destinations"
      className="pointer-events-none absolute inset-0"
    >
      {children}
    </nav>
  );
}

type VisualSpotifyLinkProps = {
  readonly children: ReactNode;
  readonly href: string;
  readonly label: string;
};

function VisualSpotifyLink({
  children,
  href,
  label,
}: VisualSpotifyLinkProps): ReactElement {
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

function isSpotifyProviderLink(link: ProviderLink): boolean {
  return link.providerId.value === spotifyProviderId;
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
  throw new Error(`Unexpected visible Spotify link: ${String(value)}`);
}
