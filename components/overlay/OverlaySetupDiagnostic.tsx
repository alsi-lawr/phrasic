import type { ReactElement } from "react";
import type { OverlayDisplayDiagnostic } from "./overlay-geometry.ts";

const overlaySetupDiagnosticHeadingId = "overlay-setup-diagnostic-heading";

type OverlaySetupDiagnosticProps = {
  readonly diagnostic: OverlayDisplayDiagnostic;
};

export function OverlaySetupDiagnostic({
  diagnostic,
}: OverlaySetupDiagnosticProps): ReactElement | null {
  switch (diagnostic.kind) {
    case "none":
      return null;
    case "invalid-display-query":
      return (
        <section
          aria-labelledby={overlaySetupDiagnosticHeadingId}
          className="m-0 w-full max-w-xl border-l-4 border-amber-300 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          role="alert"
        >
          <h2
            id={overlaySetupDiagnosticHeadingId}
            className="m-0 text-base font-semibold"
          >
            Overlay setup needs attention
          </h2>
          <p className="mb-0 mt-1">
            Use exactly one integer width between 320 and 7680 and setup=1 when
            setup is intended.
          </p>
        </section>
      );
  }

  return unreachable(diagnostic);
}

function unreachable(value: never): never {
  throw new Error(`Unexpected overlay display diagnostic: ${String(value)}`);
}
