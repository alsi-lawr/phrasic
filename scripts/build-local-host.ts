import tailwind from "bun-plugin-tailwind";
import type { BunPlugin } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type LocalHostTarget = "linux" | "windows";

const repositoryRoot = resolve(import.meta.dir, "..");
const target = parseTarget(process.argv[2]);
const outputRoot = resolve(
  process.argv[3] ?? join(repositoryRoot, "dist", "native", target),
);
const scratchRoot = join(outputRoot, ".build");
const executableName =
  target === "windows" ? "phrasic-local-host.exe" : "phrasic-local-host";

await rm(outputRoot, { force: true, recursive: true });
await mkdir(scratchRoot, { recursive: true });

try {
  const worker = await buildWorker(scratchRoot);
  const workerPublicPath = `/assets/${basename(worker.path)}`;
  const wrapper = await writeWrapper(
    scratchRoot,
    worker.path,
    workerPublicPath,
  );
  const result = await Bun.build({
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      outfile: join(outputRoot, executableName),
      target:
        target === "windows"
          ? "bun-windows-x64-baseline"
          : "bun-linux-x64-baseline",
    },
    entrypoints: [wrapper],
    env: "disable",
    minify: true,
    plugins: [tailwind, localWorkerUrlPlugin(workerPublicPath)],
    sourcemap: "none",
    target: "bun",
  });
  if (!result.success) {
    throw new Error("Bun did not compile the Local host.");
  }
} finally {
  await rm(scratchRoot, { force: true, recursive: true });
}

console.info(
  `Local host target=${target} path=${join(outputRoot, executableName)}`,
);

function parseTarget(input: string | undefined): LocalHostTarget {
  if (input === undefined) {
    if (process.platform === "linux") {
      return "linux";
    }
    if (process.platform === "win32") {
      return "windows";
    }
  }
  if (input === "linux" || input === "windows") {
    return input;
  }
  throw new Error("Local host target must be linux or windows.");
}

async function buildWorker(
  outputDirectory: string,
): Promise<Bun.BuildArtifact> {
  const result = await Bun.build({
    entrypoints: [join(repositoryRoot, "browser", "local", "worker-entry.ts")],
    env: "disable",
    minify: true,
    naming: "local-worker-[hash].[ext]",
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
    throw new Error("Bun did not build the Local playback worker.");
  }
  return output;
}

async function writeWrapper(
  outputDirectory: string,
  workerPath: string,
  workerPublicPath: string,
): Promise<string> {
  const wrapperPath = join(outputDirectory, "local-host-entry.ts");
  const source = [
    `import localPage from ${JSON.stringify(join(repositoryRoot, "local", "index.html"))};`,
    `import workerPath from ${JSON.stringify(workerPath)} with { type: "file" };`,
    `import { runLocalHost } from ${JSON.stringify(join(repositoryRoot, "server", "local", "runtime.ts"))};`,
    `await runLocalHost({ localPage, worker: { embeddedPath: workerPath, publicPath: ${JSON.stringify(workerPublicPath)} } });`,
    "",
  ].join("\n");
  await Bun.write(wrapperPath, source);
  return wrapperPath;
}

function localWorkerUrlPlugin(workerPublicPath: string): BunPlugin {
  return {
    name: "phrasic-local-worker-url",
    setup(build): void {
      build.onLoad(
        { filter: /browser\/local\/main\.tsx$/ },
        async (argument) => {
          const source = await Bun.file(argument.path).text();
          const reference =
            'new URL("/browser/local/worker-entry.ts", window.location.origin)';
          if (!source.includes(reference)) {
            throw new Error("The Local worker URL reference is absent.");
          }
          return {
            contents: source.replace(
              reference,
              `new URL(${JSON.stringify(workerPublicPath)}, window.location.origin)`,
            ),
            loader: "tsx",
          };
        },
      );
    },
  };
}
