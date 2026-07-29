import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  GetSnapshotRequest,
  GetSnapshotResponse,
} from "../../apps/web/src/browser/generated/phrasic/local/v1/local_media_pb.js";
import { translateGrpcWeb } from "../../apps/host/src/local/grpc-web.ts";
import {
  localNativeMethods,
  type LocalNativeClient,
} from "../../apps/host/src/local/native-client.ts";

test("the Local gateway translates one generated binary gRPC-Web call to native gRPC", async () => {
  const expectedInstanceId = new Uint8Array(16).fill(4);
  const generatedRequest = new GetSnapshotRequest();
  generatedRequest.setExpectedInstanceId(expectedInstanceId);
  const generatedResponse = new GetSnapshotResponse();
  generatedResponse.setInstanceId(expectedInstanceId);
  generatedResponse.setRevision(9);

  const nativeClient: LocalNativeClient = {
    close(): void {},
    invoke(method, payload): Promise<Uint8Array> {
      assert.equal(method, localNativeMethods.getSnapshot);
      const decoded = GetSnapshotRequest.deserializeBinary(payload);
      assert.deepEqual(
        decoded.getExpectedInstanceId_asU8(),
        expectedInstanceId,
      );
      return Promise.resolve(generatedResponse.serializeBinary());
    },
    proveReadiness(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
  const request = new Request(
    "http://127.0.0.1:43123/phrasic.local.v1.LocalMedia/GetSnapshot",
    {
      body: bodyBuffer(unaryFrame(generatedRequest.serializeBinary())),
      headers: { "content-type": "application/grpc-web+proto" },
      method: "POST",
    },
  );

  const response = await translateGrpcWeb(
    request,
    localNativeMethods.getSnapshot,
    nativeClient,
  );
  const frames = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/grpc-web+proto",
  );
  assert.equal(frames[0], 0);
  const payloadLength = new DataView(
    frames.buffer,
    frames.byteOffset,
    frames.byteLength,
  ).getUint32(1, false);
  const decoded = GetSnapshotResponse.deserializeBinary(
    frames.subarray(5, 5 + payloadLength),
  );
  assert.equal(decoded.getRevision(), 9);
  assert.equal(frames[5 + payloadLength], 0x80);
  assert.match(new TextDecoder().decode(frames), /grpc-status: 0/);
});

test("the Local gateway does not impose an artwork-sized response ceiling", async () => {
  const payload = new Uint8Array(3 * 1_024 * 1_024);
  const nativeClient: LocalNativeClient = {
    close(): void {},
    invoke(): Promise<Uint8Array> {
      return Promise.resolve(payload);
    },
    proveReadiness(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
  const request = new Request(
    "http://127.0.0.1:43123/phrasic.local.v1.LocalMedia/GetSnapshot",
    {
      body: bodyBuffer(unaryFrame(new Uint8Array())),
      headers: { "content-type": "application/grpc-web+proto" },
      method: "POST",
    },
  );

  const response = await translateGrpcWeb(
    request,
    localNativeMethods.getSnapshot,
    nativeClient,
  );
  const frames = new Uint8Array(await response.arrayBuffer());

  assert.equal(frames[0], 0);
  assert.equal(
    new DataView(frames.buffer, frames.byteOffset, frames.byteLength).getUint32(
      1,
      false,
    ),
    payload.byteLength,
  );
  assert.equal(frames[5 + payload.byteLength], 0x80);
});

function unaryFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(payload.byteLength + 5);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, payload.byteLength, false);
  frame.set(payload, 5);
  return frame;
}

function bodyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
