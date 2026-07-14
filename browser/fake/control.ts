import {
  maximumPlatformTimerDelayMilliseconds,
  type Result,
  type UnsupportedPlaybackReason,
} from "../../domain/playback.ts";

export type FakePlaybackMode = "paused" | "playing";

export type FakeTrackCreator = {
  readonly creatorId: string;
  readonly name: string;
  readonly url: string;
};

export type FakeProviderFailure =
  | { readonly kind: "malformed-response" }
  | { readonly kind: "network-failure" }
  | { readonly kind: "permission-denied" }
  | {
      readonly kind: "rate-limited";
      readonly retryAfterMilliseconds: number | null;
    }
  | { readonly kind: "server-failure"; readonly status: number }
  | { readonly kind: "unauthorized" }
  | { readonly kind: "unexpected-response"; readonly status: number };

export type FakeControlCommand =
  | {
      readonly kind: "resolve-authorization";
      readonly decision: "approved" | "denied";
    }
  | { readonly kind: "expire-authorization" }
  | { readonly kind: "set-empty" }
  | {
      readonly kind: "set-track";
      readonly playback: FakePlaybackMode;
      readonly itemId: string;
      readonly title: string;
      readonly itemUrl: string;
      readonly artworkUrl: string | null;
      readonly creators: ReadonlyArray<FakeTrackCreator>;
      readonly collectionId: string;
      readonly collectionTitle: string;
      readonly collectionUrl: string;
    }
  | {
      readonly kind: "set-episode";
      readonly playback: FakePlaybackMode;
      readonly itemId: string;
      readonly title: string;
      readonly itemUrl: string;
      readonly artworkUrl: string | null;
      readonly showId: string;
      readonly showTitle: string;
      readonly publisher: string;
      readonly showUrl: string;
    }
  | {
      readonly kind: "set-unsupported";
      readonly reason: UnsupportedPlaybackReason;
    }
  | {
      readonly kind: "set-provider-failure";
      readonly failure: FakeProviderFailure;
    }
  | {
      readonly kind: "set-fatal";
      readonly reason:
        "browser-capability-unavailable" | "configuration-unavailable";
    };

export type FakeControlParseFailure = {
  readonly kind: "invalid-fake-control";
};

type ParsedObject = object;

export function parseFakeControlEnvelope(
  input: unknown,
  applicationUrl: URL,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const envelope = exactObject(input, ["source", "version", "command"]);
  if (envelope.kind === "failure") {
    return envelope;
  }

  const source = dataProperty(envelope.value, "source");
  const version = dataProperty(envelope.value, "version");
  const command = dataProperty(envelope.value, "command");
  if (
    source.kind === "failure" ||
    source.value !== "phrasic-fake" ||
    version.kind === "failure" ||
    version.value !== 1 ||
    command.kind === "failure"
  ) {
    return invalidControl();
  }

  return parseFakeControlCommand(command.value, applicationUrl);
}

export function parseFakeControlCommand(
  input: unknown,
  applicationUrl: URL,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const source = objectValue(input);
  if (source.kind === "failure") {
    return source;
  }

  const kind = nonEmptyStringProperty(source.value, "kind");
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "resolve-authorization":
      return parseAuthorizationResolution(source.value);
    case "expire-authorization":
    case "set-empty":
      return parseNoArgumentCommand(source.value, kind.value);
    case "set-track":
      return parseTrackCommand(source.value, applicationUrl);
    case "set-episode":
      return parseEpisodeCommand(source.value, applicationUrl);
    case "set-unsupported":
      return parseUnsupportedCommand(source.value);
    case "set-provider-failure":
      return parseProviderFailureCommand(source.value);
    case "set-fatal":
      return parseFatalCommand(source.value);
    default:
      return invalidControl();
  }
}

function parseAuthorizationResolution(
  source: ParsedObject,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "decision"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const decision = nonEmptyStringProperty(exact.value, "decision");
  if (
    decision.kind === "failure" ||
    (decision.value !== "approved" && decision.value !== "denied")
  ) {
    return invalidControl();
  }

  return succeeded({ kind: "resolve-authorization", decision: decision.value });
}

function parseNoArgumentCommand(
  source: ParsedObject,
  kind: "expire-authorization" | "set-empty",
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind"]);
  if (exact.kind === "failure") {
    return exact;
  }

  return kind === "expire-authorization"
    ? succeeded({ kind: "expire-authorization" })
    : succeeded({ kind: "set-empty" });
}

function parseTrackCommand(
  source: ParsedObject,
  applicationUrl: URL,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, [
    "kind",
    "playback",
    "itemId",
    "title",
    "itemUrl",
    "artworkUrl",
    "creators",
    "collectionId",
    "collectionTitle",
    "collectionUrl",
  ]);
  if (exact.kind === "failure") {
    return exact;
  }

  const playback = playbackProperty(exact.value);
  const itemId = nonEmptyStringProperty(exact.value, "itemId");
  const title = nonEmptyStringProperty(exact.value, "title");
  const itemUrl = httpsUrlProperty(exact.value, "itemUrl");
  const artworkUrl = artworkUrlProperty(
    exact.value,
    "artworkUrl",
    applicationUrl,
  );
  const creators = trackCreatorsProperty(exact.value);
  const collectionId = nonEmptyStringProperty(exact.value, "collectionId");
  const collectionTitle = nonEmptyStringProperty(
    exact.value,
    "collectionTitle",
  );
  const collectionUrl = httpsUrlProperty(exact.value, "collectionUrl");
  if (
    playback.kind === "failure" ||
    itemId.kind === "failure" ||
    title.kind === "failure" ||
    itemUrl.kind === "failure" ||
    artworkUrl.kind === "failure" ||
    creators.kind === "failure" ||
    collectionId.kind === "failure" ||
    collectionTitle.kind === "failure" ||
    collectionUrl.kind === "failure"
  ) {
    return invalidControl();
  }

  return succeeded({
    kind: "set-track",
    playback: playback.value,
    itemId: itemId.value,
    title: title.value,
    itemUrl: itemUrl.value,
    artworkUrl: artworkUrl.value,
    creators: creators.value,
    collectionId: collectionId.value,
    collectionTitle: collectionTitle.value,
    collectionUrl: collectionUrl.value,
  });
}

function parseEpisodeCommand(
  source: ParsedObject,
  applicationUrl: URL,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, [
    "kind",
    "playback",
    "itemId",
    "title",
    "itemUrl",
    "artworkUrl",
    "showId",
    "showTitle",
    "publisher",
    "showUrl",
  ]);
  if (exact.kind === "failure") {
    return exact;
  }

  const playback = playbackProperty(exact.value);
  const itemId = nonEmptyStringProperty(exact.value, "itemId");
  const title = nonEmptyStringProperty(exact.value, "title");
  const itemUrl = httpsUrlProperty(exact.value, "itemUrl");
  const artworkUrl = artworkUrlProperty(
    exact.value,
    "artworkUrl",
    applicationUrl,
  );
  const showId = nonEmptyStringProperty(exact.value, "showId");
  const showTitle = nonEmptyStringProperty(exact.value, "showTitle");
  const publisher = nonEmptyStringProperty(exact.value, "publisher");
  const showUrl = httpsUrlProperty(exact.value, "showUrl");
  if (
    playback.kind === "failure" ||
    itemId.kind === "failure" ||
    title.kind === "failure" ||
    itemUrl.kind === "failure" ||
    artworkUrl.kind === "failure" ||
    showId.kind === "failure" ||
    showTitle.kind === "failure" ||
    publisher.kind === "failure" ||
    showUrl.kind === "failure"
  ) {
    return invalidControl();
  }

  return succeeded({
    kind: "set-episode",
    playback: playback.value,
    itemId: itemId.value,
    title: title.value,
    itemUrl: itemUrl.value,
    artworkUrl: artworkUrl.value,
    showId: showId.value,
    showTitle: showTitle.value,
    publisher: publisher.value,
    showUrl: showUrl.value,
  });
}

function parseUnsupportedCommand(
  source: ParsedObject,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "reason"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const reason = nonEmptyStringProperty(exact.value, "reason");
  if (reason.kind === "failure") {
    return reason;
  }

  switch (reason.value) {
    case "advertisement":
    case "local-item":
    case "unknown-item-type":
      return succeeded({ kind: "set-unsupported", reason: reason.value });
    default:
      return invalidControl();
  }
}

function parseProviderFailureCommand(
  source: ParsedObject,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "failure"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const failureValue = dataProperty(exact.value, "failure");
  if (failureValue.kind === "failure") {
    return failureValue;
  }

  const failure = parseProviderFailure(failureValue.value);
  if (failure.kind === "failure") {
    return failure;
  }

  return succeeded({ kind: "set-provider-failure", failure: failure.value });
}

function parseProviderFailure(
  input: unknown,
): Result<FakeProviderFailure, FakeControlParseFailure> {
  const source = objectValue(input);
  if (source.kind === "failure") {
    return source;
  }

  const kind = nonEmptyStringProperty(source.value, "kind");
  if (kind.kind === "failure") {
    return kind;
  }

  switch (kind.value) {
    case "malformed-response":
    case "network-failure":
    case "permission-denied":
    case "unauthorized": {
      const exact = exactObject(source.value, ["kind"]);
      return exact.kind === "failure" ? exact : succeeded({ kind: kind.value });
    }
    case "rate-limited":
      return parseRateLimitedFailure(source.value);
    case "server-failure":
      return parseStatusFailure(source.value, "server-failure", 500, 599);
    case "unexpected-response":
      return parseStatusFailure(source.value, "unexpected-response", 100, 599);
    default:
      return invalidControl();
  }
}

function parseRateLimitedFailure(
  source: ParsedObject,
): Result<FakeProviderFailure, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "retryAfterMilliseconds"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const retryAfter = dataProperty(exact.value, "retryAfterMilliseconds");
  if (retryAfter.kind === "failure") {
    return retryAfter;
  }

  if (retryAfter.value === null) {
    return succeeded({ kind: "rate-limited", retryAfterMilliseconds: null });
  }

  if (
    typeof retryAfter.value !== "number" ||
    !Number.isSafeInteger(retryAfter.value) ||
    retryAfter.value < 0 ||
    retryAfter.value > maximumPlatformTimerDelayMilliseconds
  ) {
    return invalidControl();
  }

  return succeeded({
    kind: "rate-limited",
    retryAfterMilliseconds: retryAfter.value,
  });
}

function parseStatusFailure(
  source: ParsedObject,
  kind: "server-failure" | "unexpected-response",
  minimum: number,
  maximum: number,
): Result<FakeProviderFailure, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "status"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const status = dataProperty(exact.value, "status");
  if (
    status.kind === "failure" ||
    typeof status.value !== "number" ||
    !Number.isSafeInteger(status.value) ||
    status.value < minimum ||
    status.value > maximum
  ) {
    return invalidControl();
  }

  return succeeded({ kind, status: status.value });
}

function parseFatalCommand(
  source: ParsedObject,
): Result<FakeControlCommand, FakeControlParseFailure> {
  const exact = exactObject(source, ["kind", "reason"]);
  if (exact.kind === "failure") {
    return exact;
  }

  const reason = nonEmptyStringProperty(exact.value, "reason");
  if (
    reason.kind === "failure" ||
    (reason.value !== "browser-capability-unavailable" &&
      reason.value !== "configuration-unavailable")
  ) {
    return invalidControl();
  }

  return succeeded({ kind: "set-fatal", reason: reason.value });
}

function trackCreatorsProperty(
  source: ParsedObject,
): Result<ReadonlyArray<FakeTrackCreator>, FakeControlParseFailure> {
  const value = dataProperty(source, "creators");
  if (
    value.kind === "failure" ||
    !Array.isArray(value.value) ||
    value.value.length === 0
  ) {
    return invalidControl();
  }

  const creators: FakeTrackCreator[] = [];
  for (const candidate of value.value) {
    const exact = exactObject(candidate, ["creatorId", "name", "url"]);
    if (exact.kind === "failure") {
      return exact;
    }

    const creatorId = nonEmptyStringProperty(exact.value, "creatorId");
    const name = nonEmptyStringProperty(exact.value, "name");
    const url = httpsUrlProperty(exact.value, "url");
    if (
      creatorId.kind === "failure" ||
      name.kind === "failure" ||
      url.kind === "failure"
    ) {
      return invalidControl();
    }

    creators.push({
      creatorId: creatorId.value,
      name: name.value,
      url: url.value,
    });
  }

  return succeeded(creators);
}

function playbackProperty(
  source: ParsedObject,
): Result<FakePlaybackMode, FakeControlParseFailure> {
  const playback = nonEmptyStringProperty(source, "playback");
  if (
    playback.kind === "failure" ||
    (playback.value !== "paused" && playback.value !== "playing")
  ) {
    return invalidControl();
  }

  return succeeded(playback.value);
}

function httpsUrlProperty(
  source: ParsedObject,
  name: string,
): Result<string, FakeControlParseFailure> {
  const value = nonEmptyStringProperty(source, name);
  if (value.kind === "failure") {
    return value;
  }

  try {
    const url = new URL(value.value);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
      ? succeeded(url.toString())
      : invalidControl();
  } catch {
    return invalidControl();
  }
}

function artworkUrlProperty(
  source: ParsedObject,
  name: string,
  applicationUrl: URL,
): Result<string | null, FakeControlParseFailure> {
  const value = dataProperty(source, name);
  if (value.kind === "failure") {
    return value;
  }

  if (value.value === null) {
    return succeeded(null);
  }

  if (typeof value.value !== "string" || value.value.trim().length === 0) {
    return invalidControl();
  }

  try {
    const url = new URL(value.value, applicationUrl);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const isAllowedOrigin =
      url.origin === applicationUrl.origin || url.protocol === "https:";
    return isHttp &&
      isAllowedOrigin &&
      url.username === "" &&
      url.password === ""
      ? succeeded(url.toString())
      : invalidControl();
  } catch {
    return invalidControl();
  }
}

function nonEmptyStringProperty(
  source: ParsedObject,
  name: string,
): Result<string, FakeControlParseFailure> {
  const value = dataProperty(source, name);
  return value.kind === "success" &&
    typeof value.value === "string" &&
    value.value.trim().length > 0
    ? succeeded(value.value)
    : invalidControl();
}

function exactObject(
  input: unknown,
  fields: ReadonlyArray<string>,
): Result<ParsedObject, FakeControlParseFailure> {
  const source = objectValue(input);
  if (source.kind === "failure") {
    return source;
  }

  const names = Object.getOwnPropertyNames(source.value);
  if (
    names.length !== fields.length ||
    names.some((name): boolean => !fields.includes(name)) ||
    Object.getOwnPropertySymbols(source.value).length !== 0
  ) {
    return invalidControl();
  }

  return source;
}

function objectValue(
  input: unknown,
): Result<ParsedObject, FakeControlParseFailure> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? succeeded(input)
    : invalidControl();
}

function dataProperty(
  source: ParsedObject,
  name: string,
): Result<unknown, FakeControlParseFailure> {
  const descriptor = Object.getOwnPropertyDescriptor(source, name);
  return descriptor !== undefined && "value" in descriptor
    ? succeeded(descriptor.value)
    : invalidControl();
}

function succeeded<Value>(value: Value): Result<Value, never> {
  return { kind: "success", value };
}

function invalidControl(): Result<never, FakeControlParseFailure> {
  return {
    kind: "failure",
    error: { kind: "invalid-fake-control" },
  };
}
