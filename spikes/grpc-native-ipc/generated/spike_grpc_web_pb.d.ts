import * as grpcWeb from 'grpc-web';

import * as spike_pb from './spike_pb'; // proto import: "spike.proto"


export class InteropClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  probe(
    request: spike_pb.ProbeRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: spike_pb.ProbeResponse) => void
  ): grpcWeb.ClientReadableStream<spike_pb.ProbeResponse>;

}

export class InteropPromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  probe(
    request: spike_pb.ProbeRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<spike_pb.ProbeResponse>;

}

