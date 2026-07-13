import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const expectedDocumentCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data: https://i.scdn.co",
  "font-src 'self'",
  "connect-src 'self' https://accounts.spotify.com https://api.spotify.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join("; ");

test("static HTML entries have restrictive CSP and no-referrer metadata", () => {
  const htmlEntries: ReadonlyArray<string> = [
    "index.html",
    "spotify/index.html",
  ];

  for (const entry of htmlEntries) {
    const html = readProjectText(entry);
    const policy = contentSecurityPolicy(html);

    assert.equal(policy, expectedDocumentCsp);
    assert.doesNotMatch(policy, /unsafe-(?:eval|inline)/i);
    assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/>/);
  }

  const rootEntry = readProjectText("index.html");
  const spotifyEntry = readProjectText("spotify/index.html");
  assert.match(
    rootEntry,
    /http-equiv="refresh"\s+content="0; url=\/spotify\/"/,
  );
  assert.match(
    spotifyEntry,
    /<script\s+type="module"\s+src="\/browser\/main\.tsx"><\/script>/,
  );
});

test("the static-host contract requires no-store callback and configuration responses plus immutable hashed assets", () => {
  const headers = readProjectText("deploy/static-host-headers.md");
  const headerPolicy = responseContentSecurityPolicy(headers);

  assert.match(headers, /not automatically applied/);
  assert.equal(headerPolicy, `${expectedDocumentCsp}; frame-ancestors 'none'`);
  assert.doesNotMatch(headerPolicy, /unsafe-(?:eval|inline)/i);
  assert.match(headers, /Referrer-Policy: no-referrer/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Permissions-Policy: .*camera=\(\).*microphone=\(\)/);
  assert.match(
    headers,
    /\| `\/config\.json`\s+\| `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`\s+\|/,
  );
  assert.match(
    headers,
    /\| `\/spotify\/` and `\/spotify\/index\.html`\s+\| `Cache-Control: no-store, no-cache, max-age=0, must-revalidate`\s+\|/,
  );
  assert.match(
    headers,
    /\| `\/`, `\/index\.html`, and every other HTML entry\s+\| `Cache-Control: no-cache, max-age=0, must-revalidate`\s+\|/,
  );
  assert.match(
    headers,
    /\/assets\/<name>-<content-hash>\.<ext>.*public, max-age=31536000, immutable/,
  );
});

test("Vite disables source maps and environment injection while runtime configuration stays same-origin and uncached", () => {
  const viteConfiguration = readProjectText("vite.config.ts");
  const application = readProjectText("browser/application.ts");
  const entry = readProjectText("browser/main.tsx");

  assert.match(viteConfiguration, /envPrefix:\s*\[\s*\]/);
  assert.match(viteConfiguration, /sourcemap:\s*false/);
  assert.doesNotMatch(viteConfiguration, /loadEnv\(/);
  assert.doesNotMatch(viteConfiguration, /define\s*:/);
  assert.match(application, /new URL\(\s*"\/config\.json",/);
  assert.match(entry, /cache:\s*"no-store"/);
  assert.doesNotMatch(
    `${application}\n${entry}`,
    /(?:import\.meta\.env|process\.env)/,
  );
});

function contentSecurityPolicy(html: string): string {
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/>/,
  );
  if (match === null) {
    throw new Error("Expected a Content-Security-Policy meta tag.");
  }

  const policy = match[1];
  if (policy === undefined) {
    throw new Error("Expected a Content-Security-Policy meta value.");
  }

  return policy;
}

function responseContentSecurityPolicy(headers: string): string {
  const match = headers.match(/Content-Security-Policy: ([^\n]+)/);
  if (match === null) {
    throw new Error("Expected a Content-Security-Policy response header.");
  }

  const policy = match[1];
  if (policy === undefined) {
    throw new Error(
      "Expected a Content-Security-Policy response header value.",
    );
  }

  return policy;
}

function readProjectText(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}
