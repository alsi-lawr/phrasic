export const runtimeAssetContentTypes = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  woff: "font/woff",
} as const;

export type RuntimeAssetContentType =
  (typeof runtimeAssetContentTypes)[keyof typeof runtimeAssetContentTypes];

export class HostedFilePath {
  readonly #value: string;

  protected constructor(value: string) {
    this.#value = value;
  }

  toString(): string {
    return this.#value;
  }
}

type RuntimeAssetPathParseResult =
  | { readonly kind: "success"; readonly value: RuntimeAssetPath }
  | { readonly kind: "failure" };

export class RuntimeAssetPath extends HostedFilePath {
  private constructor(value: string) {
    super(value);
  }

  static parse(value: string): RuntimeAssetPathParseResult {
    return isSafeAssetPath(value)
      ? { kind: "success", value: new RuntimeAssetPath(value) }
      : { kind: "failure" };
  }
}

type PublicFilePathParseResult =
  | { readonly kind: "success"; readonly value: PublicFilePath }
  | { readonly kind: "failure" };

export class PublicFilePath extends HostedFilePath {
  private constructor(value: string) {
    super(value);
  }

  static parse(value: string): PublicFilePathParseResult {
    return isSafePublicFilePath(value)
      ? { kind: "success", value: new PublicFilePath(value) }
      : { kind: "failure" };
  }
}

export type RuntimeAsset = {
  readonly contentType: RuntimeAssetContentType;
  readonly path: RuntimeAssetPath;
};

export type RuntimeAssetManifest = {
  readonly assets: ReadonlyArray<RuntimeAsset>;
  readonly version: 1;
};

type RuntimeAssetManifestParseResult =
  | { readonly kind: "success"; readonly value: RuntimeAssetManifest }
  | { readonly kind: "failure" };

export function createRuntimeAssetManifest(
  paths: ReadonlyArray<string>,
): RuntimeAssetManifest {
  const assets: RuntimeAsset[] = [];

  for (const value of [...paths].sort()) {
    const asset = runtimeAsset(value);

    if (asset.kind === "failure") {
      throw new Error(`Unsupported generated runtime asset: ${value}`);
    }

    assets.push(asset.value);
  }

  return { assets, version: 1 };
}

export function serializeRuntimeAssetManifest(
  manifest: RuntimeAssetManifest,
): string {
  return `${JSON.stringify(
    {
      assets: manifest.assets.map((asset) => ({
        contentType: asset.contentType,
        path: asset.path.toString(),
      })),
      version: manifest.version,
    },
    undefined,
    2,
  )}\n`;
}

export function parseRuntimeAssetManifest(
  input: unknown,
): RuntimeAssetManifestParseResult {
  if (!isExactObject(input, ["assets", "version"])) {
    return { kind: "failure" };
  }

  const version = ownDataValue(input, "version");
  const candidates = ownDataValue(input, "assets");

  if (version !== 1 || !Array.isArray(candidates)) {
    return { kind: "failure" };
  }

  const assets: RuntimeAsset[] = [];
  const paths = new Set<string>();

  for (const candidate of candidates) {
    if (!isExactObject(candidate, ["contentType", "path"])) {
      return { kind: "failure" };
    }

    const value = ownDataValue(candidate, "path");
    const contentType = ownDataValue(candidate, "contentType");
    const parsed = typeof value === "string" ? runtimeAsset(value) : failure();

    if (
      parsed.kind === "failure" ||
      parsed.value.contentType !== contentType ||
      paths.has(parsed.value.path.toString())
    ) {
      return { kind: "failure" };
    }

    paths.add(parsed.value.path.toString());
    assets.push(parsed.value);
  }

  return { kind: "success", value: { assets, version: 1 } };
}

function runtimeAsset(
  value: string,
):
  | { readonly kind: "success"; readonly value: RuntimeAsset }
  | { readonly kind: "failure" } {
  const path = RuntimeAssetPath.parse(value);
  const extension = value.split(".").at(-1)?.toLowerCase();
  const contentType =
    extension === undefined ? undefined : runtimeAssetContentType(extension);

  return path.kind === "failure" || contentType === undefined
    ? failure()
    : { kind: "success", value: { contentType, path: path.value } };
}

function runtimeAssetContentType(
  extension: string,
): RuntimeAssetContentType | undefined {
  switch (extension) {
    case "css":
      return runtimeAssetContentTypes.css;
    case "js":
      return runtimeAssetContentTypes.js;
    case "svg":
      return runtimeAssetContentTypes.svg;
    case "woff":
      return runtimeAssetContentTypes.woff;
    default:
      return undefined;
  }
}

function isSafeAssetPath(value: string): boolean {
  return /^assets\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
    value,
  );
}

function isSafePublicFilePath(value: string): boolean {
  return /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
    value,
  );
}

function failure(): { readonly kind: "failure" } {
  return { kind: "failure" };
}

function isExactObject(
  input: unknown,
  fields: ReadonlyArray<string>,
): input is object {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }

  const keys = Object.getOwnPropertyNames(input);

  if (
    keys.length !== fields.length ||
    Object.getOwnPropertySymbols(input).length > 0
  ) {
    return false;
  }

  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function ownDataValue(input: object, field: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, field);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}
