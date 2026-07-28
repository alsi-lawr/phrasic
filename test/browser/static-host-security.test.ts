import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { test } from "bun:test";
import { buildOutput } from "./build-output.ts";

const staticHtmlEntries: ReadonlyArray<string> = [
  "index.html",
  "spotify/index.html",
];
const textFileExtensions: ReadonlyArray<string> = [
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
];
const expectedCspDirectives: ReadonlyArray<
  readonly [string, ReadonlyArray<string>]
> = [
  ["default-src", ["'none'"]],
  ["base-uri", ["'none'"]],
  ["object-src", ["'none'"]],
  ["script-src", ["'self'"]],
  ["script-src-attr", ["'none'"]],
  ["style-src", ["'self'"]],
  ["style-src-attr", ["'none'"]],
  ["worker-src", ["'self'"]],
  ["frame-src", ["'none'"]],
  ["form-action", ["'none'"]],
  ["img-src", ["'self'", "data:", "https://i.scdn.co"]],
  [
    "connect-src",
    ["'self'", "https://accounts.spotify.com", "https://api.spotify.com"],
  ],
];
const secretBuildEnvironment: ReadonlyArray<readonly [string, string]> = [
  ["VITE_CLIENT_SECRET", "build-client-secret-must-not-ship"],
  ["VITE_ACCESS_TOKEN", "build-access-token-must-not-ship"],
  ["VITE_REFRESH_TOKEN", "build-refresh-token-must-not-ship"],
];

type DocumentSecurityMetadata = {
  readonly contentSecurityPolicy: string;
  readonly referrerPolicy: string;
};

test("production artifacts preserve static-host security boundaries", async () => {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "phrasic-static-host-security-"),
  );
  const restoreBuildEnvironment = injectSecretBuildEnvironment();

  try {
    await buildOutput(outputDirectory);

    for (const entry of staticHtmlEntries) {
      const metadata = documentSecurityMetadata(
        readFileSync(join(outputDirectory, entry), "utf8"),
      );
      assert.equal(metadata.referrerPolicy, "no-referrer");
      for (const [directive, expectedSources] of expectedCspDirectives) {
        assertCspDirective(
          metadata.contentSecurityPolicy,
          directive,
          expectedSources,
        );
      }
      assert.doesNotMatch(
        metadata.contentSecurityPolicy,
        /'unsafe-(?:eval|inline)'/i,
      );
    }

    const outputPaths = filesRecursively(outputDirectory);
    assert.equal(
      outputPaths.some((path) => path.endsWith(".map")),
      false,
      "production artifacts must not include source maps",
    );

    const textArtifacts = outputPaths
      .filter((path) =>
        textFileExtensions.includes(extname(path).toLowerCase()),
      )
      .map((path) => readFileSync(path, "utf8"));
    assert.equal(
      textArtifacts.some((artifact) => artifact.includes("sourceMappingURL")),
      false,
      "production text must not reference source maps",
    );
    assert.equal(
      textArtifacts.some((artifact) => artifact.includes("data:font/woff")),
      false,
      "production CSS must use the CSP-compatible public font URL",
    );

    for (const [name, value] of secretBuildEnvironment) {
      assert.equal(
        outputPaths.some((path) => readFileSync(path).includes(value)),
        false,
        `${name} must not be emitted to the browser`,
      );
    }
  } finally {
    restoreBuildEnvironment();
    rmSync(outputDirectory, { force: true, recursive: true });
  }
});

function documentSecurityMetadata(
  documentText: string,
): DocumentSecurityMetadata {
  let contentSecurityPolicy: string | undefined;
  let referrerPolicy: string | undefined;

  for (const match of documentText.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = htmlAttributes(match[0]);
    const content = attributes.get("content");
    if (content === undefined) {
      continue;
    }

    if (
      attributes.get("http-equiv")?.toLowerCase() === "content-security-policy"
    ) {
      if (contentSecurityPolicy !== undefined) {
        throw new Error("Expected one Content-Security-Policy meta tag.");
      }

      contentSecurityPolicy = content;
      continue;
    }

    if (attributes.get("name")?.toLowerCase() === "referrer") {
      if (referrerPolicy !== undefined) {
        throw new Error("Expected one referrer meta tag.");
      }

      referrerPolicy = content;
    }
  }

  if (contentSecurityPolicy === undefined || referrerPolicy === undefined) {
    throw new Error("Expected CSP and referrer metadata in static HTML.");
  }

  return Object.freeze({ contentSecurityPolicy, referrerPolicy });
}

function htmlAttributes(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of tag.matchAll(attributePattern)) {
    const name = match[1];
    if (name === undefined || name.toLowerCase() === "meta") {
      continue;
    }

    attributes.set(name.toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function assertCspDirective(
  policy: string,
  directive: string,
  expectedSources: ReadonlyArray<string>,
): void {
  const matchingDirectives = policy
    .split(";")
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.startsWith(`${directive} `));
  if (matchingDirectives.length !== 1) {
    throw new Error(`Expected one ${directive} CSP directive.`);
  }

  const value = matchingDirectives[0];
  if (value === undefined) {
    throw new Error(`Expected the ${directive} CSP directive.`);
  }

  const [, ...sources] = value.split(/\s+/);
  assert.deepEqual([...sources].sort(), [...expectedSources].sort());
}

function injectSecretBuildEnvironment(): () => void {
  const savedValues = new Map<string, string | undefined>();

  for (const [name, value] of secretBuildEnvironment) {
    savedValues.set(name, process.env[name]);
    process.env[name] = value;
  }

  return (): void => {
    for (const [name, value] of savedValues) {
      if (value === undefined) {
        delete process.env[name];
        continue;
      }

      process.env[name] = value;
    }
  };
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
