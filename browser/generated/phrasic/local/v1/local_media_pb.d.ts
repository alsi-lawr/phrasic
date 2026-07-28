import * as jspb from 'google-protobuf'



export class GetInstanceInfoRequest extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetInstanceInfoRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetInstanceInfoRequest): GetInstanceInfoRequest.AsObject;
  static serializeBinaryToWriter(message: GetInstanceInfoRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetInstanceInfoRequest;
  static deserializeBinaryFromReader(message: GetInstanceInfoRequest, reader: jspb.BinaryReader): GetInstanceInfoRequest;
}

export namespace GetInstanceInfoRequest {
  export type AsObject = {
  };
}

export class GetInstanceInfoResponse extends jspb.Message {
  getInstanceId(): Uint8Array | string;
  getInstanceId_asU8(): Uint8Array;
  getInstanceId_asB64(): string;
  setInstanceId(value: Uint8Array | string): GetInstanceInfoResponse;

  getCapability(): CapabilityState | undefined;
  setCapability(value?: CapabilityState): GetInstanceInfoResponse;
  hasCapability(): boolean;
  clearCapability(): GetInstanceInfoResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetInstanceInfoResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetInstanceInfoResponse): GetInstanceInfoResponse.AsObject;
  static serializeBinaryToWriter(message: GetInstanceInfoResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetInstanceInfoResponse;
  static deserializeBinaryFromReader(message: GetInstanceInfoResponse, reader: jspb.BinaryReader): GetInstanceInfoResponse;
}

export namespace GetInstanceInfoResponse {
  export type AsObject = {
    instanceId: Uint8Array | string;
    capability?: CapabilityState.AsObject;
  };
}

export class GetSnapshotRequest extends jspb.Message {
  getExpectedInstanceId(): Uint8Array | string;
  getExpectedInstanceId_asU8(): Uint8Array;
  getExpectedInstanceId_asB64(): string;
  setExpectedInstanceId(value: Uint8Array | string): GetSnapshotRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetSnapshotRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetSnapshotRequest): GetSnapshotRequest.AsObject;
  static serializeBinaryToWriter(message: GetSnapshotRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetSnapshotRequest;
  static deserializeBinaryFromReader(message: GetSnapshotRequest, reader: jspb.BinaryReader): GetSnapshotRequest;
}

export namespace GetSnapshotRequest {
  export type AsObject = {
    expectedInstanceId: Uint8Array | string;
  };
}

export class GetSnapshotResponse extends jspb.Message {
  getInstanceId(): Uint8Array | string;
  getInstanceId_asU8(): Uint8Array;
  getInstanceId_asB64(): string;
  setInstanceId(value: Uint8Array | string): GetSnapshotResponse;

  getRevision(): number;
  setRevision(value: number): GetSnapshotResponse;

  getObservedAtMonotonicMilliseconds(): number;
  setObservedAtMonotonicMilliseconds(value: number): GetSnapshotResponse;

  getPollHintMilliseconds(): number;
  setPollHintMilliseconds(value: number): GetSnapshotResponse;

  getCapability(): CapabilityState | undefined;
  setCapability(value?: CapabilityState): GetSnapshotResponse;
  hasCapability(): boolean;
  clearCapability(): GetSnapshotResponse;

  getAvailable(): AvailableSnapshot | undefined;
  setAvailable(value?: AvailableSnapshot): GetSnapshotResponse;
  hasAvailable(): boolean;
  clearAvailable(): GetSnapshotResponse;

  getEmpty(): EmptySnapshot | undefined;
  setEmpty(value?: EmptySnapshot): GetSnapshotResponse;
  hasEmpty(): boolean;
  clearEmpty(): GetSnapshotResponse;

  getAmbiguous(): AmbiguousSnapshot | undefined;
  setAmbiguous(value?: AmbiguousSnapshot): GetSnapshotResponse;
  hasAmbiguous(): boolean;
  clearAmbiguous(): GetSnapshotResponse;

  getUnavailable(): UnavailableSnapshot | undefined;
  setUnavailable(value?: UnavailableSnapshot): GetSnapshotResponse;
  hasUnavailable(): boolean;
  clearUnavailable(): GetSnapshotResponse;

  getStale(): StaleSnapshot | undefined;
  setStale(value?: StaleSnapshot): GetSnapshotResponse;
  hasStale(): boolean;
  clearStale(): GetSnapshotResponse;

  getOutcomeCase(): GetSnapshotResponse.OutcomeCase;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetSnapshotResponse.AsObject;
  static toObject(includeInstance: boolean, msg: GetSnapshotResponse): GetSnapshotResponse.AsObject;
  static serializeBinaryToWriter(message: GetSnapshotResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetSnapshotResponse;
  static deserializeBinaryFromReader(message: GetSnapshotResponse, reader: jspb.BinaryReader): GetSnapshotResponse;
}

export namespace GetSnapshotResponse {
  export type AsObject = {
    instanceId: Uint8Array | string;
    revision: number;
    observedAtMonotonicMilliseconds: number;
    pollHintMilliseconds: number;
    capability?: CapabilityState.AsObject;
    available?: AvailableSnapshot.AsObject;
    empty?: EmptySnapshot.AsObject;
    ambiguous?: AmbiguousSnapshot.AsObject;
    unavailable?: UnavailableSnapshot.AsObject;
    stale?: StaleSnapshot.AsObject;
  };

  export enum OutcomeCase {
    OUTCOME_NOT_SET = 0,
    AVAILABLE = 6,
    EMPTY = 7,
    AMBIGUOUS = 8,
    UNAVAILABLE = 9,
    STALE = 10,
  }
}

export class CapabilityState extends jspb.Message {
  getStatus(): CapabilityStatus;
  setStatus(value: CapabilityStatus): CapabilityState;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): CapabilityState.AsObject;
  static toObject(includeInstance: boolean, msg: CapabilityState): CapabilityState.AsObject;
  static serializeBinaryToWriter(message: CapabilityState, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): CapabilityState;
  static deserializeBinaryFromReader(message: CapabilityState, reader: jspb.BinaryReader): CapabilityState;
}

export namespace CapabilityState {
  export type AsObject = {
    status: CapabilityStatus;
  };
}

export class AvailableSnapshot extends jspb.Message {
  getActivity(): PlaybackActivity;
  setActivity(value: PlaybackActivity): AvailableSnapshot;

  getItem(): PlaybackItem | undefined;
  setItem(value?: PlaybackItem): AvailableSnapshot;
  hasItem(): boolean;
  clearItem(): AvailableSnapshot;

  getTimeline(): Timeline | undefined;
  setTimeline(value?: Timeline): AvailableSnapshot;
  hasTimeline(): boolean;
  clearTimeline(): AvailableSnapshot;

  getSelectionReason(): SelectionReason;
  setSelectionReason(value: SelectionReason): AvailableSnapshot;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AvailableSnapshot.AsObject;
  static toObject(includeInstance: boolean, msg: AvailableSnapshot): AvailableSnapshot.AsObject;
  static serializeBinaryToWriter(message: AvailableSnapshot, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AvailableSnapshot;
  static deserializeBinaryFromReader(message: AvailableSnapshot, reader: jspb.BinaryReader): AvailableSnapshot;
}

export namespace AvailableSnapshot {
  export type AsObject = {
    activity: PlaybackActivity;
    item?: PlaybackItem.AsObject;
    timeline?: Timeline.AsObject;
    selectionReason: SelectionReason;
  };
}

export class EmptySnapshot extends jspb.Message {
  getSelectionReason(): SelectionReason;
  setSelectionReason(value: SelectionReason): EmptySnapshot;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EmptySnapshot.AsObject;
  static toObject(includeInstance: boolean, msg: EmptySnapshot): EmptySnapshot.AsObject;
  static serializeBinaryToWriter(message: EmptySnapshot, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EmptySnapshot;
  static deserializeBinaryFromReader(message: EmptySnapshot, reader: jspb.BinaryReader): EmptySnapshot;
}

export namespace EmptySnapshot {
  export type AsObject = {
    selectionReason: SelectionReason;
  };
}

export class AmbiguousSnapshot extends jspb.Message {
  getReason(): AmbiguityReason;
  setReason(value: AmbiguityReason): AmbiguousSnapshot;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AmbiguousSnapshot.AsObject;
  static toObject(includeInstance: boolean, msg: AmbiguousSnapshot): AmbiguousSnapshot.AsObject;
  static serializeBinaryToWriter(message: AmbiguousSnapshot, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AmbiguousSnapshot;
  static deserializeBinaryFromReader(message: AmbiguousSnapshot, reader: jspb.BinaryReader): AmbiguousSnapshot;
}

export namespace AmbiguousSnapshot {
  export type AsObject = {
    reason: AmbiguityReason;
  };
}

export class UnavailableSnapshot extends jspb.Message {
  getReason(): UnavailableReason;
  setReason(value: UnavailableReason): UnavailableSnapshot;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UnavailableSnapshot.AsObject;
  static toObject(includeInstance: boolean, msg: UnavailableSnapshot): UnavailableSnapshot.AsObject;
  static serializeBinaryToWriter(message: UnavailableSnapshot, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UnavailableSnapshot;
  static deserializeBinaryFromReader(message: UnavailableSnapshot, reader: jspb.BinaryReader): UnavailableSnapshot;
}

export namespace UnavailableSnapshot {
  export type AsObject = {
    reason: UnavailableReason;
  };
}

export class StaleSnapshot extends jspb.Message {
  getLastSnapshot(): AvailableSnapshot | undefined;
  setLastSnapshot(value?: AvailableSnapshot): StaleSnapshot;
  hasLastSnapshot(): boolean;
  clearLastSnapshot(): StaleSnapshot;

  getReason(): UnavailableReason;
  setReason(value: UnavailableReason): StaleSnapshot;

  getLastSuccessAgeMilliseconds(): number;
  setLastSuccessAgeMilliseconds(value: number): StaleSnapshot;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): StaleSnapshot.AsObject;
  static toObject(includeInstance: boolean, msg: StaleSnapshot): StaleSnapshot.AsObject;
  static serializeBinaryToWriter(message: StaleSnapshot, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): StaleSnapshot;
  static deserializeBinaryFromReader(message: StaleSnapshot, reader: jspb.BinaryReader): StaleSnapshot;
}

export namespace StaleSnapshot {
  export type AsObject = {
    lastSnapshot?: AvailableSnapshot.AsObject;
    reason: UnavailableReason;
    lastSuccessAgeMilliseconds: number;
  };
}

export class PlaybackItem extends jspb.Message {
  getTitle(): string;
  setTitle(value: string): PlaybackItem;
  hasTitle(): boolean;
  clearTitle(): PlaybackItem;

  getCreator(): string;
  setCreator(value: string): PlaybackItem;
  hasCreator(): boolean;
  clearCreator(): PlaybackItem;

  getCollection(): string;
  setCollection(value: string): PlaybackItem;
  hasCollection(): boolean;
  clearCollection(): PlaybackItem;

  getDestination(): string;
  setDestination(value: string): PlaybackItem;
  hasDestination(): boolean;
  clearDestination(): PlaybackItem;

  getNativeIdentity(): string;
  setNativeIdentity(value: string): PlaybackItem;
  hasNativeIdentity(): boolean;
  clearNativeIdentity(): PlaybackItem;

  getArtwork(): Artwork | undefined;
  setArtwork(value?: Artwork): PlaybackItem;
  hasArtwork(): boolean;
  clearArtwork(): PlaybackItem;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PlaybackItem.AsObject;
  static toObject(includeInstance: boolean, msg: PlaybackItem): PlaybackItem.AsObject;
  static serializeBinaryToWriter(message: PlaybackItem, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PlaybackItem;
  static deserializeBinaryFromReader(message: PlaybackItem, reader: jspb.BinaryReader): PlaybackItem;
}

export namespace PlaybackItem {
  export type AsObject = {
    title?: string;
    creator?: string;
    collection?: string;
    destination?: string;
    nativeIdentity?: string;
    artwork?: Artwork.AsObject;
  };

  export enum TitleCase {
    _TITLE_NOT_SET = 0,
    TITLE = 1,
  }

  export enum CreatorCase {
    _CREATOR_NOT_SET = 0,
    CREATOR = 2,
  }

  export enum CollectionCase {
    _COLLECTION_NOT_SET = 0,
    COLLECTION = 3,
  }

  export enum DestinationCase {
    _DESTINATION_NOT_SET = 0,
    DESTINATION = 4,
  }

  export enum NativeIdentityCase {
    _NATIVE_IDENTITY_NOT_SET = 0,
    NATIVE_IDENTITY = 5,
  }

  export enum ArtworkCase {
    _ARTWORK_NOT_SET = 0,
    ARTWORK = 6,
  }
}

export class Timeline extends jspb.Message {
  getPositionMilliseconds(): number;
  setPositionMilliseconds(value: number): Timeline;
  hasPositionMilliseconds(): boolean;
  clearPositionMilliseconds(): Timeline;

  getDurationMilliseconds(): number;
  setDurationMilliseconds(value: number): Timeline;
  hasDurationMilliseconds(): boolean;
  clearDurationMilliseconds(): Timeline;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Timeline.AsObject;
  static toObject(includeInstance: boolean, msg: Timeline): Timeline.AsObject;
  static serializeBinaryToWriter(message: Timeline, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Timeline;
  static deserializeBinaryFromReader(message: Timeline, reader: jspb.BinaryReader): Timeline;
}

export namespace Timeline {
  export type AsObject = {
    positionMilliseconds?: number;
    durationMilliseconds?: number;
  };

  export enum PositionMillisecondsCase {
    _POSITION_MILLISECONDS_NOT_SET = 0,
    POSITION_MILLISECONDS = 1,
  }

  export enum DurationMillisecondsCase {
    _DURATION_MILLISECONDS_NOT_SET = 0,
    DURATION_MILLISECONDS = 2,
  }
}

export class Artwork extends jspb.Message {
  getFormat(): ArtworkFormat;
  setFormat(value: ArtworkFormat): Artwork;

  getData(): Uint8Array | string;
  getData_asU8(): Uint8Array;
  getData_asB64(): string;
  setData(value: Uint8Array | string): Artwork;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Artwork.AsObject;
  static toObject(includeInstance: boolean, msg: Artwork): Artwork.AsObject;
  static serializeBinaryToWriter(message: Artwork, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Artwork;
  static deserializeBinaryFromReader(message: Artwork, reader: jspb.BinaryReader): Artwork;
}

export namespace Artwork {
  export type AsObject = {
    format: ArtworkFormat;
    data: Uint8Array | string;
  };
}

export enum CapabilityStatus {
  CAPABILITY_STATUS_UNSPECIFIED = 0,
  CAPABILITY_STATUS_AVAILABLE = 1,
  CAPABILITY_STATUS_UNSUPPORTED_PLATFORM = 2,
  CAPABILITY_STATUS_NATIVE_SESSION_UNAVAILABLE = 3,
}
export enum PlaybackActivity {
  PLAYBACK_ACTIVITY_UNSPECIFIED = 0,
  PLAYBACK_ACTIVITY_PLAYING = 1,
  PLAYBACK_ACTIVITY_PAUSED = 2,
  PLAYBACK_ACTIVITY_STOPPED = 3,
}
export enum SelectionReason {
  SELECTION_REASON_UNSPECIFIED = 0,
  SELECTION_REASON_STRICT_PIN = 1,
  SELECTION_REASON_SOLE_PLAYING = 2,
  SELECTION_REASON_SOLE_NON_PLAYING = 3,
}
export enum AmbiguityReason {
  AMBIGUITY_REASON_UNSPECIFIED = 0,
  AMBIGUITY_REASON_MULTIPLE_PLAYING = 1,
  AMBIGUITY_REASON_MULTIPLE_NON_PLAYING = 2,
}
export enum UnavailableReason {
  UNAVAILABLE_REASON_UNSPECIFIED = 0,
  UNAVAILABLE_REASON_NO_SOURCE = 1,
  UNAVAILABLE_REASON_STRICT_PIN_LOST = 2,
  UNAVAILABLE_REASON_NATIVE_SESSION_UNAVAILABLE = 3,
}
export enum ArtworkFormat {
  ARTWORK_FORMAT_UNSPECIFIED = 0,
  ARTWORK_FORMAT_PNG = 1,
  ARTWORK_FORMAT_JPEG = 2,
  ARTWORK_FORMAT_WEBP = 3,
}
