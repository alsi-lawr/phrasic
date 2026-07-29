import * as grpc from "@grpc/grpc-js";
import {
  GetInstanceInfoRequest,
  GetInstanceInfoResponse,
} from "../../../web/src/browser/generated/phrasic/local/v1/local_media_pb.js";

export const localNativeMethods = {
  getInstanceInfo: "/phrasic.local.v1.LocalMedia/GetInstanceInfo",
  getSnapshot: "/phrasic.local.v1.LocalMedia/GetSnapshot",
} as const;

export type LocalNativeMethod =
  (typeof localNativeMethods)[keyof typeof localNativeMethods];

export type NativeClientFailure = {
  readonly code: number;
  readonly kind: "native-client-failure";
};

export type LocalNativeClient = {
  readonly close: () => void;
  readonly invoke: (
    method: LocalNativeMethod,
    payload: Uint8Array,
    signal: AbortSignal,
  ) => Promise<Uint8Array>;
  readonly proveReadiness: (expectedInstanceId: Uint8Array) => Promise<boolean>;
};

const nativeDeadlineMilliseconds = 2_000;
const maximumNativeRequestBytes = 64 * 1_024;

export function createLocalNativeClient(endpoint: string): LocalNativeClient {
  const client = new grpc.Client(
    `unix:${endpoint}`,
    grpc.credentials.createInsecure(),
    {
      "grpc.max_receive_message_length": -1,
      "grpc.max_send_message_length": maximumNativeRequestBytes,
    },
  );

  const nativeClient: LocalNativeClient = {
    close(): void {
      client.close();
    },

    invoke(
      method: LocalNativeMethod,
      payload: Uint8Array,
      signal: AbortSignal,
    ): Promise<Uint8Array> {
      return invokeNative(client, method, payload, signal);
    },

    async proveReadiness(expectedInstanceId: Uint8Array): Promise<boolean> {
      const request = new GetInstanceInfoRequest().serializeBinary();
      const abortController = new AbortController();
      const timeout = setTimeout(
        (): void => abortController.abort(),
        nativeDeadlineMilliseconds,
      );
      try {
        const bytes = await nativeClient.invoke(
          localNativeMethods.getInstanceInfo,
          request,
          abortController.signal,
        );
        const response = GetInstanceInfoResponse.deserializeBinary(bytes);
        return equalBytes(response.getInstanceId_asU8(), expectedInstanceId);
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
      }
    },
  };

  return nativeClient;
}

function invokeNative(
  client: grpc.Client,
  method: LocalNativeMethod,
  payload: Uint8Array,
  signal: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let call: grpc.ClientUnaryCall | undefined;
    const abort = (): void => {
      call?.cancel();
      reject(nativeFailure(grpc.status.CANCELLED));
    };
    call = client.makeUnaryRequest<Uint8Array, Uint8Array>(
      method,
      (value): Buffer => Buffer.from(value),
      (value): Uint8Array =>
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      payload,
      new grpc.Metadata(),
      { deadline: Date.now() + nativeDeadlineMilliseconds },
      (error, response): void => {
        signal.removeEventListener("abort", abort);
        if (error !== null) {
          reject(nativeFailure(error.code));
          return;
        }
        if (response === undefined) {
          reject(nativeFailure(grpc.status.INTERNAL));
          return;
        }
        resolve(response);
      },
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}

function nativeFailure(code: number): NativeClientFailure {
  return { code, kind: "native-client-failure" };
}

export function isNativeClientFailure(
  value: unknown,
): value is NativeClientFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getOwnPropertyDescriptor(value, "kind")?.value ===
      "native-client-failure" &&
    typeof Object.getOwnPropertyDescriptor(value, "code")?.value === "number"
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index): boolean => value === right[index])
  );
}
