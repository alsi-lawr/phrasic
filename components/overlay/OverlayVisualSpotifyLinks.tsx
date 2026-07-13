import type { ReactElement } from "react";
import { overlayViewBox } from "./overlay-geometry.ts";
import {
  overlayArtworkRoundedClipPathData,
  overlayMetadataLayout,
  type OverlayTextLineLayout,
} from "./overlay-layout.ts";
import {
  spotifyLinkAccessibleName,
  type OverlaySpotifyLink,
  type OverlaySpotifyLinks,
} from "./overlay-spotify-links.ts";

type OverlayVisualSpotifyLinksProps = {
  readonly availableWidth: number;
  readonly links: OverlaySpotifyLinks;
};

export function OverlayVisualSpotifyLinks({
  availableWidth,
  links,
}: OverlayVisualSpotifyLinksProps): ReactElement | null {
  switch (links.kind) {
    case "not-applicable":
    case "unavailable":
      return null;
    case "available":
      return (
        <nav
          aria-label="Spotify destinations"
          className="pointer-events-none absolute inset-0"
        >
          {links.links.map((link): ReactElement => (
            <VisualSpotifyLink
              key={`${link.destination}:${link.providerLink.href}`}
              availableWidth={availableWidth}
              link={link}
            />
          ))}
        </nav>
      );
  }

  return unreachable(links);
}

type VisualSpotifyLinkProps = {
  readonly availableWidth: number;
  readonly link: OverlaySpotifyLink;
};

function VisualSpotifyLink({
  availableWidth,
  link,
}: VisualSpotifyLinkProps): ReactElement {
  return (
    <a
      aria-label={spotifyLinkAccessibleName(link)}
      className="group absolute inset-0 block pointer-events-none outline-none"
      href={link.providerLink.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <svg
        aria-hidden="true"
        className="block h-full w-full"
        focusable="false"
        viewBox={overlayViewBox}
      >
        <VisualSpotifyLinkTarget availableWidth={availableWidth} link={link} />
      </svg>
    </a>
  );
}

type VisualSpotifyLinkTargetProps = {
  readonly availableWidth: number;
  readonly link: OverlaySpotifyLink;
};

function VisualSpotifyLinkTarget({
  availableWidth,
  link,
}: VisualSpotifyLinkTargetProps): ReactElement {
  switch (link.visibleTarget.kind) {
    case "item-metadata":
      return (
        <>
          <ArtworkLinkRegion />
          <MetadataLinkRegion
            availableWidth={availableWidth}
            line={overlayMetadataLayout.titleLine}
          />
        </>
      );
    case "creator-metadata":
      return (
        <CreatorLinkRegion
          availableWidth={availableWidth}
          precedingText={link.visibleTarget.precedingText}
          text={link.visibleTarget.text}
        />
      );
    case "detail-metadata":
      return (
        <MetadataLinkRegion
          availableWidth={availableWidth}
          line={overlayMetadataLayout.detailLine}
        />
      );
    case "show-metadata":
      return (
        <>
          <MetadataLinkRegion
            availableWidth={availableWidth}
            line={overlayMetadataLayout.creatorLine}
          />
          <MetadataLinkRegion
            availableWidth={availableWidth}
            line={overlayMetadataLayout.detailLine}
          />
        </>
      );
  }

  return unreachable(link.visibleTarget);
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

function unreachable(value: never): never {
  throw new Error(`Unexpected visible Spotify link: ${String(value)}`);
}
