import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import { OverlayControls } from "./OverlayControls.tsx";
import { resolveOverlayGeometry } from "./overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "./overlay-motion.ts";
import { OverlaySemanticCompanion } from "./OverlaySemanticCompanion.tsx";
import { OverlaySetupDiagnostic } from "./OverlaySetupDiagnostic.tsx";
import { OverlayVisual } from "./OverlayVisual.tsx";
import { useReducedMotionPreference } from "./reduced-motion.ts";
import type { OverlayPresentation } from "./overlay-presentation.ts";

type NowPlayingOverlayProps = {
  readonly application: BrowserPlaybackApplication;
  readonly presentation: OverlayPresentation;
};

export default function NowPlayingOverlay({
  application,
  presentation,
}: NowPlayingOverlayProps): ReactElement {
  const snapshot = useSyncExternalStore(
    application.subscribe,
    application.getSnapshot,
    application.getSnapshot,
  );

  useEffect((): (() => void) => {
    return (): void => {
      application.dispose();
    };
  }, [application]);

  const prefersReducedMotion = useReducedMotionPreference();
  const geometry = resolveOverlayGeometry(
    new URL(window.location.href).searchParams,
  );
  const motion = overlayMotionDecisionForPreference(prefersReducedMotion);

  return (
    <main className="m-0 flex w-full flex-col items-start justify-start p-0 font-sans">
      <h1 id={presentation.headingId} className="sr-only">
        {presentation.displayName} now playing
      </h1>
      <OverlaySemanticCompanion
        presentation={presentation}
        snapshot={snapshot}
      />
      <OverlayVisual
        geometry={geometry}
        motion={motion}
        presentation={presentation}
        snapshot={snapshot}
      />
      <OverlaySetupDiagnostic diagnostic={geometry.diagnostic} />
      <OverlayControls
        actions={{
          beginAuthorization: application.beginAuthorization,
          logout: application.logout,
          retry: application.retry,
        }}
        presentation={presentation}
        setupMode={geometry.setupMode}
        snapshot={snapshot}
      />
    </main>
  );
}
