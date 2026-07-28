import { useSyncExternalStore, type ReactElement } from "react";
import { LocalPlaybackOverlay } from "../../components/local/LocalPlaybackOverlay.tsx";
import type { BrowserLocalApplication } from "./application.ts";

type LocalApplicationProps = {
  readonly application: BrowserLocalApplication;
  readonly prefersReducedMotion: boolean;
};

export function LocalApplication({
  application,
  prefersReducedMotion,
}: LocalApplicationProps): ReactElement {
  const presentation = useSyncExternalStore(
    application.subscribe,
    application.getSnapshot,
  );

  return (
    <LocalPlaybackOverlay
      prefersReducedMotion={prefersReducedMotion}
      presentation={presentation}
    />
  );
}
