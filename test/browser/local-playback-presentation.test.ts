import assert from "node:assert/strict";
import { test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocalPlaybackOverlay } from "../../components/local/LocalPlaybackOverlay.tsx";
import { localPlaybackView } from "../../browser/local/presentation-view.ts";
import { localAnimationIdentityKey } from "../../components/local/local-playback-identity.ts";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";
import { overlayMotionDecisionForPreference } from "../../components/overlay/overlay-motion.ts";
import {
  createLocalSuccessfulSnapshot,
  NativeMonotonicMilliseconds,
  parseLocalPlaybackMetadata,
  resolveLocalPlaybackPresentation,
  trustedPolicyStatus,
  trustedSelectedLocalPlayback,
  unavailableLocalLastSuccessfulSnapshot,
  type LocalPlaybackMetadata,
} from "../../domain/local-playback.ts";
import type { Result } from "../../domain/result.ts";

test("Local presentation renders artwork without exposing other private metadata or controls", () => {
  const markup = renderLocal(
    selectedPresentation({
      artwork: "https://media.example/private-artwork.png",
      destination: "https://media.example/private-destination",
      duration: 120_000,
      nativeIdentity: "private-native-identity",
      position: 60_000,
      title: "Track title",
    }),
  );

  assert.match(markup, />Track title</);
  assert.match(
    markup,
    /<image[^>]*href="https:\/\/media\.example\/private-artwork\.png"/,
  );
  assert.doesNotMatch(
    markup,
    /private-destination|private-native-identity|120000|60000|<a |<button/,
  );
  assert.doesNotMatch(markup, /fill-overlay-vinyl-disc/);
  assert.doesNotMatch(markup, /Creator|Collection| · /);
  assert.match(markup, /Local playback status updates automatically\./);
});

test("Local presentation uses the established overlay shell, geometry, metadata lines, and motion", () => {
  const markup = renderLocal(
    selectedPresentation({
      collection: "Collection title",
      creator: "Creator name",
      title: "Track title",
    }),
    new URLSearchParams("width=2560"),
    false,
  );

  assert.match(
    markup,
    /<svg[^>]*class="block"[^>]*width="2560"[^>]*viewBox="0 0 4725 1080"/,
  );
  assert.match(markup, /fill-overlay-shell opacity-90/);
  assert.match(markup, /id="overlay-artwork-rounded-clip"/);
  assert.match(markup, /fill-overlay-vinyl-disc/);
  assert.match(
    markup,
    /font-overlay-display fill-overlay-creator text-overlay-creator-size/,
  );
  assert.match(
    markup,
    /font-overlay-display fill-overlay-title text-overlay-title-size/,
  );
  assert.match(
    markup,
    /font-overlay-display fill-overlay-detail text-overlay-detail-size/,
  );
  assert.match(
    markup,
    /font-overlay-display fill-overlay-context text-overlay-context-size/,
  );
  assert.match(markup, />Local playback<\/text>/);
  assert.match(markup, /transition-\[width\]/);
  assert.match(markup, /animate-artwork-fade-in/);
  assert.match(markup, /animate-overlay-item-appearance/);
  assert.match(markup, /animate-vinyl-spin/);
  assert.doesNotMatch(
    markup,
    /border-amber|bg-slate|max-w-xl|<a |<button|<nav|<image/,
  );
});

test("Local presentation preserves the established reduced-motion treatment", () => {
  const markup = renderLocal(
    selectedPresentation({ title: "Track title" }),
    new URLSearchParams(),
    true,
  );

  assert.doesNotMatch(
    markup,
    /transition-\[width\]|animate-artwork-fade-in|animate-overlay-item-appearance|animate-vinyl-spin/,
  );
  assert.match(markup, /fill-overlay-shell opacity-90/);
  assert.match(markup, /fill-overlay-vinyl-disc/);
});

test("Local animation identity changes with playback from the same native player", () => {
  const first = localPlaybackView(
    selectedPresentation({
      nativeIdentity: "Mozilla zen",
      title: "First track",
    }),
  );
  const second = localPlaybackView(
    selectedPresentation({
      nativeIdentity: "Mozilla zen",
      title: "Second track",
    }),
  );

  assert.notEqual(
    localAnimationIdentityKey(first),
    localAnimationIdentityKey(second),
  );
});

test("Local title absence and unavailable statuses are accessibly announced without authorization copy", () => {
  const metadataUnavailable = renderLocal(
    selectedPresentation({ creator: "Creator only" }),
  );
  assert.match(metadataUnavailable, /Playback metadata unavailable\./);
  assert.match(metadataUnavailable, /aria-live="polite"/);
  assert.doesNotMatch(
    metadataUnavailable,
    /Connect Local|Disconnect Local|<button/,
  );

  const ambiguity = renderLocal(
    resolveLocalPlaybackPresentation({
      lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
      now: monotonic(0),
      outcome: trustedPolicyStatus({
        kind: "ambiguous",
        reason: "multiple-playing",
      }),
    }),
  );
  assert.match(ambiguity, /Local playback unavailable\./);
  assert.match(
    ambiguity,
    /Multiple Local media sources are equally eligible\./,
  );
  assert.match(ambiguity, /Local playback retries automatically\./);
  assert.doesNotMatch(ambiguity, /Connect Local|Disconnect Local|<button/);
});

test("Local stale content retains only honest present metadata and announces staleness", () => {
  const snapshot = createLocalSuccessfulSnapshot({
    activity: "paused",
    metadata: metadata({
      collection: "Collection title",
      title: "Track title",
    }),
    observedAt: monotonic(0),
  });
  const presentation = resolveLocalPlaybackPresentation({
    lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
    now: monotonic(5_001),
    outcome: trustedSelectedLocalPlayback({
      reason: "sole-not-playing",
      snapshot,
    }),
  });
  const markup = renderLocal(presentation);

  assert.match(markup, /LOCAL PLAYBACK STALE/);
  assert.match(markup, />Track title</);
  assert.match(markup, />Collection title</);
  assert.doesNotMatch(markup, /Creator| · /);
  assert.match(markup, /Local playback is stale\./);
});

test("Local unsupported, native-session, and API states expose distinct accessible status", () => {
  const cases: ReadonlyArray<LocalStatusPresentationCase> = [
    {
      expected: "This platform does not support Local playback.",
      outcome: Object.freeze({ kind: "unsupported-platform" }),
    },
    {
      expected: "The Local native session is unavailable.",
      outcome: Object.freeze({ kind: "native-session-unavailable" }),
    },
    {
      expected: "The Local playback API is incompatible.",
      outcome: Object.freeze({ kind: "incompatible-api" }),
    },
  ];

  for (const statusCase of cases) {
    const markup = renderLocal(
      resolveLocalPlaybackPresentation({
        lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
        now: monotonic(0),
        outcome: statusCase.outcome,
      }),
    );

    assert.match(markup, new RegExp(statusCase.expected));
    assert.match(markup, /aria-live="polite"/);
  }
});

type LocalStatusPresentationCase = {
  readonly expected: string;
  readonly outcome:
    | { readonly kind: "incompatible-api" }
    | { readonly kind: "native-session-unavailable" }
    | { readonly kind: "unsupported-platform" };
};

function selectedPresentation(input: object) {
  const snapshot = createLocalSuccessfulSnapshot({
    activity: "playing",
    metadata: metadata(input),
    observedAt: monotonic(0),
  });

  return resolveLocalPlaybackPresentation({
    lastSuccessful: unavailableLocalLastSuccessfulSnapshot(),
    now: monotonic(0),
    outcome: trustedSelectedLocalPlayback({ reason: "sole-playing", snapshot }),
  });
}

function renderLocal(
  presentation: ReturnType<typeof selectedPresentation>,
  parameters: URLSearchParams = new URLSearchParams(),
  prefersReducedMotion = true,
): string {
  return renderToStaticMarkup(
    createElement(LocalPlaybackOverlay, {
      geometry: resolveOverlayGeometry(parameters),
      motion: overlayMotionDecisionForPreference(prefersReducedMotion),
      presentation: localPlaybackView(presentation),
    }),
  );
}

function metadata(input: object): LocalPlaybackMetadata {
  return expectSuccess(parseLocalPlaybackMetadata(input));
}

function monotonic(value: number): NativeMonotonicMilliseconds {
  return expectSuccess(NativeMonotonicMilliseconds.parse(value));
}

function expectSuccess<Value, Failure>(result: Result<Value, Failure>): Value {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a successful Local presentation value.");
}
