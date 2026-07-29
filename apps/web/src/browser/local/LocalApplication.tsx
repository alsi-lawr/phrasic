import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { LocalPlaybackOverlay } from "../../components/local/LocalPlaybackOverlay.tsx";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";
import { useReducedMotionPreference } from "../../components/overlay/reduced-motion.ts";
import type { BrowserLocalApplication } from "./application.ts";

type LocalApplicationProps = {
  readonly application: BrowserLocalApplication;
};

export function LocalApplication({
  application,
}: LocalApplicationProps): ReactElement {
  const presentation = useSyncExternalStore(
    application.subscribe,
    application.getSnapshot,
    application.getSnapshot,
  );
  useEffect((): (() => void) => application.dispose, [application]);

  const geometry = resolveOverlayGeometry(
    new URL(window.location.href).searchParams,
  );
  const prefersReducedMotion = useReducedMotionPreference();
  const motion = overlayMotionDecisionForPreference(prefersReducedMotion);

  return (
    <LocalPlaybackOverlay
      geometry={geometry}
      motion={motion}
      presentation={presentation}
    />
  );
}
