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
  return projectPathsWithExtension(join(projectRoot, path), ".ts")
    .concat(projectPathsWithExtension(join(projectRoot, path), ".tsx"))
    .map((sourcePath) => readProjectText(sourcePath))
    .join("\n");
}
