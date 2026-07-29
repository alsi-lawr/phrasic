import {
  isNativeClientFailure,
  type LocalNativeClient,
  type LocalNativeMethod,
} from "./native-client.ts";

const maximumGrpcWebRequestBytes = 64 * 1_024;

export async function translateGrpcWeb(
  request: Request,
  method: LocalNativeMethod,
  nativeClient: LocalNativeClient,
): Promise<Response> {
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    const payload = decodeUnaryDataFrame(body);
    const response = await nativeClient.invoke(method, payload, request.signal);
    return grpcWebSuccess(response);
  } catch (caught: unknown) {
    return isNativeClientFailure(caught)
      ? grpcWebStatus(redactedStatus(caught.code))
      : grpcWebStatus(3);
  }
}

export function grpcWebStatus(code: number): Response {
  return grpcWebResponse([], code);
}

function grpcWebSuccess(payload: Uint8Array): Response {
  return grpcWebResponse([frame(0, payload)], 0);
}

function grpcWebResponse(
  dataFrames: ReadonlyArray<Uint8Array>,
  status: number,
): Response {
  const trailer = frame(
    0x80,
    new TextEncoder().encode(
      `grpc-status: ${status}\r\ngrpc-message: ${statusMessage(status)}\r\n`,
    ),
  );
  const parts = [...dataFrames, trailer].map(bodyBuffer);
  return new Response(new Blob(parts), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/grpc-web+proto",
      "x-content-type-options": "nosniff",
    },
    status: 200,
  });
}

function decodeUnaryDataFrame(body: Uint8Array): Uint8Array {
  if (
    body.byteLength < 5 ||
    body.byteLength > maximumGrpcWebRequestBytes ||
    body[0] !== 0
  ) {
    throw new Error("Invalid gRPC-Web request framing.");
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const payloadLength = view.getUint32(1, false);
  if (payloadLength !== body.byteLength - 5) {
    throw new Error("Invalid gRPC-Web request length.");
  }
  return body.subarray(5);
}

function frame(flag: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(payload.byteLength + 5);
  output[0] = flag;
  new DataView(output.buffer).setUint32(1, payload.byteLength, false);
  output.set(payload, 5);
  return output;
}

function bodyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function redactedStatus(code: number): number {
  return Number.isInteger(code) && code >= 0 && code <= 16 ? code : 13;
}

function statusMessage(code: number): string {
  return code === 0 ? "" : "Local%20playback%20unavailable";
}
