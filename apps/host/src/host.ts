import {
  parseRuntimeAssetManifest,
  type HostedFilePath,
  type RuntimeAsset,
} from "./manifest.ts";
import {
  classifyProductionRequest,
  responseHeaders,
  type ProductionRoute,
} from "./response-policy.ts";

export type ProductionHost = {
  readonly url: URL;
  stop: () => Promise<void>;
};

export type StartProductionHostOptions = {
  readonly assetDirectory: string;
  readonly configPath: string;
  readonly fakeProviderEnabled: boolean;
  readonly hostname: string;
  readonly port: number;
};

type PublicConfigurationResult =
  | { readonly kind: "available"; readonly text: string }
  | { readonly kind: "missing" };

export async function startProductionHost(
  options: StartProductionHostOptions,
): Promise<ProductionHost> {
  const assets = await runtimeAssets(options.assetDirectory);
  const server = Bun.serve({
    fetch: async (request): Promise<Response> =>
      responseForRequest({ assets, options, request }),
    hostname: options.hostname,
    port: options.port,
  });
  let stopped = false;

  return {
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }

      stopped = true;
      await server.stop(true);
    },
    url: server.url,
  };
}

async function responseForRequest(options: {
  readonly assets: ReadonlyMap<string, RuntimeAsset>;
  readonly options: StartProductionHostOptions;
  readonly request: Request;
}): Promise<Response> {
  const configuration = await publicConfiguration(options.options.configPath);
  const route = classifyProductionRequest({
    assets: options.assets,
    configurationAvailable: configuration.kind === "available",
    fakeProviderEnabled: options.options.fakeProviderEnabled,
    request: options.request,
  });
  const headers = responseHeaders(route);
  const isHeadRequest = options.request.method === "HEAD";

  switch (route.kind) {
    case "configuration":
      if (configuration.kind !== "available") {
        throw new Error("A missing configuration cannot have a file route.");
      }

      return new Response(isHeadRequest ? null : configuration.text, {
        headers,
        status: 200,
      });
    case "file":
      return new Response(
        isHeadRequest
          ? null
          : Bun.file(
              hostedFilePath(options.options.assetDirectory, route.file),
            ),
        { headers, status: 200 },
      );
    case "empty":
      return new Response(null, { headers, status: route.status });
    case "redirect":
      return new Response(
        isHeadRequest || route.body === "empty" ? null : redirectBody(route),
        {
          headers,
          status: 308,
        },
      );
    case "invalid-request":
      return new Response("400 Bad Request", {
        headers,
        status: 400,
      });
  }
}

async function runtimeAssets(
  assetDirectory: string,
): Promise<ReadonlyMap<string, RuntimeAsset>> {
  const manifestFile = Bun.file(
    runtimeFilePath(assetDirectory, "server-manifest.json"),
  );
  const manifestText = await manifestFile.text();
  const manifestJson: unknown = JSON.parse(manifestText);
  const parsed = parseRuntimeAssetManifest(manifestJson);

  if (parsed.kind === "failure") {
    throw new Error("The production asset manifest is invalid.");
  }

  return new Map(
    parsed.value.assets.map((asset) => [asset.path.toString(), asset]),
  );
}

async function publicConfiguration(
  configPath: string,
): Promise<PublicConfigurationResult> {
  const config = Bun.file(configPath);

  if (!(await config.exists())) {
    return { kind: "missing" };
  }

  const text = await config.text();

  try {
    const parsed: unknown = JSON.parse(text);
    return isPublicConfiguration(parsed)
      ? { kind: "available", text }
      : { kind: "missing" };
  } catch {
    return { kind: "missing" };
  }
}

function isPublicConfiguration(input: unknown): boolean {
  if (!isExactObject(input, ["spotify"])) {
    return false;
  }

  const spotify = ownDataValue(input, "spotify");

  if (!isExactObject(spotify, ["clientId", "redirectUri"])) {
    return false;
  }

  return (
    isNonEmptyString(ownDataValue(spotify, "clientId")) &&
    isNonEmptyString(ownDataValue(spotify, "redirectUri"))
  );
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

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function redirectBody(
  route: Extract<ProductionRoute, { readonly kind: "redirect" }>,
): string {
  return `<a href="${route.location}">Permanent Redirect</a>.\n\n`;
}

function hostedFilePath(directory: string, file: HostedFilePath): string {
  return `${directory.replace(/\/$/, "")}/${file.toString()}`;
}

function runtimeFilePath(directory: string, file: string): string {
  return `${directory.replace(/\/$/, "")}/${file}`;
}
