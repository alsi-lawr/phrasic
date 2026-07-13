import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const excludedDirectories: ReadonlyArray<string> = Object.freeze([
  ".agent-workspace",
  ".git",
  "dist",
  "node_modules",
]);
const retiredUiPaths: ReadonlyArray<string> = Object.freeze([
  "components/NowPlaying.css",
  "components/NowPlaying.tsx",
  "components/artist/Artist.css",
  "components/artist/Artist.tsx",
  "components/artwork/AlbumArtwork.tsx",
  "components/artwork/Artwork.css",
  "components/songdetails/SongDetails.css",
  "components/songdetails/SongDetails.tsx",
  "components/title/Title.css",
  "components/title/Title.tsx",
  "components/overlay/OverlayStatus.tsx",
  "components/overlay/overlay-artwork.ts",
  "public/fonts/GeistMonoVF.woff",
]);
const expectedGlobals = `@import "tailwindcss";

@font-face {
  font-family: "Geist";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/GeistVF.woff") format("woff");
}

@theme {
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-overlay-display: "Geist", ui-sans-serif, system-ui, sans-serif;

  --color-overlay-context: #737373;
  --color-overlay-creator: #808080;
  --color-overlay-detail: #a3a3a3;
  --color-overlay-shell: #1e1e1e;
  --color-overlay-status: #a3a3a3;
  --color-overlay-title: #06ab4f;
  --color-overlay-vinyl-disc: #36548e;
  --color-overlay-vinyl-groove: #a5b9de;
  --color-overlay-vinyl-hub: #1b2a59;
  --color-overlay-vinyl-label: #87a7da;
  --color-overlay-vinyl-rim: #7188bd;

  --text-overlay-context-size: 54px;
  --text-overlay-creator-size: 200px;
  --text-overlay-detail-size: 72px;
  --text-overlay-status-size: 112px;
  --text-overlay-title-size: 300px;

  --tracking-overlay-context: 4px;
  --tracking-overlay-detail: 2px;
  --tracking-overlay-normal: 0px;
}
`;

test("the browser overlay ships only the active Tailwind UI contract", () => {
  assert.deepEqual([...projectPathsWithExtension(projectRoot, ".css")].sort(), [
    "browser/globals.css",
  ]);
  assert.equal(readProjectText("browser/globals.css"), expectedGlobals);

  for (const retiredPath of retiredUiPaths) {
    assert.equal(existsSync(join(projectRoot, retiredPath)), false);
  }

  const activeSource = `${sourceText("browser")}\n${sourceText("components")}`;
  const componentSource = sourceText("components");
  const entry = readProjectText("browser/main.tsx");
  const overlay = readProjectText(
    "components/overlay/SpotifyNowPlayingOverlay.tsx",
  );

  assert.match(
    entry,
    /from "\.\.\/components\/overlay\/SpotifyNowPlayingOverlay\.tsx";/,
  );
  assert.doesNotMatch(
    activeSource,
    /components\/(?:NowPlaying|artist|artwork|songdetails|title)/,
  );
  assert.match(overlay, /<main className="[^"]*\bfont-sans\b[^"]*">/);
  assert.doesNotMatch(componentSource, /\b(?:setTimeout|setInterval)\s*\(/);
  assert.doesNotMatch(componentSource, /(?:data\s*:\s*image|base64)/i);
  assert.doesNotMatch(
    componentSource,
    /(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)[^\n]*(?:transition|timer)/i,
  );
  assert.doesNotMatch(activeSource, /GeistMono/i);
  assert.doesNotMatch(expectedGlobals, /https?:\/\//i);
  assert.deepEqual(fontFileNames(), ["GeistVF.woff"]);
  assert.notEqual(
    statSync(join(projectRoot, "public/fonts/GeistVF.woff")).size,
    0,
  );
});

test("the active overlay SVG uses complete Tailwind presentation contracts", () => {
  const overlaySource = sourceText("components/overlay");
  const overlayTsxSource = sourceTextWithExtension("components/overlay", ".tsx")
    .map((sourcePath) => readProjectText(sourcePath))
    .join("\n");
  const metadataAndMarqueeSource = `${readProjectText(
    "components/overlay/MarqueeText.tsx",
  )}\n${readProjectText("components/overlay/OverlayMetadata.tsx")}`;
  const presentationSource = readProjectText(
    "components/overlay/overlay-presentation.ts",
  );

  assert.doesNotMatch(overlaySource, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(
    overlayTsxSource,
    /\b(?:fill|stroke|strokeWidth|fontFamily|fontSize|fontWeight|letterSpacing|opacity|fillOpacity|strokeOpacity)\s*=/,
  );
  assert.doesNotMatch(overlayTsxSource, /\bstyle\s*=/);
  assert.doesNotMatch(overlaySource, /className=\{`/);
  assert.doesNotMatch(overlaySource, /className=\{[^}]*\+[^}]*\}/);
  assert.doesNotMatch(
    overlaySource,
    /\b(?:fill|stroke|text|font|tracking|opacity)-\[[^\]]+\]/,
  );
  assert.doesNotMatch(
    overlaySource,
    /\b(?:fill|stroke|text|font|tracking|opacity)-(?:\$\{|["']\s*\+)/,
  );
  assert.doesNotMatch(
    metadataAndMarqueeSource,
    /\b(?:fill|fontFamily|fontSize|fontWeight|letterSpacing)\s*:/,
  );
  assert.match(
    presentationSource,
    /"font-overlay-display fill-overlay-title text-overlay-title-size font-normal tracking-overlay-normal"/,
  );
  assert.match(
    presentationSource,
    /"font-overlay-display fill-overlay-creator text-overlay-creator-size font-semibold tracking-overlay-normal uppercase"/,
  );
  assert.match(
    presentationSource,
    /"font-overlay-display fill-overlay-detail text-overlay-detail-size font-medium tracking-overlay-detail"/,
  );
  assert.match(presentationSource, /"fill-overlay-shell opacity-90"/);
  assert.match(presentationSource, /fill-overlay-vinyl-disc/);
  assert.match(presentationSource, /stroke-overlay-vinyl-groove/);
  assert.doesNotMatch(overlaySource, /fill-overlay-(?:border|surface|rule)/);
  assert.doesNotMatch(
    overlaySource,
    /overlay-status-(?:active|failure|neutral|warning)/,
  );
});

function fontFileNames(): ReadonlyArray<string> {
  return readdirSync(join(projectRoot, "public/fonts")).sort();
}

function projectPathsWithExtension(
  directory: string,
  extension: string,
): ReadonlyArray<string> {
  const paths: Array<string> = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!excludedDirectories.includes(entry.name)) {
        paths.push(...projectPathsWithExtension(path, extension));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      paths.push(relative(projectRoot, path));
    }
  }

  return paths;
}

function readProjectText(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

function sourceText(path: string): string {
  return sourceTextWithExtension(path, ".ts")
    .concat(sourceTextWithExtension(path, ".tsx"))
    .map((sourcePath) => readProjectText(sourcePath))
    .join("\n");
}

function sourceTextWithExtension(
  path: string,
  extension: string,
): ReadonlyArray<string> {
  return projectPathsWithExtension(join(projectRoot, path), extension);
}
