import type { LocalPlaybackPresentation } from "../../domain/local-playback.ts";

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
  readonly presentation: LocalPlaybackPresentation;
};

export type LocalPageVisibility = "hidden" | "visible";
