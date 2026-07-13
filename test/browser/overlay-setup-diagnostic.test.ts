import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OverlaySetupDiagnostic } from "../../components/overlay/OverlaySetupDiagnostic.tsx";
import type { OverlayDisplayDiagnostic } from "../../components/overlay/overlay-geometry.ts";

test("the overlay setup diagnostic renders static semantic correction guidance", () => {
  const diagnostic: OverlayDisplayDiagnostic = Object.freeze({
    kind: "invalid-display-query",
    reason: "fractional-display-width",
  });
  const markup = renderToStaticMarkup(
    createElement(OverlaySetupDiagnostic, { diagnostic }),
  );

  assert.match(markup, /<section[^>]*role="alert"/);
  assert.match(
    markup,
    /aria-labelledby="overlay-setup-diagnostic-heading"/,
  );
  assert.match(markup, /Overlay setup needs attention/);
  assert.match(
    markup,
    /Use exactly one integer width between 320 and 7680 and setup=1 when setup is intended\./,
  );
});

test("the overlay setup diagnostic renders nothing when display query validation succeeds", () => {
  const diagnostic: OverlayDisplayDiagnostic = Object.freeze({ kind: "none" });
  const markup = renderToStaticMarkup(
    createElement(OverlaySetupDiagnostic, { diagnostic }),
  );

  assert.equal(markup, "");
});
