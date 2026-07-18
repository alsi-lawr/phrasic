import * as grpc from "@grpc/grpc-js";
import { extname, resolve, sep } from "node:path";

import { ProbeRequest, ProbeResponse } from "../generated/spike_pb.js";
import { outwardStatusCode, type DeadlineValidity } from "./deadline-status";

const methodPath = "/phrasic.spike.v1.Interop/Probe";

type NativeEndpoint =
  | {
      readonly endpoint: string;
      readonly grpcTarget: string;
      readonly kind: "linux-uds";
    }
  | {
      readonly endpoint: string;
      readonly grpcTarget: string;
      readonly kind: "windows-named-pipe";
    };

type NativeResponseState =
  | { readonly kind: "error"; readonly error: grpc.ServiceError }
  | { readonly kind: "pending" }
  | { readonly kind: "response"; readonly response: ProbeResponse };

type NativeStatusState =
  | { readonly kind: "pending" }
  | { readonly kind: "received"; readonly status: grpc.StatusObject };

type NativeResult = {
  readonly initialMetadata: grpc.Metadata;
  readonly response: NativeResponseState;
  readonly status: grpc.StatusObject;
};

type ParsedDeadline = {
  readonly callOptions: grpc.CallOptions;
  readonly validity: DeadlineValidity;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const parseBrowserPort = (): number => {
  const parsed = Number(requiredEnvironment("SPIKE_BROWSER_PORT"));
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    throw new Error("SPIKE_BROWSER_PORT is invalid");
  }
  return parsed;
};

const parseNativeEndpoint = (): NativeEndpoint => {
  const endpoint = requiredEnvironment("SPIKE_NATIVE_ENDPOINT");
  const transport = requiredEnvironment("SPIKE_NATIVE_TRANSPORT");
  if (endpoint.includes("\0")) {
    throw new Error("Native endpoint contains NUL");
  }
  switch (transport) {
    case "linux-uds":
      if (!endpoint.startsWith("/")) {
        throw new Error("Linux UDS endpoint must be absolute");
      }
      return { endpoint, grpcTarget: `unix:${endpoint}`, kind: transport };
    case "windows-named-pipe":
      if (!endpoint.startsWith("\\\\.\\pipe\\")) {
        throw new Error("Windows named-pipe endpoint is invalid");
      }
      return { endpoint, grpcTarget: `unix:${endpoint}`, kind: transport };
    default:
      throw new Error("SPIKE_NATIVE_TRANSPORT is invalid");
  }
};

const serializeRequest = (request: ProbeRequest): Buffer =>
  Buffer.from(request.serializeBinary());

const deserializeResponse = (bytes: Buffer): ProbeResponse =>
  ProbeResponse.deserializeBinary(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );

const parseDeadline = (request: Request): ParsedDeadline => {
  const header = request.headers.get("grpc-timeout");
  if (header === null) {
    return { callOptions: {}, validity: "not-valid" };
  }
  const match = /^(\d{1,8})m$/.exec(header);
  const milliseconds = match?.[1] === undefined ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    return { callOptions: {}, validity: "not-valid" };
  }
  return {
    callOptions: { deadline: Date.now() + milliseconds },
    validity: "valid",
  };
};

const invokeNative = (
  client: grpc.Client,
  request: ProbeRequest,
  callOptions: grpc.CallOptions,
  signal: AbortSignal,
): Promise<NativeResult> =>
  new Promise((resolveResult, reject) => {
    let initialMetadata = new grpc.Metadata();
    let response: NativeResponseState = { kind: "pending" };
    let status: NativeStatusState = { kind: "pending" };
    const timeout = setTimeout(
      (): void => reject(new Error("Native gRPC call did not settle")),
      15_000,
    );

    const complete = (): void => {
      if (response.kind === "pending" || status.kind === "pending") {
        return;
      }
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolveResult({ initialMetadata, response, status: status.status });
    };

    const call = client.makeUnaryRequest<ProbeRequest, ProbeResponse>(
      methodPath,
      serializeRequest,
      deserializeResponse,
      request,
      new grpc.Metadata(),
      callOptions,
      (error: grpc.ServiceError | null, value?: ProbeResponse): void => {
        if (error !== null) {
          response = { error, kind: "error" };
        } else if (value !== undefined) {
          response = { kind: "response", response: value };
        } else {
          response = {
            error: Object.assign(new Error("Native response was absent"), {
              code: grpc.status.INTERNAL,
              details: "Native response was absent",
              metadata: new grpc.Metadata(),
            }),
            kind: "error",
          };
        }
        complete();
      },
    );
    const cancel = (): void => call.cancel();

    call.on("metadata", (metadata: grpc.Metadata): void => {
      initialMetadata = metadata;
    });
    call.on("status", (receivedStatus: grpc.StatusObject): void => {
      status = { kind: "received", status: receivedStatus };
      complete();
    });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) {
      cancel();
    }
  });

const decodeGrpcWebRequest = (body: Uint8Array): ProbeRequest => {
  if (body.byteLength < 5 || body[0] !== 0) {
    throw new Error("Expected one uncompressed gRPC-Web data frame");
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const payloadLength = view.getUint32(1, false);
  if (payloadLength !== body.byteLength - 5) {
    throw new Error("gRPC-Web data frame length mismatch");
  }
  return ProbeRequest.deserializeBinary(body.subarray(5));
};

const frame = (flag: number, payload: Uint8Array): Uint8Array => {
  const output = new Uint8Array(payload.byteLength + 5);
  output[0] = flag;
  new DataView(output.buffer).setUint32(1, payload.byteLength, false);
  output.set(payload, 5);
  return output;
};

const bodyBytes = (value: Uint8Array): ArrayBuffer => {
  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);
  return bytes.buffer;
};

const metadataValue = (
  metadata: grpc.Metadata,
  key: string,
): string | undefined => {
  const value = metadata.get(key)[0];
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Buffer) {
    return value.toString("utf8");
  }
  return undefined;
};

const grpcWebResponse = (
  result: NativeResult,
  deadlineValidity: DeadlineValidity,
): Response => {
  const statusCode = outwardStatusCode(deadlineValidity, {
    code: result.status.code,
    detail: result.status.details,
  });
  const statusMessage = encodeURIComponent(result.status.details);
  const trailer = metadataValue(result.status.metadata, "x-spike-trailer");
  const trailerLines = [
    `grpc-status: ${statusCode}`,
    `grpc-message: ${statusMessage}`,
    ...(trailer === undefined ? [] : [`x-spike-trailer: ${trailer}`]),
    "",
  ].join("\r\n");
  const trailerFrame = frame(0x80, new TextEncoder().encode(trailerLines));
  const body =
    result.status.code === grpc.status.OK && result.response.kind === "response"
      ? new Blob([
          bodyBytes(frame(0, result.response.response.serializeBinary())),
          bodyBytes(trailerFrame),
        ])
      : bodyBytes(trailerFrame);
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/grpc-web+proto",
    "x-content-type-options": "nosniff",
  });
  const transport = metadataValue(
    result.initialMetadata,
    "x-spike-native-transport",
  );
  if (transport !== undefined) {
    headers.set("x-spike-native-transport", transport);
  }
  return new Response(body, { headers, status: 200 });
};

const contentType = (path: string): string => {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
};

const staticResponse = async (
  browserRoot: string,
  requestUrl: URL,
): Promise<Response> => {
  const relative =
    requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  if (
    relative.includes("..") ||
    relative.includes("\\") ||
    relative.includes("\0")
  ) {
    return new Response("Not Found", { status: 404 });
  }
  const root = resolve(browserRoot);
  const path = resolve(root, relative);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    return new Response("Not Found", { status: 404 });
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(file, {
    headers: {
      "cache-control": "no-store",
      "content-type": contentType(path),
      "x-content-type-options": "nosniff",
    },
  });
};

const browserPort = parseBrowserPort();
const nativeEndpoint = parseNativeEndpoint();
const browserRoot = requiredEnvironment("SPIKE_BROWSER_ROOT");
const nativeClient = new grpc.Client(
  nativeEndpoint.grpcTarget,
  grpc.credentials.createInsecure(),
);

const server = Bun.serve({
  fetch: async (request: Request, currentServer): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === methodPath) {
      try {
        const body = new Uint8Array(await request.arrayBuffer());
        const nativeRequest = decodeGrpcWebRequest(body);
        const deadline = parseDeadline(request);
        const nativeResult = await invokeNative(
          nativeClient,
          nativeRequest,
          deadline.callOptions,
          request.signal,
        );
        return grpcWebResponse(nativeResult, deadline.validity);
      } catch (caught: unknown) {
        const error =
          caught instanceof Error
            ? caught
            : new Error("Unknown terminator failure");
        return new Response(error.message, { status: 400 });
      }
    }
    if (request.method === "POST" && url.pathname === "/__shutdown") {
      setTimeout((): void => {
        nativeClient.close();
        void currentServer.stop().then((): void => process.exit(0));
      }, 0);
      return new Response(null, { status: 202 });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    return staticResponse(browserRoot, url);
  },
  hostname: "127.0.0.1",
  port: browserPort,
});

console.log(
  `READY browser=127.0.0.1:${server.port} native=${nativeEndpoint.kind}`,
);
