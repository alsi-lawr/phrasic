import type { ComponentProps } from "react";
import type { BrowserPlaybackApplication } from "../../browser/application.ts";
import SpotifyNowPlayingOverlay from "../../components/overlay/SpotifyNowPlayingOverlay.tsx";
import { resolveOverlayGeometry } from "../../components/overlay/overlay-geometry.ts";

declare const application: BrowserPlaybackApplication;

const props: ComponentProps<typeof SpotifyNowPlayingOverlay> = Object.freeze({
  application,
});
const geometry = resolveOverlayGeometry(new URLSearchParams("width=1920"));

// @ts-expect-error The overlay application prop remains readonly.
props.application = application;
// @ts-expect-error Validated display widths expose no writable raw value.
geometry.width.value = 320;
// @ts-expect-error Derived display heights expose no writable raw value.
geometry.height.value = 200;

void props;
void geometry;
