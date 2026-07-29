import type { LocalPlaybackView } from "./presentation-view.ts";

export type LocalWorkerCommand =
  | {
      readonly kind: "initialize";
      readonly origin: string;
      readonly visibility: LocalPageVisibility;
    }
  | {
      readonly kind: "visibility-change";
      readonly visibility: LocalPageVisibility;
    }
  | { readonly kind: "dispose" };

export type LocalWorkerEvent = {
  readonly kind: "presentation";
  readonly presentation: LocalPlaybackView;
};

export type LocalPageVisibility = "hidden" | "visible";
