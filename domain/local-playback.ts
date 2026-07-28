import { failed, succeeded, type Result } from "./result.ts";

const freshSnapshotMaximumAgeMilliseconds = 5_000;
const staleSnapshotMaximumAgeMilliseconds = 30_000;

export class LocalText {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static parse(
    field: "collection" | "creator" | "title",
    input: unknown,
  ): Result<LocalText, LocalMetadataValidationError> {
    if (typeof input !== "string") {
      return failed(invalidMetadata(field, "expected-string"));
    }
    if (input.trim().length === 0) {
      return failed(invalidMetadata(field, "value-must-not-be-empty"));
    }

    return succeeded(new LocalText(input));
  }

  static trusted(value: string): LocalText {
    return new LocalText(value);
  }

  toString(): string {
    return this.#value;
  }
}

export class LocalDestination {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<LocalDestination, LocalMetadataValidationError> {
    return parseHttpUrl(
      "destination",
      input,
      (value: string): LocalDestination => new LocalDestination(value),
    );
  }

  static trusted(value: string): LocalDestination {
    return new LocalDestination(value);
  }

  toString(): string {
    return this.#value;
  }
}

export class LocalArtworkReference {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<LocalArtworkReference, LocalMetadataValidationError> {
    return parseHttpUrl(
      "artwork",
      input,
      (value: string): LocalArtworkReference =>
        new LocalArtworkReference(value),
    );
  }

  toString(): string {
    return this.#value;
  }
}

export class LocalNativeIdentity {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<LocalNativeIdentity, LocalMetadataValidationError> {
    if (typeof input !== "string") {
      return failed(invalidMetadata("native-identity", "expected-string"));
    }
    if (input.trim().length === 0) {
      return failed(
        invalidMetadata("native-identity", "value-must-not-be-empty"),
      );
    }

    return succeeded(new LocalNativeIdentity(input));
  }

  static trusted(value: string): LocalNativeIdentity {
    return new LocalNativeIdentity(value);
  }

  toString(): string {
    return this.#value;
  }
}

export type LocalActivity = "paused" | "playing" | "stopped";

export type LocalMetadataField =
  | "artwork"
  | "collection"
  | "creator"
  | "destination"
  | "duration"
  | "native-identity"
  | "position"
  | "title";

export type LocalMetadataValidationError = {
  readonly kind: "invalid-local-metadata";
  readonly field: LocalMetadataField | "metadata";
  readonly reason:
    | "expected-data-property"
    | "expected-non-negative-safe-integer"
    | "expected-object"
    | "expected-string"
    | "invalid-http-url"
    | "unexpected-field"
    | "value-must-not-be-empty";
};

export class NativeMonotonicMilliseconds {
  readonly #value: number;

  private constructor(value: number) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<NativeMonotonicMilliseconds, LocalMetadataValidationError> {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < 0
    ) {
      return failed(
        invalidMetadata("metadata", "expected-non-negative-safe-integer"),
      );
    }

    return succeeded(new NativeMonotonicMilliseconds(input));
  }

  static trusted(value: number): NativeMonotonicMilliseconds {
    return new NativeMonotonicMilliseconds(value);
  }

  elapsedSince(
    previous: NativeMonotonicMilliseconds,
  ): Result<number, LocalMetadataValidationError> {
    const elapsed = this.#value - previous.#value;

    if (elapsed < 0) {
      return failed(
        invalidMetadata("metadata", "expected-non-negative-safe-integer"),
      );
    }

    return succeeded(elapsed);
  }
}

export class LocalDurationMilliseconds {
  readonly #value: number;

  private constructor(value: number) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<LocalDurationMilliseconds, LocalMetadataValidationError> {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < 0
    ) {
      return failed(
        invalidMetadata("duration", "expected-non-negative-safe-integer"),
      );
    }

    return succeeded(new LocalDurationMilliseconds(input));
  }

  static trusted(value: number): LocalDurationMilliseconds {
    return new LocalDurationMilliseconds(value);
  }

  toNumber(): number {
    return this.#value;
  }
}

export class LocalPositionMilliseconds {
  readonly #value: number;

  private constructor(value: number) {
    this.#value = value;
  }

  static parse(
    input: unknown,
  ): Result<LocalPositionMilliseconds, LocalMetadataValidationError> {
    if (
      typeof input !== "number" ||
      !Number.isSafeInteger(input) ||
      input < 0
    ) {
      return failed(
        invalidMetadata("position", "expected-non-negative-safe-integer"),
      );
    }

    return succeeded(new LocalPositionMilliseconds(input));
  }

  static trusted(value: number): LocalPositionMilliseconds {
    return new LocalPositionMilliseconds(value);
  }

  toNumber(): number {
    return this.#value;
  }
}

export type LocalPlaybackMetadata = {
  readonly artwork?: LocalArtworkReference;
  readonly collection?: LocalText;
  readonly creator?: LocalText;
  readonly destination?: LocalDestination;
  readonly duration?: LocalDurationMilliseconds;
  readonly nativeIdentity?: LocalNativeIdentity;
  readonly position?: LocalPositionMilliseconds;
  readonly title?: LocalText;
};

export function parseLocalPlaybackMetadata(
  input: unknown,
): Result<LocalPlaybackMetadata, LocalMetadataValidationError> {
  if (!isMetadataObject(input)) {
    return failed(invalidMetadata("metadata", "expected-object"));
  }

  const unexpected = Object.getOwnPropertyNames(input).find(
    (key): boolean => !localMetadataKeys.includes(key),
  );
  if (
    unexpected !== undefined ||
    Object.getOwnPropertySymbols(input).length > 0
  ) {
    return failed(invalidMetadata("metadata", "unexpected-field"));
  }

  const title = parseOptionalText(input, "title");
  if (title.kind === "failure") {
    return title;
  }
  const creator = parseOptionalText(input, "creator");
  if (creator.kind === "failure") {
    return creator;
  }
  const collection = parseOptionalText(input, "collection");
  if (collection.kind === "failure") {
    return collection;
  }
  const destination = parseOptional(
    input,
    "destination",
    LocalDestination.parse,
  );
  if (destination.kind === "failure") {
    return destination;
  }
  const artwork = parseOptional(input, "artwork", LocalArtworkReference.parse);
  if (artwork.kind === "failure") {
    return artwork;
  }
  const duration = parseOptionalDuration(input);
  if (duration.kind === "failure") {
    return duration;
  }
  const position = parseOptionalPosition(input);
  if (position.kind === "failure") {
    return position;
  }
  const nativeIdentity = parseOptionalNativeIdentity(input);
  if (nativeIdentity.kind === "failure") {
    return nativeIdentity;
  }

  return succeeded(
    Object.freeze({
      ...optionalProperty("title", title.value),
      ...optionalProperty("creator", creator.value),
      ...optionalProperty("collection", collection.value),
      ...optionalProperty("destination", destination.value),
      ...optionalProperty("artwork", artwork.value),
      ...optionalProperty("duration", duration.value),
      ...optionalProperty("position", position.value),
      ...optionalProperty("nativeIdentity", nativeIdentity.value),
    }),
  );
}

export type LocalSuccessfulSnapshot = {
  readonly activity: LocalActivity;
  readonly metadata: LocalPlaybackMetadata;
  readonly observedAt: NativeMonotonicMilliseconds;
};

export type LocalTitledSuccessfulSnapshot = {
  readonly activity: LocalActivity;
  readonly metadata: LocalPlaybackMetadata & { readonly title: LocalText };
  readonly observedAt: NativeMonotonicMilliseconds;
};

export function createLocalSuccessfulSnapshot(input: {
  readonly activity: LocalActivity;
  readonly metadata: LocalPlaybackMetadata;
  readonly observedAt: NativeMonotonicMilliseconds;
}): LocalSuccessfulSnapshot {
  return Object.freeze({ ...input });
}

export type LocalPolicySelection =
  | {
      readonly kind: "ambiguous";
      readonly reason: "multiple-not-playing" | "multiple-playing";
    }
  | {
      readonly kind: "selected";
      readonly reason: "sole-not-playing" | "sole-playing" | "strict-pin";
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "no-source" | "strict-pin-unavailable";
    };

export type TrustedLocalPlaybackOutcome =
  | { readonly kind: "incompatible-api" }
  | { readonly kind: "native-session-unavailable" }
  | {
      readonly kind: "policy-selected";
      readonly selection: Extract<
        LocalPolicySelection,
        { readonly kind: "selected" }
      >;
      readonly snapshot: LocalSuccessfulSnapshot;
    }
  | {
      readonly kind: "policy-status";
      readonly selection: Exclude<
        LocalPolicySelection,
        { readonly kind: "selected" }
      >;
    }
  | { readonly kind: "unsupported-platform" };

export function trustedSelectedLocalPlayback(input: {
  readonly reason: Extract<
    LocalPolicySelection,
    { readonly kind: "selected" }
  >["reason"];
  readonly snapshot: LocalSuccessfulSnapshot;
}): TrustedLocalPlaybackOutcome {
  return Object.freeze({
    kind: "policy-selected",
    selection: Object.freeze({ kind: "selected", reason: input.reason }),
    snapshot: input.snapshot,
  });
}

export function trustedPolicyStatus(
  selection: Exclude<LocalPolicySelection, { readonly kind: "selected" }>,
): TrustedLocalPlaybackOutcome {
  return Object.freeze({
    kind: "policy-status",
    selection: Object.freeze(selection),
  });
}

export type LocalLastSuccessfulSnapshot =
  | { readonly kind: "available"; readonly snapshot: LocalSuccessfulSnapshot }
  | { readonly kind: "unavailable" };

export function unavailableLocalLastSuccessfulSnapshot(): LocalLastSuccessfulSnapshot {
  return Object.freeze({ kind: "unavailable" });
}

export type LocalAutomaticAction =
  { readonly kind: "automatic-retry" } | { readonly kind: "automatic-status" };

export type LocalPlaybackPresentation =
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "content";
      readonly snapshot: LocalTitledSuccessfulSnapshot;
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "metadata-unavailable";
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "stale-content";
      readonly snapshot: LocalTitledSuccessfulSnapshot;
      readonly status: LocalUnavailableStatus;
    }
  | {
      readonly action: LocalAutomaticAction;
      readonly kind: "unavailable";
      readonly status: LocalUnavailableStatus;
    };

export type LocalUnavailableStatus =
  | "ambiguous-sources"
  | "incompatible-api"
  | "native-session-unavailable"
  | "no-source"
  | "strict-pin-unavailable"
  | "unsupported-platform";

export function resolveLocalPlaybackPresentation(input: {
  readonly lastSuccessful: LocalLastSuccessfulSnapshot;
  readonly now: NativeMonotonicMilliseconds;
  readonly outcome: TrustedLocalPlaybackOutcome;
}): LocalPlaybackPresentation {
  switch (input.outcome.kind) {
    case "unsupported-platform":
      return unavailablePresentation("unsupported-platform");
    case "native-session-unavailable":
      return presentationForUnavailableOutcome(
        input,
        "native-session-unavailable",
      );
    case "incompatible-api":
      return presentationForUnavailableOutcome(input, "incompatible-api");
    case "policy-selected":
      return presentationForSnapshot(
        input.now,
        input.outcome.snapshot,
        "no-source",
      );
    case "policy-status":
      return presentationForPolicyStatus(input, input.outcome.selection);
  }

  return unreachable(input.outcome);
}

function presentationForPolicyStatus(
  input: {
    readonly lastSuccessful: LocalLastSuccessfulSnapshot;
    readonly now: NativeMonotonicMilliseconds;
  },
  selection: Exclude<LocalPolicySelection, { readonly kind: "selected" }>,
): LocalPlaybackPresentation {
  switch (selection.kind) {
    case "ambiguous":
      return presentationForUnavailableOutcome(input, "ambiguous-sources");
    case "unavailable":
      return presentationForUnavailableOutcome(input, selection.reason);
  }

  return unreachable(selection);
}

function presentationForUnavailableOutcome(
  input: {
    readonly lastSuccessful: LocalLastSuccessfulSnapshot;
    readonly now: NativeMonotonicMilliseconds;
  },
  status: LocalUnavailableStatus,
): LocalPlaybackPresentation {
  switch (input.lastSuccessful.kind) {
    case "unavailable":
      return unavailablePresentation(status);
    case "available":
      return presentationForRetainedSnapshot(
        input.now,
        input.lastSuccessful.snapshot,
        status,
      );
  }

  return unreachable(input.lastSuccessful);
}

function presentationForSnapshot(
  now: NativeMonotonicMilliseconds,
  snapshot: LocalSuccessfulSnapshot,
  unavailableStatus: LocalUnavailableStatus,
): LocalPlaybackPresentation {
  if (snapshot.metadata.title === undefined) {
    return Object.freeze({
      action: Object.freeze({ kind: "automatic-status" }),
      kind: "metadata-unavailable",
    });
  }

  const titledSnapshot: LocalTitledSuccessfulSnapshot = Object.freeze({
    activity: snapshot.activity,
    metadata: Object.freeze({
      ...snapshot.metadata,
      title: snapshot.metadata.title,
    }),
    observedAt: snapshot.observedAt,
  });

  const age = now.elapsedSince(snapshot.observedAt);
  if (age.kind === "failure") {
    return unavailablePresentation("native-session-unavailable");
  }

  if (age.value <= freshSnapshotMaximumAgeMilliseconds) {
    return Object.freeze({
      action: Object.freeze({ kind: "automatic-status" }),
      kind: "content",
      snapshot: titledSnapshot,
    });
  }

  if (age.value <= staleSnapshotMaximumAgeMilliseconds) {
    return Object.freeze({
      action: Object.freeze({ kind: "automatic-retry" }),
      kind: "stale-content",
      snapshot: titledSnapshot,
      status: unavailableStatus,
    });
  }

  return unavailablePresentation(unavailableStatus);
}

function presentationForRetainedSnapshot(
  now: NativeMonotonicMilliseconds,
  snapshot: LocalSuccessfulSnapshot,
  status: LocalUnavailableStatus,
): LocalPlaybackPresentation {
  return presentationForSnapshot(now, snapshot, status);
}

function unavailablePresentation(
  status: LocalUnavailableStatus,
): LocalPlaybackPresentation {
  return Object.freeze({
    action: Object.freeze({ kind: "automatic-retry" }),
    kind: "unavailable",
    status,
  });
}

const localMetadataKeys: ReadonlyArray<string> = [
  "artwork",
  "collection",
  "creator",
  "destination",
  "duration",
  "nativeIdentity",
  "position",
  "title",
];

type OptionalLocalValue<Value> =
  | { readonly kind: "available"; readonly value: Value }
  | { readonly kind: "absent" };

function parseOptionalText(
  input: object,
  key: "collection" | "creator" | "title",
): Result<OptionalLocalValue<LocalText>, LocalMetadataValidationError> {
  return parseOptional(
    input,
    key,
    (value: unknown): Result<LocalText, LocalMetadataValidationError> =>
      LocalText.parse(key, value),
  );
}

function parseOptionalDuration(
  input: object,
): Result<
  OptionalLocalValue<LocalDurationMilliseconds>,
  LocalMetadataValidationError
> {
  return parseOptional(input, "duration", LocalDurationMilliseconds.parse);
}

function parseOptionalPosition(
  input: object,
): Result<
  OptionalLocalValue<LocalPositionMilliseconds>,
  LocalMetadataValidationError
> {
  return parseOptional(input, "position", LocalPositionMilliseconds.parse);
}

function parseOptionalNativeIdentity(
  input: object,
): Result<
  OptionalLocalValue<LocalNativeIdentity>,
  LocalMetadataValidationError
> {
  return parseOptional(input, "nativeIdentity", LocalNativeIdentity.parse);
}

function parseOptional<Value>(
  input: object,
  key: string,
  parse: (value: unknown) => Result<Value, LocalMetadataValidationError>,
): Result<OptionalLocalValue<Value>, LocalMetadataValidationError> {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (descriptor === undefined) {
    return succeeded(Object.freeze({ kind: "absent" }));
  }
  if (!("value" in descriptor)) {
    return failed(invalidMetadata(fieldForKey(key), "expected-data-property"));
  }

  const parsed = parse(descriptor.value);
  if (parsed.kind === "failure") {
    return parsed;
  }

  return succeeded(Object.freeze({ kind: "available", value: parsed.value }));
}

function optionalProperty<Value>(
  key: string,
  value: OptionalLocalValue<Value>,
): object {
  switch (value.kind) {
    case "available":
      return { [key]: value.value };
    case "absent":
      return {};
  }

  return unreachable(value);
}

function parseHttpUrl<Value>(
  field: "artwork" | "destination",
  input: unknown,
  create: (value: string) => Value,
): Result<Value, LocalMetadataValidationError> {
  if (typeof input !== "string") {
    return failed(invalidMetadata(field, "expected-string"));
  }
  if (input.trim().length === 0) {
    return failed(invalidMetadata(field, "value-must-not-be-empty"));
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return failed(invalidMetadata(field, "invalid-http-url"));
    }

    return succeeded(create(url.href));
  } catch {
    return failed(invalidMetadata(field, "invalid-http-url"));
  }
}

function isMetadataObject(input: unknown): input is object {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function fieldForKey(key: string): LocalMetadataField {
  switch (key) {
    case "artwork":
    case "collection":
    case "creator":
    case "destination":
    case "duration":
    case "nativeIdentity":
    case "position":
    case "title":
      return key === "nativeIdentity" ? "native-identity" : key;
  }

  throw new Error(`Unexpected Local metadata key: ${key}`);
}

function invalidMetadata(
  field: LocalMetadataValidationError["field"],
  reason: LocalMetadataValidationError["reason"],
): LocalMetadataValidationError {
  return Object.freeze({ kind: "invalid-local-metadata", field, reason });
}

function unreachable(value: never): never {
  throw new Error(`Unexpected Local playback value: ${String(value)}`);
}
