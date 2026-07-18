import {
  PublicFilePath,
  type HostedFilePath,
  type RuntimeAsset,
  type RuntimeAssetContentType,
} from "./manifest.ts";
import { publicRuntimeFiles } from "./published-files.ts";

type HostedContentType =
  | RuntimeAssetContentType
  | "application/json; charset=utf-8"
  | "text/html; charset=utf-8"
  | "text/plain; charset=utf-8";
type CachePolicy = keyof typeof cachePolicies;
type SecurityProfile = "fake" | "spotify";

export type ProductionRoute =
  | {
      readonly contentType: "application/json; charset=utf-8";
      readonly kind: "configuration";
      readonly securityProfile: "spotify";
    }
  | {
      readonly contentType: HostedContentType;
      readonly file: HostedFilePath;
      readonly kind: "file";
      readonly securityProfile: SecurityProfile;
    }
  | {
      readonly cache: CachePolicy;
      readonly contentType?: HostedContentType;
      readonly kind: "empty";
      readonly securityProfile: SecurityProfile;
      readonly status: 400 | 404 | 405;
    }
  | {
      readonly body: "empty" | "redirect";
      readonly htmlMetadata: boolean;
      readonly kind: "redirect";
      readonly location: "/fake/" | "/spotify/";
      readonly securityProfile: SecurityProfile;
    }
  | { readonly kind: "invalid-request" };

export const cachePolicies = {
  immutable: "public, max-age=31536000, immutable",
  noStore: "no-store, no-cache, max-age=0, must-revalidate",
  revalidate: "no-cache, max-age=0, must-revalidate",
} as const;

export const contentSecurityPolicies = {
  fake: "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; media-src 'none'; frame-src 'none'; form-action 'none'; frame-ancestors 'none'",
  spotify:
    "default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data: https://i.scdn.co; font-src 'self'; connect-src 'self' https://accounts.spotify.com https://api.spotify.com; worker-src 'self'; manifest-src 'self'; media-src 'none'; frame-src 'none'; form-action 'none'; frame-ancestors 'none'",
} as const;

const permissionsPolicy =
  "accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()";
const htmlContentType = "text/html; charset=utf-8";
const jsonContentType = "application/json; charset=utf-8";
const plainTextContentType = "text/plain; charset=utf-8";

type ClassifyProductionRequestOptions = {
  readonly assets: ReadonlyMap<string, RuntimeAsset>;
  readonly configurationAvailable: boolean;
  readonly fakeProviderEnabled: boolean;
  readonly request: Request;
};

export function classifyProductionRequest(
  options: ClassifyProductionRequestOptions,
): ProductionRoute {
  const path = normalizedPath(new URL(options.request.url));

  if (path.kind === "invalid-escape") {
    return { kind: "invalid-request" };
  }

  if (path.kind === "nul") {
    return emptySpotify(400);
  }

  const route = routeForPath({
    assets: options.assets,
    configurationAvailable: options.configurationAvailable,
    fakeProviderEnabled: options.fakeProviderEnabled,
    path: path.value,
  });

  return methodRoute(route, options.request.method);
}

export function responseHeaders(route: ProductionRoute): Headers {
  if (route.kind === "invalid-request") {
    return new Headers({ "Content-Type": plainTextContentType });
  }

  const headers = new Headers({
    "Cache-Control": cachePolicies[cachePolicyFor(route)],
    "Content-Security-Policy": contentSecurityPolicies[route.securityProfile],
    "Permissions-Policy": permissionsPolicy,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });

  const contentType = contentTypeFor(route);

  if (contentType !== undefined) {
    headers.set("Content-Type", contentType);
  }

  if (route.kind === "redirect") {
    headers.set("Location", route.location);
  }

  if (route.kind === "empty" && route.status === 405) {
    headers.set("Allow", "GET, HEAD");
  }

  return headers;
}

function routeForPath(options: {
  readonly assets: ReadonlyMap<string, RuntimeAsset>;
  readonly configurationAvailable: boolean;
  readonly fakeProviderEnabled: boolean;
  readonly path: string;
}): ProductionRoute {
  switch (options.path) {
    case "/":
    case "/index.html":
      return spotifyFile(rootIndex, htmlContentType);
    case "/spotify":
      return spotifyRedirect();
    case "/spotify/":
    case "/spotify/index.html":
      return spotifyFile(spotifyIndex, htmlContentType);
    case "/fake":
      return options.fakeProviderEnabled ? fakeRedirect() : fakeNotFound();
    case "/fake/":
    case "/fake/index.html":
      return options.fakeProviderEnabled
        ? fakeFile(fakeIndex, htmlContentType)
        : fakeNotFound();
    case "/config.json":
      return options.configurationAvailable
        ? {
            contentType: jsonContentType,
            kind: "configuration",
            securityProfile: "spotify",
          }
        : {
            cache: "noStore",
            contentType: jsonContentType,
            kind: "empty",
            securityProfile: "spotify",
            status: 404,
          };
  }

  const asset = options.assets.get(options.path.slice(1));

  if (asset !== undefined) {
    return {
      contentType: asset.contentType,
      file: asset.path,
      kind: "file",
      securityProfile: "spotify",
    };
  }

  const publicFile = publicRuntimeFiles.find(
    (candidate) => options.path === `/${candidate.path.toString()}`,
  );

  if (publicFile !== undefined) {
    return spotifyFile(publicFile.path, publicFile.contentType);
  }

  return options.path.startsWith("/assets/") && !options.path.includes("/..")
    ? {
        cache: "immutable",
        kind: "empty",
        securityProfile: "spotify",
        status: 404,
      }
    : emptySpotify(404);
}

function methodRoute(route: ProductionRoute, method: string): ProductionRoute {
  if (route.kind === "invalid-request" || route.kind === "empty") {
    return route;
  }

  if (route.kind === "redirect") {
    return {
      ...route,
      body: method === "GET" ? "redirect" : "empty",
      htmlMetadata: method === "GET" || method === "HEAD",
    };
  }

  if (method === "GET" || method === "HEAD") {
    return route;
  }

  return {
    cache: cachePolicyFor(route),
    contentType: route.kind === "configuration" ? route.contentType : undefined,
    kind: "empty",
    securityProfile: route.securityProfile,
    status: 405,
  };
}

function spotifyFile(
  file: PublicFilePath,
  contentType: HostedContentType,
): ProductionRoute {
  return { contentType, file, kind: "file", securityProfile: "spotify" };
}

function fakeFile(
  file: PublicFilePath,
  contentType: HostedContentType,
): ProductionRoute {
  return { contentType, file, kind: "file", securityProfile: "fake" };
}

function spotifyRedirect(): ProductionRoute {
  return {
    body: "empty",
    htmlMetadata: false,
    kind: "redirect",
    location: "/spotify/",
    securityProfile: "spotify",
  };
}

function fakeRedirect(): ProductionRoute {
  return {
    body: "empty",
    htmlMetadata: false,
    kind: "redirect",
    location: "/fake/",
    securityProfile: "fake",
  };
}

function fakeNotFound(): ProductionRoute {
  return {
    cache: "noStore",
    kind: "empty",
    securityProfile: "fake",
    status: 404,
  };
}

function emptySpotify(status: 400 | 404): ProductionRoute {
  return {
    cache: "revalidate",
    kind: "empty",
    securityProfile: "spotify",
    status,
  };
}

function cachePolicyFor(
  route: Exclude<ProductionRoute, { readonly kind: "invalid-request" }>,
): CachePolicy {
  switch (route.kind) {
    case "configuration":
      return "noStore";
    case "empty":
      return route.cache;
    case "file":
      if (route.file.toString().startsWith("assets/")) {
        return "immutable";
      }

      return route.file.toString() === "spotify/index.html" ||
        route.file.toString() === "fake/index.html"
        ? "noStore"
        : "revalidate";
    case "redirect":
      return "noStore";
  }
}

function contentTypeFor(route: ProductionRoute): HostedContentType | undefined {
  switch (route.kind) {
    case "configuration":
    case "file":
      return route.contentType;
    case "empty":
      return route.contentType;
    case "redirect":
      return route.htmlMetadata ? htmlContentType : undefined;
    case "invalid-request":
      return undefined;
  }
}

const fixedPublicFilePaths = {
  fakeIndex: "fake/index.html",
  rootIndex: "index.html",
  spotifyIndex: "spotify/index.html",
} as const;

const rootIndex = requiredPublicFilePath(fixedPublicFilePaths.rootIndex);
const spotifyIndex = requiredPublicFilePath(fixedPublicFilePaths.spotifyIndex);
const fakeIndex = requiredPublicFilePath(fixedPublicFilePaths.fakeIndex);

function requiredPublicFilePath(
  value: (typeof fixedPublicFilePaths)[keyof typeof fixedPublicFilePaths],
): PublicFilePath {
  const parsed = PublicFilePath.parse(value);

  if (parsed.kind === "failure") {
    throw new Error(`Invalid fixed production file path: ${value}`);
  }

  return parsed.value;
}

function normalizedPath(
  url: URL,
):
  | { readonly kind: "success"; readonly value: string }
  | { readonly kind: "invalid-escape" }
  | { readonly kind: "nul" } {
  let decoded: string;

  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return { kind: "invalid-escape" };
  }

  if (decoded.includes("\0")) {
    return { kind: "nul" };
  }

  return { kind: "success", value: decoded.replace(/\/{2,}/g, "/") };
}
