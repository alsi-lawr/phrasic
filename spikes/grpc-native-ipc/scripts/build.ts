import { rm } from "node:fs/promises";
import { join, relative } from "node:path";

const workspaceRoot = join(import.meta.dir, "..");
const outputRoot = join(workspaceRoot, "dist");

await rm(outputRoot, { force: true, recursive: true });

const browserBuild = await Bun.build({
  entrypoints: [join(workspaceRoot, "browser/index.html")],
  env: "disable",
  minify: true,
  naming: {
    asset: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    entry: "[name].[ext]",
  },
  outdir: join(outputRoot, "browser"),
  sourcemap: "none",
  target: "browser",
});

if (!browserBuild.success) {
  for (const log of browserBuild.logs) {
    console.error(log);
  }
  throw new Error("T-006 browser build failed");
}

const terminatorBuild = await Bun.build({
  entrypoints: [join(workspaceRoot, "terminator/main.ts")],
  env: "disable",
  format: "cjs",
  minify: true,
  naming: "terminator.cjs",
  outdir: outputRoot,
  sourcemap: "none",
  target: "bun",
});

if (!terminatorBuild.success) {
  for (const log of terminatorBuild.logs) {
    console.error(log);
  }
  throw new Error("T-006 terminator build failed");
}

const artifacts = [...browserBuild.outputs, ...terminatorBuild.outputs].sort(
  (left, right) => left.path.localeCompare(right.path),
);
for (const artifact of artifacts) {
  console.log(
    `artifact path=${relative(outputRoot, artifact.path)} bytes=${artifact.size}`,
  );
}
