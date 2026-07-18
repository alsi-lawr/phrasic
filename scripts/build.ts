import tailwind from "bun-plugin-tailwind";
import type { BunPlugin } from "bun";

const applicationEntries = [
  "index.html",
  "spotify/index.html",
  "fake/index.html",
] as const;

const publicFiles = [
  "fake-artwork.svg",
  "favicon.svg",
  "fonts/GeistVF.woff",
  "spotify-full-logo-white.svg",
] as const;
const publicFontUrl = "/fonts/GeistVF.woff";

const buildMetadata = {
  bunVersion: "1.3.13",
  environment: "disabled",
  entries: applicationEntries,
  publicFiles,
  sourceMaps: "none",
  mode: "production",
} as const;

type WorkerBuild = {
  readonly entrypoint: string;
  readonly url: string;
};

export async function buildApplication(
  outputDirectory: string = "dist",
): Promise<void> {
  await Bun.$`rm -rf ${outputDirectory}`;

  const workers = await Promise.all([
    buildWorker("browser/worker/entry.ts", outputDirectory),
    buildWorker("browser/fake/worker-entry.ts", outputDirectory),
  ]);
  const workerUrls = new Map(
    workers.map((worker) => [worker.entrypoint, worker.url]),
  );

  const result = await Bun.build({
    entrypoints: [...applicationEntries],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    env: "disable",
    loader: { ".woff": "file" },
    minify: true,
    naming: {
      asset: "assets/[name]-[hash].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
    },
    outdir: outputDirectory,
    plugins: [tailwind, generatedWorkerUrlPlugin(workerUrls)],
    sourcemap: "none",
    splitting: true,
    target: "browser",
  });

  if (!result.success) {
    throw new Error("Bun did not build the browser application.");
  }

  await externalizePublicFont(result.outputs);

  for (const publicFile of publicFiles) {
    await Bun.write(
      `${outputDirectory}/${publicFile}`,
      Bun.file(`public/${publicFile}`),
    );
  }

  await Bun.write(
    `${outputDirectory}/build-metadata.json`,
    `${JSON.stringify(buildMetadata, undefined, 2)}\n`,
  );
}

async function externalizePublicFont(
  outputs: ReadonlyArray<Bun.BuildArtifact>,
): Promise<void> {
  const cssOutputs = outputs.filter((output) => output.path.endsWith(".css"));
  let replacedFont = false;

  for (const output of cssOutputs) {
    const css = await Bun.file(output.path).text();
    const rewrittenCss = css.replace(
      /url\(data:font\/woff;base64,[^)]+\)/g,
      `url(${JSON.stringify(publicFontUrl)})`,
    );
    if (rewrittenCss !== css) {
      replacedFont = true;
      await Bun.write(output.path, rewrittenCss);
    }
  }

  if (!replacedFont) {
    throw new Error("Bun did not emit the declared public Geist font.");
  }
}

async function buildWorker(
  entrypoint: string,
  outputDirectory: string,
): Promise<WorkerBuild> {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    env: "disable",
    minify: true,
    naming: { entry: "assets/[dir]/[name]-[hash].[ext]" },
    outdir: outputDirectory,
    sourcemap: "none",
    target: "browser",
  });
  const output = result.outputs[0];

  if (
    !result.success ||
    output === undefined ||
    output.kind !== "entry-point"
  ) {
    throw new Error(`Bun did not build the ${entrypoint} module worker.`);
  }

  const absoluteOutputDirectory = outputDirectory.startsWith("/")
    ? outputDirectory
    : `${process.cwd()}/${outputDirectory}`;
  const relativePath = output.path.slice(absoluteOutputDirectory.length);

  if (!relativePath.startsWith("/")) {
    throw new Error(`Bun emitted ${entrypoint} outside the build directory.`);
  }

  return { entrypoint, url: relativePath };
}

function generatedWorkerUrlPlugin(
  workerUrls: ReadonlyMap<string, string>,
): BunPlugin {
  return {
    name: "phrasic-generated-worker-urls",
    setup(build): void {
      build.onLoad({ filter: /main\.tsx$/ }, async (argument) => {
        const entrypoint = argument.path.includes("/fake/")
          ? "browser/fake/worker-entry.ts"
          : "browser/worker/entry.ts";
        const workerUrl = workerUrls.get(entrypoint);

        if (workerUrl === undefined) {
          throw new Error(`No output URL exists for ${entrypoint}.`);
        }

        const workerPath =
          entrypoint === "browser/fake/worker-entry.ts"
            ? "/browser/fake/worker-entry.ts"
            : "/browser/worker/entry.ts";
        const source = await Bun.file(argument.path).text();
        const workerReference = `new URL(${JSON.stringify(workerPath)}, window.location.origin)`;

        if (!source.includes(workerReference)) {
          throw new Error(
            `No module worker reference exists in ${argument.path}.`,
          );
        }

        return {
          contents: source.replace(
            workerReference,
            `new URL(${JSON.stringify(workerUrl)}, globalThis.location.origin)`,
          ),
          loader: "tsx",
        };
      });
    },
  };
}

if (import.meta.main) {
  await buildApplication();
}
