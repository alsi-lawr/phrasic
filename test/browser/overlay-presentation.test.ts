import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackVinylClasses,
  overlayMetadataTextClasses,
  overlayShellClass,
  overlayVisibleSpotifyLinkClasses,
} from "../../components/overlay/overlay-presentation.ts";

test("overlay presentation variants preserve the baseline hierarchy and vinyl treatment", () => {
  assert.deepEqual(overlayMetadataTextClasses, {
    context:
      "font-overlay-display fill-overlay-context text-overlay-context-size font-medium tracking-overlay-context",
    creator:
      "font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase",
    detail:
      "font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail",
    status:
      "font-overlay-display fill-overlay-status text-overlay-status-size font-semibold tracking-overlay-normal",
    title:
      "font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal",
  });
  assert.equal(Object.isFrozen(overlayMetadataTextClasses), true);
  assert.equal(overlayShellClass, "fill-overlay-shell opacity-90");
  assert.deepEqual(fallbackVinylClasses, {
    disc: "fill-overlay-vinyl-disc",
    groove: "fill-none stroke-overlay-vinyl-groove stroke-8",
    hub: "fill-overlay-vinyl-hub",
    label: "fill-overlay-vinyl-label",
    rim: "fill-none stroke-overlay-vinyl-rim stroke-8",
  });
});

test("visible Spotify links retain pointer targets and keyboard-focus indicators", () => {
  assert.match(
    overlayVisibleSpotifyLinkClasses.target,
    /\bpointer-events-auto\b/,
  );
  assert.match(
    overlayVisibleSpotifyLinkClasses.target,
    /\bgroup-focus-visible:stroke-white\b/,
  );
  assert.match(
    overlayVisibleSpotifyLinkClasses.target,
    /\bgroup-focus-visible:stroke-40\b/,
  );
  assert.match(
    overlayVisibleSpotifyLinkClasses.focusIndicator,
    /\bgroup-focus-visible:stroke-white\b/,
  );
  assert.match(
    overlayVisibleSpotifyLinkClasses.creatorTextTarget,
    /\bpointer-events-auto\b/,
  );
});
