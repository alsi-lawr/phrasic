import { PublicFilePath, type RuntimeAssetContentType } from "./manifest.ts";

export type PublishedStaticFile = {
  readonly contentType: RuntimeAssetContentType;
  readonly path: PublicFilePath;
};

const publishedFileDefinitions = [
  { contentType: "image/svg+xml", path: "fake-artwork.svg" },
  { contentType: "image/svg+xml", path: "favicon.svg" },
  { contentType: "font/woff", path: "fonts/GeistVF.woff" },
  { contentType: "image/svg+xml", path: "spotify-full-logo-white.svg" },
] as const satisfies ReadonlyArray<{
  readonly contentType: RuntimeAssetContentType;
  readonly path: string;
}>;

export type PublishedStaticFilePath =
  (typeof publishedFileDefinitions)[number]["path"];

export const publicRuntimeFiles: ReadonlyArray<PublishedStaticFile> =
  publishedFileDefinitions.map((definition) => ({
    contentType: definition.contentType,
    path: requiredPublicFilePath(definition.path),
  }));

function requiredPublicFilePath(
  value: PublishedStaticFilePath,
): PublicFilePath {
  const parsed = PublicFilePath.parse(value);

  if (parsed.kind === "failure") {
    throw new Error(`Invalid declared public file path: ${value}`);
  }

  return parsed.value;
}
