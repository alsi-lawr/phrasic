import type {
  LocalAutomaticAction,
  LocalPlaybackPresentation,
  LocalTitledSuccessfulSnapshot,
  LocalUnavailableStatus,
} from "../../domain/local-playback.ts";

type LocalPlaybackViewSnapshot = {
  readonly activity: LocalTitledSuccessfulSnapshot["activity"];
  readonly metadata: {
    readonly artwork?: string;
    readonly collection?: string;
    readonly creator?: string;
    readonly nativeIdentity?: string;
    readonly title: string;
  };
};

export type LocalPlaybackView =
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "content";
      readonly snapshot: LocalPlaybackViewSnapshot;
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "idle";
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "metadata-unavailable";
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "stale-content";
      readonly snapshot: LocalPlaybackViewSnapshot;
      readonly status: LocalUnavailableStatus;
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "unavailable";
      readonly status: LocalUnavailableStatus;
    };

export function localPlaybackView(
  presentation: LocalPlaybackPresentation,
): LocalPlaybackView {
  switch (presentation.kind) {
    case "content":
      return Object.freeze({
        action: presentation.action,
        kind: presentation.kind,
        snapshot: snapshotView(presentation.snapshot),
      });
    case "idle":
    case "metadata-unavailable":
      return Object.freeze({
        action: presentation.action,
        kind: presentation.kind,
      });
    case "stale-content":
      return Object.freeze({
        action: presentation.action,
        kind: presentation.kind,
        snapshot: snapshotView(presentation.snapshot),
        status: presentation.status,
      });
    case "unavailable":
      return Object.freeze({
        action: presentation.action,
        kind: presentation.kind,
        status: presentation.status,
      });
  }

  return unreachable(presentation);
}

function snapshotView(
  snapshot: LocalTitledSuccessfulSnapshot,
): LocalPlaybackViewSnapshot {
  const metadata = snapshot.metadata;
  return Object.freeze({
    activity: snapshot.activity,
    metadata: Object.freeze({
      ...(metadata.artwork === undefined
        ? {}
        : { artwork: metadata.artwork.toString() }),
      ...(metadata.collection === undefined
        ? {}
        : { collection: metadata.collection.toString() }),
      ...(metadata.creator === undefined
        ? {}
        : { creator: metadata.creator.toString() }),
      ...(metadata.nativeIdentity === undefined
        ? {}
        : { nativeIdentity: metadata.nativeIdentity.toString() }),
      title: metadata.title.toString(),
    }),
  });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local playback view: ${String(value)}`);
}
