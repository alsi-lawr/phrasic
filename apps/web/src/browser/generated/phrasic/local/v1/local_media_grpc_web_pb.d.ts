import * as grpcWeb from 'grpc-web';

import * as phrasic_local_v1_local_media_pb from '../../../phrasic/local/v1/local_media_pb'; // proto import: "phrasic/local/v1/local_media.proto"


export class LocalMediaClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  getInstanceInfo(
    request: phrasic_local_v1_local_media_pb.GetInstanceInfoRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: phrasic_local_v1_local_media_pb.GetInstanceInfoResponse) => void
  ): grpcWeb.ClientReadableStream<phrasic_local_v1_local_media_pb.GetInstanceInfoResponse>;

  getSnapshot(
    request: phrasic_local_v1_local_media_pb.GetSnapshotRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: phrasic_local_v1_local_media_pb.GetSnapshotResponse) => void
  ): grpcWeb.ClientReadableStream<phrasic_local_v1_local_media_pb.GetSnapshotResponse>;

}

export class LocalMediaPromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  getInstanceInfo(
    request: phrasic_local_v1_local_media_pb.GetInstanceInfoRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<phrasic_local_v1_local_media_pb.GetInstanceInfoResponse>;

  getSnapshot(
    request: phrasic_local_v1_local_media_pb.GetSnapshotRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<phrasic_local_v1_local_media_pb.GetSnapshotResponse>;

}

