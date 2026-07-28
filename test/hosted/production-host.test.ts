import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { parseRuntimeAssetManifest } from "../../server/manifest.ts";
import { startProductionHost, type ProductionHost } from "../../server/host.ts";
import { buildOutput } from "../browser/build-output.ts";
import {
  cachePolicies,
  contentSecurityPolicies,
} from "../../server/response-policy.ts";
import {
  caddyResponseMatrix,
  type BaselinePath,
  type BaselineResponse,
  rawCaddyResponseMatrix,
  type RawCaddyResponse,
} from "./caddy-response-matrix.ts";

type CurrentAssets = {
  readonly spotifyWorker: string;
  readonly worker: string;
};

test("the production Bun host consumes the retained Caddy response matrix", async () => {
  const outputDirectory = mkdtempSync(
    join(tmpdir(), "phrasic-production-host-"),
  );

  try {
    await buildOutput(outputDirectory);
    const assets = currentAssets(outputDirectory);
    const disabled = await startHost({
      fakeProviderEnabled: false,
      outputDirectory,
    });
    const enabled = await startHost({
      fakeProviderEnabled: true,
      outputDirectory,
    });

    try {
      await assertResponseMatrix({
        assets,
        expectedMode: "disabled",
        host: disabled,
        outputDirectory,
      });
      await assertResponseMatrix({
        assets,
        expectedMode: "enabled",
        host: enabled,
        outputDirectory,
      });
      await assertRawResponseMatrix({
        assets,
        expectedMode: "disabled",
        host: disabled,
        outputDirectory,
      });
      await assertRawResponseMatrix({
        assets,
        expectedMode: "enabled",
        host: enabled,
        outputDirectory,
      });
      await assertConfigurationBoundary({ host: disabled, outputDirectory });
      await assertMethodAndShutdownBoundaries(disabled);
    } finally {
      await enabled.stop();
      await disabled.stop();
    }
  } finally {
    rmSync(outputDirectory, { force: true, recursive: true });
  }
});

async function assertResponseMatrix(options: {
  readonly assets: CurrentAssets;
  readonly expectedMode: "disabled" | "enabled";
  readonly host: ProductionHost;
  readonly outputDirectory: string;
}): Promise<void> {
  for (const matrixCase of caddyResponseMatrix) {
    const expected = matrixCase[options.expectedMode];
    const path = resolvedPath(matrixCase.path, options.assets);
    const response = await fetch(hostUrl(options.host, path), {
      redirect: "manual",
    });

    assert.equal(response.status, expected.status, path);
    assert.equal(
      response.headers.get("location"),
      expected.redirect ?? null,
      path,
    );
    assert.equal(
      response.headers.get("content-type"),
      expected.contentType ?? null,
      path,
    );
    assert.equal(
      response.headers.get("cache-control"),
      cachePolicies[expected.cache],
      path,
    );
    assert.equal(
      response.headers.get("content-security-policy"),
      contentSecurityPolicies[expected.securityProfile],
      path,
    );
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
    assert.equal(
      response.headers.get("x-content-type-options"),
      "nosniff",
      path,
    );
    assert.equal(
      response.headers.get("permissions-policy"),
      "accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()",
      path,
    );
    await assertBodyClass({
      expected,
      outputDirectory: options.outputDirectory,
      path,
      response,
    });
  }
}

async function assertRawResponseMatrix(options: {
  readonly assets: CurrentAssets;
  readonly expectedMode: "disabled" | "enabled";
  readonly host: ProductionHost;
  readonly outputDirectory: string;
}): Promise<void> {
  for (const matrixCase of rawCaddyResponseMatrix) {
    if (matrixCase.configuration === "available") {
      writeFileSync(
        join(options.outputDirectory, "config.json"),
        publicConfigurationJson,
      );
    }

    const expected = matrixCase[options.expectedMode];
    const path = resolvedPath(matrixCase.path, options.assets);
    const response = await rawHttpRequest({
      host: options.host,
      method: matrixCase.method,
      path,
    });

    assert.equal(
      response.status,
      expected.status,
      `${matrixCase.method} ${path}`,
    );
    assert.equal(response.headers.get("location"), expected.redirect ?? null);
    assert.equal(response.headers.get("allow"), expected.allow ?? null);
    assert.equal(
      response.headers.get("content-type"),
      expected.contentType ?? null,
    );

    if (expected.securityProfile === undefined) {
      assert.equal(response.headers.get("cache-control"), null);
      assert.equal(response.headers.get("content-security-policy"), null);
      assert.equal(response.headers.get("permissions-policy"), null);
      assert.equal(response.headers.get("referrer-policy"), null);
      assert.equal(response.headers.get("x-content-type-options"), null);
    } else {
      assert.equal(
        response.headers.get("cache-control"),
        cachePolicies[expected.cache ?? "revalidate"],
      );
      assert.equal(
        response.headers.get("content-security-policy"),
        contentSecurityPolicies[expected.securityProfile],
      );
      assert.equal(
        response.headers.get("permissions-policy"),
        permissionsPolicy,
      );
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }

    await assertRawBody({
      expected,
      outputDirectory: options.outputDirectory,
      response,
    });
  }
}

async function assertConfigurationBoundary(options: {
  readonly host: ProductionHost;
  readonly outputDirectory: string;
}): Promise<void> {
  const configPath = join(options.outputDirectory, "config.json");
  writeFileSync(configPath, publicConfigurationJson);

  const validResponse = await fetch(hostUrl(options.host, "/config.json"));
  assert.equal(validResponse.status, 200);
  assert.equal(
    validResponse.headers.get("cache-control"),
    cachePolicies.noStore,
  );
  assert.equal(
    validResponse.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(await validResponse.text(), publicConfigurationJson);

  const configurationPost = await rawHttpRequest({
    host: options.host,
    method: "POST",
    path: "/config.json",
  });
  assert.equal(configurationPost.status, 405);
  assert.equal(configurationPost.headers.get("allow"), "GET, HEAD");
  assert.equal(
    configurationPost.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(
    configurationPost.headers.get("cache-control"),
    cachePolicies.noStore,
  );
  assert.equal(await configurationPost.text(), "");

  writeFileSync(
    configPath,
    JSON.stringify({
      spotify: {
        clientId: "public-client-id",
        clientSecret: "must-not-ship",
        redirectUri: "https://display.example/spotify/",
      },
    }),
  );

  const secretResponse = await fetch(hostUrl(options.host, "/config.json"));
  assert.equal(secretResponse.status, 404);
  assert.equal(await secretResponse.text(), "");
}

async function assertMethodAndShutdownBoundaries(
  host: ProductionHost,
): Promise<void> {
  for (const path of [
    "/assets/../../server.js",
    "/build-metadata.json",
    "/server-manifest.json",
    "/server.js",
  ]) {
    const response = await fetch(hostUrl(host, path));
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), "", path);
  }

  const post = await fetch(hostUrl(host, "/index.html"), { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal(await post.text(), "");

  const head = await fetch(hostUrl(host, "/index.html"), { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const traversal = await rawHttpRequest({
    host,
    method: "GET",
    path: "/assets/%2e%2e/server.js",
  });
  assert.equal(traversal.status, 404);
  assert.equal(await traversal.text(), "");

  await host.stop();
  await assert.rejects(fetch(hostUrl(host, "/")));
}

async function assertRawBody(options: {
  readonly expected: RawCaddyResponse;
  readonly outputDirectory: string;
  readonly response: RawHttpResponse;
}): Promise<void> {
  switch (options.expected.body) {
    case "bad-request":
      assert.equal(await options.response.text(), "400 Bad Request");
      return;
    case "empty":
      assert.equal(await options.response.text(), "");
      return;
    case "fake-html":
      assert.equal(
        await options.response.text(),
        readFileSync(join(options.outputDirectory, "fake/index.html"), "utf8"),
      );
      return;
    case "redirect":
      assert.equal(
        await options.response.text(),
        `<a href="${options.expected.redirect}">Permanent Redirect</a>.\n\n`,
      );
      return;
  }
}

async function assertBodyClass(options: {
  readonly expected: BaselineResponse;
  readonly outputDirectory: string;
  readonly path: string;
  readonly response: Response;
}): Promise<void> {
  switch (options.expected.body) {
    case "empty":
      assert.equal(await options.response.text(), "", options.path);
      return;
    case "redirect":
      assert.equal(
        await options.response.text(),
        `<a href="${options.expected.redirect}">Permanent Redirect</a>.\n\n`,
        options.path,
      );
      return;
    case "root-html":
      assert.equal(
        await options.response.text(),
        readFileSync(join(options.outputDirectory, "index.html"), "utf8"),
        options.path,
      );
      return;
    case "spotify-html":
      assert.equal(
        await options.response.text(),
        readFileSync(
          join(options.outputDirectory, "spotify/index.html"),
          "utf8",
        ),
        options.path,
      );
      return;
    case "fake-html":
      assert.equal(
        await options.response.text(),
        readFileSync(join(options.outputDirectory, "fake/index.html"), "utf8"),
        options.path,
      );
      return;
    case "asset":
    case "fake-artwork":
    case "favicon":
      assert.deepEqual(
        new Uint8Array(await options.response.arrayBuffer()),
        new Uint8Array(
          readFileSync(join(options.outputDirectory, options.path)),
        ),
        options.path,
      );
      return;
  }
}

function currentAssets(outputDirectory: string): CurrentAssets {
  const manifestJson: unknown = JSON.parse(
    readFileSync(join(outputDirectory, "server-manifest.json"), "utf8"),
  );
  const parsed = parseRuntimeAssetManifest(manifestJson);

  if (parsed.kind === "failure") {
    throw new Error("Expected a valid generated runtime asset manifest.");
  }

  const spotifyWorker = parsed.value.assets.find((asset) =>
    asset.path.toString().startsWith("assets/browser/worker/entry-"),
  );
  const worker = parsed.value.assets.find((asset) =>
    asset.path.toString().startsWith("assets/browser/fake/worker-entry-"),
  );

  if (spotifyWorker === undefined || worker === undefined) {
    throw new Error("Expected both generated module worker assets.");
  }

  return {
    spotifyWorker: `/${spotifyWorker.path.toString()}`,
    worker: `/${worker.path.toString()}`,
  };
}

async function startHost(options: {
  readonly fakeProviderEnabled: boolean;
  readonly outputDirectory: string;
}): Promise<ProductionHost> {
  return startProductionHost({
    assetDirectory: options.outputDirectory,
    configPath: join(options.outputDirectory, "config.json"),
    fakeProviderEnabled: options.fakeProviderEnabled,
    hostname: "127.0.0.1",
    port: 0,
  });
}

function resolvedPath(path: BaselinePath, assets: CurrentAssets): string {
  if (path.kind === "literal") {
    return path.path;
  }

  return path.name === "spotify-worker" ? assets.spotifyWorker : assets.worker;
}

function hostUrl(host: ProductionHost, path: string): string {
  return `${host.url.origin}${path}`;
}

const permissionsPolicy =
  "accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()";
const publicConfigurationJson = JSON.stringify({
  spotify: {
    clientId: "public-client-id",
    redirectUri: "https://display.example/spotify/",
  },
});

type RawHttpResponse = {
  readonly headers: Headers;
  readonly status: number;
  text: () => Promise<string>;
};

async function rawHttpRequest(options: {
  readonly host: ProductionHost;
  readonly method: "GET" | "HEAD" | "OPTIONS" | "POST";
  readonly path: string;
}): Promise<RawHttpResponse> {
  const response = await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(new Uint8Array(Bun.concatArrayBuffers(chunks)));
    };

    void (async () => {
      try {
        await Bun.connect({
          hostname: options.host.url.hostname,
          port: Number(options.host.url.port),
          socket: {
            connectError(_socket, error) {
              reject(error);
            },
            data(socket, data) {
              chunks.push(data);
              const received = new Uint8Array(Bun.concatArrayBuffers(chunks));
              const text = new TextDecoder().decode(received);
              const separator = "\r\n\r\n";
              const separatorIndex = text.indexOf(separator);

              if (separatorIndex < 0) {
                return;
              }

              const contentLength = /^content-length:\s*(\d+)\s*$/im.exec(
                text.slice(0, separatorIndex),
              )?.[1];

              if (
                contentLength !== undefined &&
                received.byteLength >=
                  separatorIndex + separator.length + Number(contentLength)
              ) {
                socket.end();
                finish();
              }
            },
            end() {
              finish();
            },
            open(socket) {
              socket.write(
                `${options.method} ${options.path} HTTP/1.1\r\nHost: ${options.host.url.host}\r\nConnection: close\r\n\r\n`,
              );
            },
          },
        });
      } catch (error) {
        reject(error);
      }
    })();
  });
  const separator = "\r\n\r\n";
  const text = new TextDecoder().decode(response);
  const separatorIndex = text.indexOf(separator);

  if (separatorIndex < 0) {
    throw new Error(`Missing raw HTTP header separator for ${options.path}.`);
  }

  const [statusLine, ...headerLines] = text
    .slice(0, separatorIndex)
    .split("\r\n");
  const status = Number(statusLine?.split(" ")[1]);

  if (!Number.isSafeInteger(status)) {
    throw new Error(`Missing raw HTTP status for ${options.path}.`);
  }

  const headers = new Headers();

  for (const line of headerLines) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex >= 0) {
      headers.set(
        line.slice(0, separatorIndex),
        line.slice(separatorIndex + 1).trim(),
      );
    }
  }

  const body = text.slice(separatorIndex + separator.length);
  return { headers, status, text: async () => body };
}
