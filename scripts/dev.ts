import fake from "../fake/index.html";
import index from "../index.html";
import spotify from "../spotify/index.html";

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
    entrypoints: [entrypoint],
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
