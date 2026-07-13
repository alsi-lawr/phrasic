import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const diagnosticSource = readFileSync(
  new URL(
    "../../components/overlay/OverlaySetupDiagnostic.tsx",
    import.meta.url,
  ),
  "utf8",
);
const overlaySource = readFileSync(
  new URL(
    "../../components/overlay/SpotifyNowPlayingOverlay.tsx",
    import.meta.url,
  ),
  "utf8",
);
const visualSource = readFileSync(
  new URL("../../components/overlay/OverlayVisual.tsx", import.meta.url),
  "utf8",
);

test("the overlay setup diagnostic renders static semantic correction guidance", () => {
  assert.match(diagnosticSource, /<section[\s\S]*role="alert"/);
  assert.match(
    diagnosticSource,
    /aria-labelledby=\{overlaySetupDiagnosticHeadingId\}/,
  );
  assert.match(diagnosticSource, /Overlay setup needs attention/);
  assert.match(
    diagnosticSource,
    /Use exactly one integer width between 320 and 7680 and setup=1 when[\s\S]*setup is intended\./,
  );
  assert.match(diagnosticSource, /case "none":\s*return null;/);
  assert.match(diagnosticSource, /case "invalid-display-query":/);
  assert.doesNotMatch(
    diagnosticSource,
    /\b(?:URLSearchParams|location|window)\b|diagnostic\.reason/,
  );
  assert.match(
    overlaySource,
    /<OverlayVisual[\s\S]*\/>\s*<OverlaySetupDiagnostic diagnostic=\{geometry\.diagnostic\} \/>\s*<OverlayControls/,
  );
  assert.doesNotMatch(visualSource, /OverlaySetupDiagnostic/);
});
