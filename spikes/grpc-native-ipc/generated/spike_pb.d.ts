import * as jspb from 'google-protobuf'



export class ProbeRequest extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): ProbeRequest;

  getPayload(): string;
  setPayload(value: string): ProbeRequest;

  getBehavior(): Behavior;
  setBehavior(value: Behavior): ProbeRequest;

  getDelayMilliseconds(): number;
  setDelayMilliseconds(value: number): ProbeRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ProbeRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ProbeRequest): ProbeRequest.AsObject;
  static serializeBinaryToWriter(message: ProbeRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ProbeRequest;
  static deserializeBinaryFromReader(message: ProbeRequest, reader: jspb.BinaryReader): ProbeRequest;
}

export namespace ProbeRequest {
  export type AsObject = {
    requestId: string;
    payload: string;
    behavior: Behavior;
    delayMilliseconds: number;
  };
}

export class ProbeResponse extends jspb.Message {
  getRequestId(): string;
  setRequestId(value: string): ProbeResponse;

  getPayload(): string;
  setPayload(value: string): ProbeResponse;

  getNativeTransport(): string;
  setNativeTransport(value: string): ProbeResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ProbeResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ProbeResponse): ProbeResponse.AsObject;
  static serializeBinaryToWriter(message: ProbeResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ProbeResponse;
  static deserializeBinaryFromReader(message: ProbeResponse, reader: jspb.BinaryReader): ProbeResponse;
}

export namespace ProbeResponse {
  export type AsObject = {
    requestId: string;
    payload: string;
    nativeTransport: string;
  };
}

export enum Behavior {
  BEHAVIOR_SUCCESS = 0,
  BEHAVIOR_STATUS = 1,
  BEHAVIOR_DELAY = 2,
}
