import fake from "../apps/web/fake/index.html";
import index from "../apps/web/index.html";
import spotify from "../apps/web/spotify/index.html";
import { join } from "node:path";

const webSourceRoot = join(import.meta.dir, "..", "apps", "web", "src");

const [spotifyWorker, fakeWorker] = await Promise.all([
  buildDevelopmentWorker("browser/worker/entry.ts"),
  buildDevelopmentWorker("browser/fake/worker-entry.ts"),
]);

const server = Bun.serve({
  port: 5173,
  routes: {
    "/": index,
    "/fake/": fake,
    "/browser/fake/worker-entry.ts": fakeWorker,
    "/browser/worker/entry.ts": spotifyWorker,
    "/fake/index.html": fake,
    "/index.html": index,
    "/spotify/": spotify,
    "/spotify/index.html": spotify,
  },
});

console.info(`Phrasic development server: ${server.url}`);

async function buildDevelopmentWorker(entrypoint: string): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [join(webSourceRoot, entrypoint)],
    env: "disable",
    minify: false,
    sourcemap: "none",
    target: "browser",
  });
  const output = result.outputs[0];

  if (!result.success || output === undefined) {
    throw new Error(`Bun did not build the ${entrypoint} development worker.`);
  }

  return new Response(output, {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
}
