import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const excludedTestOnlyUtility = "bg-fuchsia-500";

type ProductionClassFamily = {
  readonly classes: ReadonlyArray<string>;
  readonly name: string;
};

const productionClassFamilies: ReadonlyArray<ProductionClassFamily> =
  Object.freeze([
    {
      name: "Spotify document layout",
      classes: [
        "m-0",
        "h-full",
        "min-h-full",
        "w-full",
        "overflow-x-auto",
        "bg-transparent",
        "p-0",
        "font-sans",
        "text-white",
        "flex",
        "items-start",
        "justify-start",
      ],
    },
    {
      name: "overlay layout and accessibility",
      classes: [
        "relative",
        "shrink-0",
        "block",
        "flex-col",
        "sr-only",
        "opacity-0",
      ],
    },
    {
      name: "metadata presentation tokens",
      classes: [
        "font-overlay-display",
        "fill-overlay-context",
        "fill-overlay-creator",
        "fill-overlay-detail",
        "fill-overlay-status",
        "fill-overlay-title",
        "text-overlay-context-size",
        "text-overlay-creator-size",
        "text-overlay-detail-size",
        "text-overlay-status-size",
        "text-overlay-title-size",
        "font-medium",
        "font-normal",
        "font-semibold",
        "tracking-overlay-context",
        "tracking-overlay-detail",
        "tracking-overlay-normal",
        "uppercase",
      ],
    },
    {
      name: "shell and fallback vinyl SVG presentation",
      classes: [
        "fill-overlay-shell",
        "opacity-90",
        "fill-overlay-vinyl-disc",
        "fill-overlay-vinyl-hub",
        "fill-overlay-vinyl-label",
        "fill-none",
        "stroke-overlay-vinyl-groove",
        "stroke-overlay-vinyl-rim",
        "stroke-8",
      ],
    },
    {
      name: "setup diagnostic and controls",
      classes: [
        "max-w-xl",
        "border-l-4",
        "border-amber-300",
        "bg-slate-950",
        "px-4",
        "py-3",
        "text-sm",
        "text-base",
        "text-slate-100",
        "mb-0",
        "mt-1",
        "border",
        "border-slate-500",
        "items-center",
        "gap-2",
        "p-2",
        "px-3",
        "py-2",
        "rounded-md",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-emerald-300",
        "focus-visible:ring-offset-2",
        "focus-visible:ring-offset-slate-950",
      ],
    },
    {
      name: "visible Spotify link targets and focus",
      classes: [
        "absolute",
        "inset-0",
        "pointer-events-none",
        "pointer-events-auto",
        "cursor-pointer",
        "outline-none",
        "fill-transparent",
        "stroke-transparent",
        "stroke-0",
        "group-focus-visible:stroke-white",
        "group-focus-visible:stroke-40",
      ],
    },
  ]);

test("restricted Tailwind discovery retains production utilities and excludes test input", async () => {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "obs-nowplaying-tailwind-"),
  );

  try {
    await build({
      configFile: join(projectRoot, "vite.config.ts"),
      logLevel: "silent",
      root: projectRoot,
      build: { emptyOutDir: true, outDir: outputDirectory },
    });

    const generatedCss = generatedStylesheet(outputDirectory);

    for (const family of productionClassFamilies) {
      for (const className of family.classes) {
        assert.ok(
          generatedCss.includes(tailwindSelector(className)),
          `${family.name} is missing ${className}`,
        );
      }
    }

    assert.equal(
      generatedCss.includes(tailwindSelector(excludedTestOnlyUtility)),
      false,
      "Tailwind must not scan test files for production candidates",
    );
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
});

function generatedStylesheet(outputDirectory: string): string {
  const stylesheetPaths = pathsWithExtension(outputDirectory, ".css");

  if (stylesheetPaths.length !== 1) {
    throw new Error(
      `Expected one generated stylesheet, received ${stylesheetPaths.length}.`,
    );
  }

  return readFileSync(stylesheetPaths[0], "utf8");
}

function pathsWithExtension(
  directory: string,
  extension: string,
): ReadonlyArray<string> {
  const paths: Array<string> = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      paths.push(...pathsWithExtension(path, extension));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      paths.push(path);
    }
  }

  return paths;
}

function tailwindSelector(className: string): string {
  return `.${className.replaceAll(":", "\\:")}`;
}
