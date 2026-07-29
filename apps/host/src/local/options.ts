export type LocalHostOptions = {
  readonly browserPort: number;
  readonly expectedInstanceId: Uint8Array;
  readonly nativeEndpoint: string;
};

export type LocalHostOptionsResult =
  | { readonly kind: "success"; readonly value: LocalHostOptions }
  | { readonly kind: "failure" };

export function parseLocalHostOptions(
  arguments_: ReadonlyArray<string>,
  platform: NodeJS.Platform = process.platform,
): LocalHostOptionsResult {
  if (arguments_.length !== 6) {
    return { kind: "failure" };
  }
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (
      name === undefined ||
      value === undefined ||
      values.has(name) ||
      !allowedOptionNames.includes(name)
    ) {
      return { kind: "failure" };
    }
    values.set(name, value);
  }

  const browserPort = parseBrowserPort(values.get("--browser-port"));
  const nativeEndpoint = values.get("--native-endpoint");
  const expectedInstanceId = parseInstanceId(
    values.get("--expected-instance-id"),
  );
  if (
    browserPort === undefined ||
    nativeEndpoint === undefined ||
    expectedInstanceId === undefined ||
    !validNativeEndpoint(nativeEndpoint, platform)
  ) {
    return { kind: "failure" };
  }

  return {
    kind: "success",
    value: Object.freeze({
      browserPort,
      expectedInstanceId,
      nativeEndpoint,
    }),
  };
}

const allowedOptionNames: ReadonlyArray<string> = [
  "--browser-port",
  "--expected-instance-id",
  "--native-endpoint",
];

function parseBrowserPort(input: string | undefined): number | undefined {
  if (input === undefined || !/^\d+$/.test(input)) {
    return undefined;
  }
  const port = Number(input);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65_535
    ? port
    : undefined;
}

function parseInstanceId(input: string | undefined): Uint8Array | undefined {
  if (input === undefined || !/^[a-f0-9]{32}$/.test(input)) {
    return undefined;
  }
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    const pair = input.slice(index * 2, index * 2 + 2);
    const value = Number.parseInt(pair, 16);
    if (!Number.isInteger(value)) {
      return undefined;
    }
    bytes[index] = value;
  }
  return bytes;
}

function validNativeEndpoint(
  endpoint: string,
  platform: NodeJS.Platform,
): boolean {
  if (endpoint.includes("\0")) {
    return false;
  }
  if (platform === "linux") {
    return endpoint.startsWith("/");
  }
  if (platform === "win32") {
    return endpoint.startsWith("\\\\.\\pipe\\LOCAL\\phrasic-local-v1-");
  }
  return false;
}
