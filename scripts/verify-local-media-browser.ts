import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = join(import.meta.dir, "..");
const scratchRoot = await mkdtemp(
  join(tmpdir(), "phrasic-local-media-browser-contract-"),
);
const bundlePath = join(scratchRoot, "local-media-contract-runtime.js");
const fixturePath = join(
  workspaceRoot,
  "fixtures",
  "local-media",
  "v1",
  "snapshot.bin",
);
const chrome = Bun.which("google-chrome");

if (chrome === null) {
  throw new Error(
    "Google Chrome is required for the local media browser contract test.",
  );
}

try {
  const build = await Bun.build({
    entrypoints: [
      join(
        workspaceRoot,
        "tests",
        "browser",
        "local-media-contract-runtime.ts",
      ),
    ],
    format: "esm",
    outdir: scratchRoot,
    target: "browser",
  });
  if (!build.success) {
    throw new Error(
      `Browser contract bundle failed:\n${build.logs.map((log) => log.message).join("\n")}`,
    );
  }

  const server = Bun.serve({
    fetch(request): Response {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/") {
        return new Response(
          '<!doctype html><script type="module" src="/local-media-contract-runtime.js"></script>',
          { headers: { "content-type": "text/html" } },
        );
      }
      if (pathname === "/local-media-contract-runtime.js") {
        return new Response(Bun.file(bundlePath), {
          headers: { "content-type": "text/javascript" },
        });
      }
      if (pathname === "/fixtures/local-media/v1/snapshot.bin") {
        return new Response(Bun.file(fixturePath), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
    hostname: "127.0.0.1",
    port: 0,
  });

  try {
    const browser = Bun.spawn({
      cmd: [
        chrome,
        "--disable-gpu",
        "--headless=new",
        "--no-sandbox",
        "--virtual-time-budget=3000",
        "--dump-dom",
        `http://127.0.0.1:${server.port}/`,
      ],
      stderr: "pipe",
      stdout: "pipe",
    });
    const exitCode = await browser.exited;
    const standardOutput = await new Response(browser.stdout).text();
    if (
      exitCode !== 0 ||
      !standardOutput.includes('data-local-media-contract="passed"')
    ) {
      const standardError = await new Response(browser.stderr).text();
      throw new Error(
        `Browser contract test failed with exit code ${exitCode}: ${standardError}`,
      );
    }
  } finally {
    server.stop(true);
  }
} finally {
  await rm(scratchRoot, { force: true, recursive: true });
}
