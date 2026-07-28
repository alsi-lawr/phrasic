import { basename } from "node:path";
import { grpcWebStatus, translateGrpcWeb } from "./grpc-web.ts";
import {
  localNativeMethods,
  type LocalNativeClient,
  type LocalNativeMethod,
} from "./native-client.ts";
import { createPairingAuthority, type PairingAuthority } from "./pairing.ts";

export type EmbeddedLocalWorker = {
  readonly embeddedPath: string;
  readonly publicPath: string;
};

export type LocalHost = {
  readonly pairingUrl: URL;
  readonly revokeSessions: () => void;
  readonly stop: () => Promise<void>;
};

export type LocalHostConfiguration = {
  readonly browserPort: number;
  readonly localPage: Bun.HTMLBundle;
  readonly nativeClient: LocalNativeClient;
  readonly pairingAuthority?: PairingAuthority;
  readonly worker: EmbeddedLocalWorker;
};

type StaticLocalAsset = {
  readonly bodyPath: string;
  readonly contentType: string;
  readonly etag: string;
  readonly kind: "asset" | "html" | "worker";
  readonly publicPath: string;
};

const localContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "style-src-attr 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join("; ");
const maximumRequestBodyBytes = 64 * 1_024;
const maximumPairingBodyBytes = 128;
const maximumConcurrentRpcRequests = 8;

export async function startLocalHost(
  configuration: LocalHostConfiguration,
): Promise<LocalHost> {
  const origin = `http://127.0.0.1:${configuration.browserPort}`;
  const expectedHost = `127.0.0.1:${configuration.browserPort}`;
  const pairing = configuration.pairingAuthority ?? createPairingAuthority();
  const assets = prepareAssets(configuration.localPage, configuration.worker);
  let activeRpcRequests = 0;
  let stopping = false;

  const server = Bun.serve({
    fetch: async (request): Promise<Response> => {
      if (request.headers.get("host") !== expectedHost) {
        return securedResponse(
          "Misdirected Request",
          421,
          "text/plain; charset=utf-8",
        );
      }
      const url = new URL(request.url);
      if (url.search.length > 0) {
        return securedResponse("Not Found", 404, "text/plain; charset=utf-8");
      }
      if (request.method === "GET") {
        return staticAssetResponse(url.pathname, assets);
      }
      if (
        request.method !== "POST" ||
        request.headers.get("origin") !== origin
      ) {
        return securedResponse(
          "Forbidden",
          403,
          "text/plain; charset=utf-8",
          true,
        );
      }
      if (url.pathname === "/local/pair") {
        return redeemPairing(request, pairing);
      }
      const method = nativeMethod(url.pathname);
      if (method === undefined) {
        return securedResponse(
          "Not Found",
          404,
          "text/plain; charset=utf-8",
          true,
        );
      }
      if (!pairing.authenticate(request.headers.get("cookie"))) {
        return secureGrpcWebResponse(grpcWebStatus(16));
      }
      if (
        request.headers.get("content-type") !== "application/grpc-web+proto"
      ) {
        return secureGrpcWebResponse(grpcWebStatus(3));
      }
      if (activeRpcRequests >= maximumConcurrentRpcRequests) {
        return secureGrpcWebResponse(grpcWebStatus(8));
      }

      activeRpcRequests += 1;
      try {
        return secureGrpcWebResponse(
          await translateGrpcWeb(request, method, configuration.nativeClient),
        );
      } finally {
        activeRpcRequests -= 1;
      }
    },
    hostname: "127.0.0.1",
    maxRequestBodySize: maximumRequestBodyBytes,
    port: configuration.browserPort,
  });

  return {
    pairingUrl: new URL(
      `/local/#${pairing.capabilityFragment()}`,
      `${origin}/`,
    ),
    revokeSessions(): void {
      pairing.revoke();
    },
    async stop(): Promise<void> {
      if (stopping) {
        return;
      }
      stopping = true;
      pairing.revoke();
      configuration.nativeClient.close();
      await server.stop();
    },
  };
}

function prepareAssets(
  localPage: Bun.HTMLBundle,
  worker: EmbeddedLocalWorker,
): ReadonlyMap<string, StaticLocalAsset> {
  const files = localPage.files ?? [];
  const html = files.find((file): boolean => file.path === localPage.index);
  if (html === undefined) {
    throw new Error("The Local HTML entry is absent from its bundle.");
  }

  const assets = new Map<string, StaticLocalAsset>();
  assets.set("/local/", {
    bodyPath: html.path,
    contentType: html.headers["content-type"],
    etag: html.headers.etag,
    kind: "html",
    publicPath: "/local/",
  });
  for (const file of files) {
    if (file.path === localPage.index) {
      continue;
    }
    const publicPath = `/${basename(file.path)}`;
    assets.set(publicPath, {
      bodyPath: file.path,
      contentType: file.headers["content-type"],
      etag: file.headers.etag,
      kind: "asset",
      publicPath,
    });
  }
  assets.set(worker.publicPath, {
    bodyPath: worker.embeddedPath,
    contentType: "text/javascript; charset=utf-8",
    etag: worker.publicPath,
    kind: "worker",
    publicPath: worker.publicPath,
  });
  return assets;
}

function staticAssetResponse(
  path: string,
  assets: ReadonlyMap<string, StaticLocalAsset>,
): Response {
  const asset = assets.get(path);
  if (asset === undefined) {
    return securedResponse("Not Found", 404, "text/plain; charset=utf-8");
  }
  const headers = securityHeaders();
  headers.set(
    "cache-control",
    asset.kind === "html" ? "no-cache" : "public, max-age=31536000, immutable",
  );
  headers.set("content-type", asset.contentType);
  headers.set("etag", asset.etag);
  return new Response(Bun.file(asset.bodyPath), { headers });
}

async function redeemPairing(
  request: Request,
  pairing: PairingAuthority,
): Promise<Response> {
  if (request.headers.get("content-type") !== "text/plain;charset=UTF-8") {
    return securedResponse("Forbidden", 403, "text/plain; charset=utf-8", true);
  }
  const capability = await request.text();
  if (
    new TextEncoder().encode(capability).byteLength > maximumPairingBodyBytes
  ) {
    return securedResponse("Forbidden", 403, "text/plain; charset=utf-8", true);
  }
  const result = pairing.redeem(capability);
  if (result.kind === "rejected") {
    return securedResponse("Forbidden", 403, "text/plain; charset=utf-8", true);
  }

  const response = securedResponse(
    null,
    204,
    "text/plain; charset=utf-8",
    true,
  );
  response.headers.set("set-cookie", result.setCookie);
  return response;
}

function nativeMethod(path: string): LocalNativeMethod | undefined {
  switch (path) {
    case "/phrasic.local.v1.LocalMedia/GetInstanceInfo":
      return localNativeMethods.getInstanceInfo;
    case "/phrasic.local.v1.LocalMedia/GetSnapshot":
      return localNativeMethods.getSnapshot;
    default:
      return undefined;
  }
}

function securedResponse(
  body: BodyInit | null,
  status: number,
  contentType: string,
  noStore = false,
): Response {
  const headers = securityHeaders();
  headers.set("content-type", contentType);
  if (noStore) {
    headers.set("cache-control", "no-store");
  }
  return new Response(body, { headers, status });
}

function secureGrpcWebResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  addSecurityHeaders(headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, {
    headers,
    status: response.status,
  });
}

function securityHeaders(): Headers {
  const headers = new Headers();
  addSecurityHeaders(headers);
  return headers;
}

function addSecurityHeaders(headers: Headers): void {
  headers.set("content-security-policy", localContentSecurityPolicy);
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
}
