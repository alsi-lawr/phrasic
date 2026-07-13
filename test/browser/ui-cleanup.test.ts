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
  --font-overlay-display: Arial, Helvetica, sans-serif;

  --color-overlay-artwork-surface: #05070a;
  --color-overlay-border: #313b47;
  --color-overlay-content-muted: #8f9baa;
  --color-overlay-content-secondary: #d7dfe8;
  --color-overlay-content-title: #f7fafc;
  --color-overlay-rule: #35404d;
  --color-overlay-shell: #0b0e12;
  --color-overlay-status-active: #06ab4f;
  --color-overlay-status-failure: #f2777a;
  --color-overlay-status-neutral: #c9d2dc;
  --color-overlay-status-warning: #f2b75d;
  --color-overlay-surface: #151a20;
  --color-overlay-vinyl-base: #030405;
  --color-overlay-vinyl-groove: #202832;
  --color-overlay-vinyl-groove-inner: #182029;
  --color-overlay-vinyl-label: #d5e2d9;

  --text-overlay-category: 82px;
  --text-overlay-detail: 88px;
  --text-overlay-subtitle: 126px;
  --text-overlay-title: 258px;

  --tracking-overlay-category: 12px;
  --tracking-overlay-context: 4px;
  --tracking-overlay-normal: 0px;
  --tracking-overlay-status: 10px;
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
    /"font-overlay-display fill-overlay-content-title text-overlay-title font-bold tracking-overlay-normal"/,
  );
  assert.match(
    presentationSource,
    /"font-overlay-display fill-overlay-content-secondary text-overlay-subtitle font-semibold tracking-overlay-normal"/,
  );
  assert.match(
    presentationSource,
    /"font-overlay-display fill-overlay-content-muted text-overlay-detail font-semibold tracking-overlay-context"/,
  );
  assert.match(presentationSource, /fill-overlay-status-active/);
  assert.match(presentationSource, /stroke-overlay-status-active/);
  assert.match(presentationSource, /fill-overlay-status-failure/);
  assert.match(presentationSource, /stroke-overlay-status-failure/);
  assert.match(presentationSource, /fill-overlay-status-neutral/);
  assert.match(presentationSource, /stroke-overlay-status-neutral/);
  assert.match(presentationSource, /fill-overlay-status-warning/);
  assert.match(presentationSource, /stroke-overlay-status-warning/);
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
