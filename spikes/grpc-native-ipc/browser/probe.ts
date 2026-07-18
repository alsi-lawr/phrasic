import type {
  ClientReadableStream,
  Metadata,
  RpcError,
  Status,
} from "grpc-web";

import { InteropClient } from "../generated/spike_grpc_web_pb.js";
import {
  Behavior,
  ProbeRequest,
  type ProbeResponse,
} from "../generated/spike_pb.js";

type Scenario =
  "abort" | "concurrency" | "deadline" | "status" | "success" | "unavailable";

type CallResponse =
  | { readonly kind: "error"; readonly error: RpcError }
  | { readonly kind: "response"; readonly response: ProbeResponse };

type CallStatus =
  | { readonly kind: "pending" }
  | { readonly kind: "received"; readonly status: Status };

type CallResult = {
  readonly response: CallResponse;
  readonly status: Status;
  readonly initialMetadata: Metadata;
};

type BrowserReport = {
  readonly detail: string;
  readonly passed: boolean;
  readonly scenario: Scenario;
};

const client = new InteropClient(window.location.origin);

const parseScenario = (value: string | null): Scenario => {
  switch (value) {
    case "abort":
    case "concurrency":
    case "deadline":
    case "status":
    case "success":
    case "unavailable":
      return value;
    case null:
      throw new Error("Missing browser scenario");
    default:
      throw new Error("Unknown browser scenario");
  }
};

const createRequest = (options: {
  readonly behavior: Behavior;
  readonly delayMilliseconds: number;
  readonly requestId: string;
}): ProbeRequest => {
  const request = new ProbeRequest();
  request.setRequestId(options.requestId);
  request.setPayload("browser-binary-grpc-web");
  request.setBehavior(options.behavior);
  request.setDelayMilliseconds(options.delayMilliseconds);
  return request;
};

const callProbe = (options: {
  readonly metadata?: Metadata;
  readonly request: ProbeRequest;
}): Promise<CallResult> =>
  new Promise((resolve, reject) => {
    let response: CallResponse | undefined;
    let status: CallStatus = { kind: "pending" };
    let initialMetadata: Metadata = {};
    const timeout = setTimeout(
      (): void => reject(new Error("Browser gRPC-Web call timed out")),
      5_000,
    );

    const complete = (): void => {
      if (response === undefined || status.kind === "pending") {
        return;
      }
      clearTimeout(timeout);
      resolve({ initialMetadata, response, status: status.status });
    };

    const stream: ClientReadableStream<ProbeResponse> = client.probe(
      options.request,
      options.metadata ?? {},
      (error: RpcError, value: ProbeResponse): void => {
        response =
          error === null
            ? { kind: "response", response: value }
            : { error, kind: "error" };
        complete();
      },
    );

    stream.on("metadata", (metadata: Metadata): void => {
      initialMetadata = metadata;
    });
    stream.on("status", (receivedStatus: Status): void => {
      status = { kind: "received", status: receivedStatus };
      complete();
    });
    stream.on("error", (error: RpcError): void => {
      if (response === undefined) {
        response = { error, kind: "error" };
      }
      complete();
    });
  });

const cancelProbe = (request: ProbeRequest): Promise<void> =>
  new Promise((resolve, reject) => {
    let cancelled = false;
    const stream = client.probe(
      request,
      {},
      (error: RpcError, _response: ProbeResponse): void => {
        if (!cancelled) {
          reject(
            new Error(
              error === null
                ? "Browser call completed before cancellation"
                : `Browser call failed before cancellation: ${error.code}`,
            ),
          );
        }
      },
    );
    stream.on("error", (error: RpcError): void => {
      if (!cancelled) {
        reject(
          new Error(`Browser call failed before cancellation: ${error.code}`),
        );
      }
    });
    setTimeout((): void => {
      cancelled = true;
      stream.cancel();
      resolve();
    }, 0);
  });

const requireStatus = (result: CallResult, code: number): void => {
  if (result.status.code !== code) {
    throw new Error(
      `Expected gRPC status ${code}, received ${result.status.code}`,
    );
  }
};

const requireSuccess = (result: CallResult, requestId: string): void => {
  requireStatus(result, 0);
  if (result.response.kind !== "response") {
    throw new Error("Successful call returned no protobuf response");
  }
  if (result.response.response.getRequestId() !== requestId) {
    throw new Error("Response request identifier mismatch");
  }
  if (
    result.response.response.getPayload() !== "native:browser-binary-grpc-web"
  ) {
    throw new Error("Response protobuf payload mismatch");
  }
  const transport = result.response.response.getNativeTransport();
  if (transport !== "linux-uds" && transport !== "windows-named-pipe") {
    throw new Error("Response lacks a native IPC transport marker");
  }
  if (result.initialMetadata["x-spike-native-transport"] !== transport) {
    throw new Error("Native gRPC initial metadata was not translated");
  }
};

const runScenario = async (scenario: Scenario): Promise<string> => {
  switch (scenario) {
    case "success": {
      const requestId = "success";
      const result = await callProbe({
        request: createRequest({
          behavior: Behavior.BEHAVIOR_SUCCESS,
          delayMilliseconds: 0,
          requestId,
        }),
      });
      requireSuccess(result, requestId);
      return "binary response, initial metadata, and OK trailers passed";
    }
    case "status": {
      const result = await callProbe({
        request: createRequest({
          behavior: Behavior.BEHAVIOR_STATUS,
          delayMilliseconds: 0,
          requestId: "status",
        }),
      });
      requireStatus(result, 9);
      if (result.status.metadata?.["x-spike-trailer"] !== "rust-status") {
        throw new Error("Native status trailer was not translated");
      }
      return "failed-precondition status and custom trailer passed";
    }
    case "deadline": {
      const result = await callProbe({
        metadata: { "grpc-timeout": "80m" },
        request: createRequest({
          behavior: Behavior.BEHAVIOR_DELAY,
          delayMilliseconds: 1_000,
          requestId: "deadline",
        }),
      });
      requireStatus(result, 4);
      return "deadline exceeded and native cancellation passed";
    }
    case "abort": {
      await cancelProbe(
        createRequest({
          behavior: Behavior.BEHAVIOR_DELAY,
          delayMilliseconds: 1_000,
          requestId: "abort",
        }),
      );
      return "browser cancellation was issued";
    }
    case "concurrency": {
      const requestIds = Array.from(
        { length: 8 },
        (_, index) => `concurrent-${index}`,
      );
      const results = await Promise.all(
        requestIds.map((requestId) =>
          callProbe({
            request: createRequest({
              behavior: Behavior.BEHAVIOR_SUCCESS,
              delayMilliseconds: 0,
              requestId,
            }),
          }),
        ),
      );
      results.forEach((result, index): void => {
        const requestId = requestIds[index];
        if (requestId === undefined) {
          throw new Error("Concurrent result has no request identifier");
        }
        requireSuccess(result, requestId);
      });
      return "eight concurrent calls passed";
    }
    case "unavailable": {
      const result = await callProbe({
        request: createRequest({
          behavior: Behavior.BEHAVIOR_SUCCESS,
          delayMilliseconds: 0,
          requestId: "unavailable",
        }),
      });
      requireStatus(result, 14);
      return "native service unavailability passed without fallback";
    }
  }
};

const publishReport = (report: BrowserReport): void => {
  const encoded = btoa(JSON.stringify(report));
  document.body.dataset.spikeResult = encoded;
  document.body.textContent = report.detail;
};

const scenario = parseScenario(
  new URL(window.location.href).searchParams.get("scenario"),
);
try {
  const detail = await runScenario(scenario);
  publishReport({ detail, passed: true, scenario });
} catch (caught: unknown) {
  const error =
    caught instanceof Error
      ? caught
      : new Error("Unknown browser probe failure");
  publishReport({ detail: error.message, passed: false, scenario });
}
