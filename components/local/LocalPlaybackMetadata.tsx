import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import {
  localAutomaticActionMessage,
  localPresentationLabel,
  localPresentationMessage,
} from "./local-playback-copy.ts";

type LocalPlaybackMetadataProps = {
  readonly presentation: LocalPlaybackPresentation;
};

export function LocalPlaybackMetadata({
  presentation,
}: LocalPlaybackMetadataProps): ReactElement {
  switch (presentation.kind) {
    case "content":
    case "stale-content":
      return <TitledMetadata presentation={presentation} />;
    case "metadata-unavailable":
    case "unavailable":
      return <StatusMetadata presentation={presentation} />;
  }

  return unreachable(presentation);
}

type TitledMetadataProps = {
  readonly presentation: Extract<
    LocalPlaybackPresentation,
    { readonly kind: "content" | "stale-content" }
  >;
};

function TitledMetadata({ presentation }: TitledMetadataProps): ReactElement {
  const metadata = presentation.snapshot.metadata;

  return (
    <div className="m-0 w-full max-w-xl border-l-4 border-amber-300 bg-slate-950 px-4 py-3 text-sm text-slate-100">
      <p className="m-0 text-base font-semibold">
        {localPresentationLabel(presentation)}
      </p>
      <p className="mb-0 mt-1">{metadata.title.toString()}</p>
      {metadata.creator === undefined ? null : (
        <p className="mb-0 mt-1">{metadata.creator.toString()}</p>
      )}
      {metadata.collection === undefined ? null : (
        <p className="mb-0 mt-1">{metadata.collection.toString()}</p>
      )}
      <p className="mb-0 mt-1">{localAutomaticActionMessage(presentation)}</p>
    </div>
  );
}

type StatusMetadataProps = {
  readonly presentation: Extract<
    LocalPlaybackPresentation,
    { readonly kind: "metadata-unavailable" | "unavailable" }
  >;
};

function StatusMetadata({ presentation }: StatusMetadataProps): ReactElement {
  return (
    <div className="m-0 w-full max-w-xl border-l-4 border-amber-300 bg-slate-950 px-4 py-3 text-sm text-slate-100">
      <p className="m-0 text-base font-semibold">
        {localPresentationLabel(presentation)}
      </p>
      <p className="mb-0 mt-1">{localPresentationMessage(presentation)}</p>
      <p className="mb-0 mt-1">{localAutomaticActionMessage(presentation)}</p>
    </div>
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local metadata value: ${String(value)}`);
}
