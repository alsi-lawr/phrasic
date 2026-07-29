import type { ClientReadableStream, Metadata, RpcError } from "grpc-web";
import { LocalMediaClient } from "../generated/phrasic/local/v1/local_media_grpc_web_pb.js";
import {
  GetInstanceInfoRequest,
  GetSnapshotRequest,
  type GetInstanceInfoResponse,
  type GetSnapshotResponse,
} from "../generated/phrasic/local/v1/local_media_pb.js";

export type LocalGeneratedClient = {
  readonly getInstanceId: (signal: AbortSignal) => Promise<Uint8Array>;
  readonly getSnapshot: (
    instanceId: Uint8Array,
    signal: AbortSignal,
  ) => Promise<GetSnapshotResponse>;
};

export function createLocalGeneratedClient(
  origin: string,
): LocalGeneratedClient {
  const client = new LocalMediaClient(origin, null, { withCredentials: true });

  return {
    async getInstanceId(signal: AbortSignal): Promise<Uint8Array> {
      const response = await instanceInfoCall(
        client,
        new GetInstanceInfoRequest(),
        signal,
      );
      return response.getInstanceId_asU8();
    },

    getSnapshot(
      instanceId: Uint8Array,
      signal: AbortSignal,
    ): Promise<GetSnapshotResponse> {
      const request = new GetSnapshotRequest();
      request.setExpectedInstanceId(instanceId);
      return snapshotCall(client, request, signal);
    },
  };
}

function instanceInfoCall(
  client: LocalMediaClient,
  request: GetInstanceInfoRequest,
  signal: AbortSignal,
): Promise<GetInstanceInfoResponse> {
  return unaryCall(signal, (complete) =>
    client.getInstanceInfo(request, deadlineMetadata(), complete),
  );
}

function snapshotCall(
  client: LocalMediaClient,
  request: GetSnapshotRequest,
  signal: AbortSignal,
): Promise<GetSnapshotResponse> {
  return unaryCall(signal, (complete) =>
    client.getSnapshot(request, deadlineMetadata(), complete),
  );
}

function unaryCall<ResponseType>(
  signal: AbortSignal,
  begin: (
    complete: (error: RpcError, response: ResponseType) => void,
  ) => ClientReadableStream<ResponseType>,
): Promise<ResponseType> {
  return new Promise((resolve, reject) => {
    let stream: ClientReadableStream<ResponseType>;
    const abort = (): void => {
      stream.cancel();
      reject(abortError());
    };

    stream = begin((error, response): void => {
      signal.removeEventListener("abort", abort);
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(response);
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

function deadlineMetadata(): Metadata {
  return { deadline: String(Date.now() + 2_000) };
}

function abortError(): Error {
  return new DOMException(
    "The Local playback request was aborted.",
    "AbortError",
  );
}
