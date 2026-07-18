import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { test } from "bun:test";
import { buildApplication } from "../../scripts/build";

test("Tailwind output discovers application utilities but excludes test utilities", async () => {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "phrasic-tailwind-discovery-"),
  );

  try {
    await buildApplication(outputDirectory);

    const css = generatedCss(outputDirectory);
    assert.match(css, /\.animate-artwork-fade-in\{/);
    assert.match(css, /\.animate-vinyl-spin\{/);
    assert.match(css, /transform-box:fill-box/);
    assert.match(css, /\.min-h-full\{/);
    assert.match(css, /\.fill-overlay-title\{/);
    assert.doesNotMatch(css, /\.bg-fuchsia-500\{/);
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
});

function generatedCss(outputDirectory: string): string {
  return filesRecursively(outputDirectory)
    .filter((path) => extname(path) === ".css")
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

function filesRecursively(directory: string): ReadonlyArray<string> {
  const paths: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...filesRecursively(path));
      continue;
    }

    if (entry.isFile()) {
      paths.push(path);
    }
  }

  return paths;
}
