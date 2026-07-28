import type { LocalPlaybackView } from "../../browser/local/presentation-view.ts";

export function localAnimationIdentityKey(
  presentation: LocalPlaybackView,
): string {
  switch (presentation.kind) {
    case "content":
    case "stale-content":
      return localItemIdentityKey(presentation);
    case "metadata-unavailable":
      return "animation:local:metadata-unavailable";
    case "unavailable":
      return `animation:local:unavailable:${presentation.status}`;
  }

  return unreachable(presentation);
}

function localItemIdentityKey(
  presentation: Extract<
    LocalPlaybackView,
    { readonly kind: "content" | "stale-content" }
  >,
): string {
  const metadata = presentation.snapshot.metadata;
  const nativeIdentity = metadata.nativeIdentity ?? "";
  const title = metadata.title;
  const creator = metadata.creator ?? "";
  const collection = metadata.collection ?? "";
  const status =
    presentation.kind === "stale-content" ? presentation.status : "";
  return [
    "animation:local:item",
    presentation.kind,
    presentation.snapshot.activity,
    status,
    `${nativeIdentity.length}:${nativeIdentity}`,
    `${title.length}:${title}`,
    `${creator.length}:${creator}`,
    `${collection.length}:${collection}`,
  ].join(":");
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local overlay value: ${String(value)}`);
}
