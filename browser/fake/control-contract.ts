import type {
  Collection,
  Creator,
  OriginalArtwork,
  ProviderLink,
  Show,
} from "../../domain/playback-item.ts";
import type {
  DisplayText,
  ProviderItemId,
} from "../../domain/playback-values.ts";
import type { UnsupportedPlaybackReason } from "../../domain/playback.ts";

export type FakePlaybackMode = "paused" | "playing";

export type FakeTrackCreator = {
  readonly creatorId: ProviderItemId;
  readonly creator: Creator;
};

export type FakeProviderFailure =
  | { readonly kind: "malformed-response" }
  | { readonly kind: "network-failure" }
  | { readonly kind: "permission-denied" }
  | {
      readonly kind: "rate-limited";
      readonly retryAfterMilliseconds: number | null;
    }
  | { readonly kind: "server-failure"; readonly status: number }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unexpected-response"; readonly status: number };

export type FakeControlCommand =
  | {
      readonly kind: "resolve-authorization";
      readonly decision: "approved" | "denied";
    }
  | { readonly kind: "expire-authorization" }
  | { readonly kind: "set-empty" }
  | {
      readonly kind: "set-track";
      readonly playback: FakePlaybackMode;
      readonly itemId: ProviderItemId;
      readonly title: DisplayText;
      readonly itemLink: ProviderLink;
      readonly artwork: OriginalArtwork;
      readonly creators: ReadonlyArray<FakeTrackCreator>;
      readonly collection: Collection;
    }
  | {
      readonly kind: "set-episode";
      readonly playback: FakePlaybackMode;
      readonly itemId: ProviderItemId;
      readonly title: DisplayText;
      readonly itemLink: ProviderLink;
      readonly artwork: OriginalArtwork;
      readonly show: Show;
    }
  | {
      readonly kind: "set-unsupported";
      readonly reason: UnsupportedPlaybackReason;
    }
  | {
      readonly kind: "set-provider-failure";
      readonly failure: FakeProviderFailure;
    }
  | {
      readonly kind: "set-fatal";
      readonly reason:
        "browser-capability-unavailable" | "configuration-unavailable";
    };

export type FakeControlParseFailure = {
  readonly kind: "invalid-fake-control";
};
