export type BaselineBodyClass =
  | "asset"
  | "empty"
  | "fake-html"
  | "fake-artwork"
  | "favicon"
  | "redirect"
  | "root-html"
  | "spotify-html";

export type BaselinePath =
  | { readonly kind: "asset"; readonly name: "spotify-worker" | "worker" }
  | { readonly kind: "literal"; readonly path: string };

export type BaselineResponse = {
  readonly body: BaselineBodyClass;
  readonly cache: "immutable" | "noStore" | "revalidate";
  readonly contentType?: string;
  readonly redirect?: "/fake/" | "/spotify/";
  readonly securityProfile: "fake" | "spotify";
  readonly status: 200 | 308 | 400 | 404;
};

export type CaddyMatrixCase = {
  readonly disabled: BaselineResponse;
  readonly enabled: BaselineResponse;
  readonly path: BaselinePath;
};

export type RawCaddyResponse = {
  readonly allow?: "GET, HEAD";
  readonly body: "bad-request" | "empty" | "fake-html" | "redirect";
  readonly cache?: "immutable" | "noStore" | "revalidate";
  readonly contentType?: string;
  readonly redirect?: "/fake/" | "/spotify/";
  readonly securityProfile?: "fake" | "spotify";
  readonly status: 200 | 308 | 400 | 404 | 405;
};

export type RawCaddyMatrixCase = {
  readonly configuration?: "available";
  readonly disabled: RawCaddyResponse;
  readonly enabled: RawCaddyResponse;
  readonly method: "GET" | "HEAD" | "OPTIONS" | "POST";
  readonly path: BaselinePath;
};

const emptySpotifyNotFound: BaselineResponse = {
  body: "empty",
  cache: "revalidate",
  securityProfile: "spotify",
  status: 404,
};

const fakeDisabledNotFound: BaselineResponse = {
  body: "empty",
  cache: "noStore",
  securityProfile: "fake",
  status: 404,
};

const rootHtml: BaselineResponse = {
  body: "root-html",
  cache: "revalidate",
  contentType: "text/html; charset=utf-8",
  securityProfile: "spotify",
  status: 200,
};

const spotifyHtml: BaselineResponse = {
  body: "spotify-html",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  securityProfile: "spotify",
  status: 200,
};

const fakeHtml: BaselineResponse = {
  body: "fake-html",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  securityProfile: "fake",
  status: 200,
};

const spotifyRedirect: BaselineResponse = {
  body: "redirect",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  redirect: "/spotify/",
  securityProfile: "spotify",
  status: 308,
};

const fakeRedirect: BaselineResponse = {
  body: "redirect",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  redirect: "/fake/",
  securityProfile: "fake",
  status: 308,
};

const malformedPath: BaselineResponse = {
  body: "empty",
  cache: "revalidate",
  securityProfile: "spotify",
  status: 400,
};

const configurationMissing: BaselineResponse = {
  body: "empty",
  cache: "noStore",
  contentType: "application/json; charset=utf-8",
  securityProfile: "spotify",
  status: 404,
};

const cachedAsset: BaselineResponse = {
  body: "asset",
  cache: "immutable",
  contentType: "text/javascript; charset=utf-8",
  securityProfile: "spotify",
  status: 200,
};

const favicon: BaselineResponse = {
  body: "favicon",
  cache: "revalidate",
  contentType: "image/svg+xml",
  securityProfile: "spotify",
  status: 200,
};

const fakeArtwork: BaselineResponse = {
  body: "fake-artwork",
  cache: "revalidate",
  contentType: "image/svg+xml",
  securityProfile: "spotify",
  status: 200,
};

// This is the executable 19-path Caddy matrix retained before T-002. D-005
// authorizes the T-001 Bun build's changed content hashes, not route/header
// semantics, so asset cases resolve their current hashed filename at runtime.
export const caddyResponseMatrix: ReadonlyArray<CaddyMatrixCase> = [
  {
    disabled: rootHtml,
    enabled: rootHtml,
    path: { kind: "literal", path: "/" },
  },
  {
    disabled: rootHtml,
    enabled: rootHtml,
    path: { kind: "literal", path: "/index.html" },
  },
  {
    disabled: spotifyRedirect,
    enabled: spotifyRedirect,
    path: { kind: "literal", path: "/spotify" },
  },
  {
    disabled: spotifyHtml,
    enabled: spotifyHtml,
    path: { kind: "literal", path: "/spotify/" },
  },
  {
    disabled: spotifyHtml,
    enabled: spotifyHtml,
    path: { kind: "literal", path: "/spotify/index.html" },
  },
  {
    disabled: fakeDisabledNotFound,
    enabled: fakeRedirect,
    path: { kind: "literal", path: "/fake" },
  },
  {
    disabled: fakeDisabledNotFound,
    enabled: fakeHtml,
    path: { kind: "literal", path: "/fake/" },
  },
  {
    disabled: fakeDisabledNotFound,
    enabled: fakeHtml,
    path: { kind: "literal", path: "/fake/index.html" },
  },
  {
    disabled: configurationMissing,
    enabled: configurationMissing,
    path: { kind: "literal", path: "/config.json" },
  },
  {
    disabled: cachedAsset,
    enabled: cachedAsset,
    path: { kind: "asset", name: "spotify-worker" },
  },
  {
    disabled: cachedAsset,
    enabled: cachedAsset,
    path: { kind: "asset", name: "worker" },
  },
  {
    disabled: favicon,
    enabled: favicon,
    path: { kind: "literal", path: "/favicon.svg" },
  },
  {
    disabled: fakeArtwork,
    enabled: fakeArtwork,
    path: { kind: "literal", path: "/fake-artwork.svg" },
  },
  {
    disabled: spotifyHtml,
    enabled: spotifyHtml,
    path: { kind: "literal", path: "//spotify//" },
  },
  {
    disabled: emptySpotifyNotFound,
    enabled: emptySpotifyNotFound,
    path: { kind: "literal", path: "/%2e%2e/Caddyfile" },
  },
  {
    disabled: rootHtml,
    enabled: rootHtml,
    path: { kind: "literal", path: "/spotify/%2e%2e/index.html" },
  },
  {
    disabled: rootHtml,
    enabled: rootHtml,
    path: { kind: "literal", path: "/assets/../index.html" },
  },
  {
    disabled: malformedPath,
    enabled: malformedPath,
    path: { kind: "literal", path: "/%00" },
  },
  {
    disabled: emptySpotifyNotFound,
    enabled: emptySpotifyNotFound,
    path: { kind: "literal", path: "/does-not-exist" },
  },
];

const rawSpotifyNotFound: RawCaddyResponse = {
  body: "empty",
  cache: "revalidate",
  securityProfile: "spotify",
  status: 404,
};

const rawFakeNotFound: RawCaddyResponse = {
  body: "empty",
  cache: "noStore",
  securityProfile: "fake",
  status: 404,
};

const rawSpotifyMethodNotAllowed: RawCaddyResponse = {
  allow: "GET, HEAD",
  body: "empty",
  cache: "revalidate",
  securityProfile: "spotify",
  status: 405,
};

const rawAssetMethodNotAllowed: RawCaddyResponse = {
  allow: "GET, HEAD",
  body: "empty",
  cache: "immutable",
  securityProfile: "spotify",
  status: 405,
};

const rawFakeMethodNotAllowed: RawCaddyResponse = {
  allow: "GET, HEAD",
  body: "empty",
  cache: "noStore",
  securityProfile: "fake",
  status: 405,
};

const rawSpotifyRedirect: RawCaddyResponse = {
  body: "redirect",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  redirect: "/spotify/",
  securityProfile: "spotify",
  status: 308,
};

const rawEmptySpotifyRedirect: RawCaddyResponse = {
  body: "empty",
  cache: "noStore",
  redirect: "/spotify/",
  securityProfile: "spotify",
  status: 308,
};

const rawEmptyFakeRedirect: RawCaddyResponse = {
  body: "empty",
  cache: "noStore",
  redirect: "/fake/",
  securityProfile: "fake",
  status: 308,
};

const rawHeadSpotifyRedirect: RawCaddyResponse = {
  body: "empty",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  redirect: "/spotify/",
  securityProfile: "spotify",
  status: 308,
};

const rawHeadFakeRedirect: RawCaddyResponse = {
  body: "empty",
  cache: "noStore",
  contentType: "text/html; charset=utf-8",
  redirect: "/fake/",
  securityProfile: "fake",
  status: 308,
};

// Raw-socket cases captured from the pre-cutover Caddy host. Fetch is not used:
// it normalizes malformed and percent-encoded request targets before dispatch.
export const rawCaddyResponseMatrix: ReadonlyArray<RawCaddyMatrixCase> = [
  {
    disabled: rawSpotifyRedirect,
    enabled: rawSpotifyRedirect,
    method: "GET",
    path: { kind: "literal", path: "/%2Fspotify" },
  },
  {
    disabled: rawHeadSpotifyRedirect,
    enabled: rawHeadSpotifyRedirect,
    method: "HEAD",
    path: { kind: "literal", path: "/spotify" },
  },
  {
    disabled: rawFakeNotFound,
    enabled: rawHeadFakeRedirect,
    method: "HEAD",
    path: { kind: "literal", path: "/fake" },
  },
  {
    disabled: rawFakeNotFound,
    enabled: {
      body: "fake-html",
      cache: "noStore",
      contentType: "text/html; charset=utf-8",
      securityProfile: "fake",
      status: 200,
    },
    method: "GET",
    path: { kind: "literal", path: "/fake%2findex.html" },
  },
  {
    disabled: rawSpotifyNotFound,
    enabled: rawSpotifyNotFound,
    method: "GET",
    path: { kind: "literal", path: "/fake%252findex.html" },
  },
  {
    disabled: rawSpotifyNotFound,
    enabled: rawSpotifyNotFound,
    method: "GET",
    path: { kind: "literal", path: "/%252Fspotify" },
  },
  {
    disabled: {
      body: "bad-request",
      contentType: "text/plain; charset=utf-8",
      status: 400,
    },
    enabled: {
      body: "bad-request",
      contentType: "text/plain; charset=utf-8",
      status: 400,
    },
    method: "GET",
    path: { kind: "literal", path: "/%zz" },
  },
  {
    disabled: {
      body: "empty",
      cache: "revalidate",
      securityProfile: "spotify",
      status: 400,
    },
    enabled: {
      body: "empty",
      cache: "revalidate",
      securityProfile: "spotify",
      status: 400,
    },
    method: "GET",
    path: { kind: "literal", path: "/%00" },
  },
  {
    disabled: rawSpotifyRedirect,
    enabled: rawSpotifyRedirect,
    method: "GET",
    path: { kind: "literal", path: "//spotify" },
  },
  {
    disabled: rawFakeNotFound,
    enabled: rawEmptyFakeRedirect,
    method: "POST",
    path: { kind: "literal", path: "/fake" },
  },
  {
    disabled: rawFakeNotFound,
    enabled: rawFakeMethodNotAllowed,
    method: "OPTIONS",
    path: { kind: "literal", path: "/fake/" },
  },
  {
    disabled: rawSpotifyNotFound,
    enabled: rawSpotifyNotFound,
    method: "OPTIONS",
    path: { kind: "literal", path: "/does-not-exist" },
  },
  {
    disabled: rawSpotifyMethodNotAllowed,
    enabled: rawSpotifyMethodNotAllowed,
    method: "POST",
    path: { kind: "literal", path: "/index.html" },
  },
  {
    disabled: rawAssetMethodNotAllowed,
    enabled: rawAssetMethodNotAllowed,
    method: "OPTIONS",
    path: { kind: "asset", name: "spotify-worker" },
  },
  {
    disabled: rawEmptySpotifyRedirect,
    enabled: rawEmptySpotifyRedirect,
    method: "POST",
    path: { kind: "literal", path: "/spotify" },
  },
  {
    configuration: "available",
    disabled: {
      allow: "GET, HEAD",
      body: "empty",
      cache: "noStore",
      contentType: "application/json; charset=utf-8",
      securityProfile: "spotify",
      status: 405,
    },
    enabled: {
      allow: "GET, HEAD",
      body: "empty",
      cache: "noStore",
      contentType: "application/json; charset=utf-8",
      securityProfile: "spotify",
      status: 405,
    },
    method: "POST",
    path: { kind: "literal", path: "/config.json" },
  },
];
