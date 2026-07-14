import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

const tsxExtension = ".tsx";

export async function load(url, context, nextLoad) {
  if (!url.endsWith(tsxExtension)) {
    return nextLoad(url, context);
  }

  const source = await readFile(new URL(url), "utf8");
  const transformed = await transformWithOxc(source, url, {
    jsx: { runtime: "automatic" },
    lang: "tsx",
    sourceType: "module",
    target: "esnext",
  });

  return {
    format: "module",
    shortCircuit: true,
    source: transformed.code,
  };
}
