import type { ReactElement } from "react";
import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";
import {
  localAutomaticActionMessage,
  localPresentationLabel,
  localPresentationMessage,
} from "./local-playback-copy.ts";

type LocalPlaybackSemanticCompanionProps = {
  readonly presentation: LocalPlaybackPresentation;
};

export function LocalPlaybackSemanticCompanion({
  presentation,
}: LocalPlaybackSemanticCompanionProps): ReactElement {
  return (
    <section aria-labelledby="local-playback-heading" className="sr-only">
      <h1 id="local-playback-heading">Local playback</h1>
      <dl>
        <MetadataDefinition
          term="Playback state"
          value={localPresentationLabel(presentation)}
        />
        <MetadataDefinition
          term="Status"
          value={localPresentationMessage(presentation)}
        />
        <MetadataDefinition
          term="Connection behavior"
          value={localAutomaticActionMessage(presentation)}
        />
        <OptionalLocalDefinitions presentation={presentation} />
      </dl>
      <p aria-atomic="true" aria-live="polite" role="status">
        {localPresentationMessage(presentation)}{" "}
        {localAutomaticActionMessage(presentation)}
      </p>
    </section>
  );
}

function OptionalLocalDefinitions({
  presentation,
}: LocalPlaybackSemanticCompanionProps): ReactElement | null {
  switch (presentation.kind) {
    case "content":
    case "stale-content": {
      const metadata = presentation.snapshot.metadata;
      return (
        <>
          <MetadataDefinition term="Title" value={metadata.title.toString()} />
          {metadata.creator === undefined ? null : (
            <MetadataDefinition
              term="Creator"
              value={metadata.creator.toString()}
            />
          )}
          {metadata.collection === undefined ? null : (
            <MetadataDefinition
              term="Collection"
              value={metadata.collection.toString()}
            />
          )}
        </>
      );
    }
    case "metadata-unavailable":
    case "unavailable":
      return null;
  }

  return unreachable(presentation);
}

type MetadataDefinitionProps = {
  readonly term: string;
  readonly value: string;
};

function MetadataDefinition({
  term,
  value,
}: MetadataDefinitionProps): ReactElement {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local semantic value: ${String(value)}`);
}
