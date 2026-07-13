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

test("the browser overlay ships only the active Tailwind UI contract", () => {
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
  assert.doesNotMatch(readProjectText("browser/globals.css"), /https?:\/\//i);
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
