import {
  AuthorizationAttemptTimestamp,
  authorizationAttemptLifetimeMilliseconds,
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
  parseDisplayReturnConfiguration,
  PendingAuthorizationAttempt,
  PkceState,
  PkceStateCandidate,
  PkceVerifier,
  type DisplayReturnConfiguration,
} from "./pkce.ts";
import { SpotifyRefreshToken } from "./token.ts";

type ParseSuccess<Value> = {
  readonly kind: "success";
  readonly value: Value;
};

type ParseFailure = {
  readonly kind: "failure";
};

type ParseResult<Value> = ParseSuccess<Value> | ParseFailure;

const databaseName = "obs-nowplaying-browser-auth";
const databaseVersion = 1;
const pendingAuthorizationAttemptsStoreName = "pending-authorization-attempts";
const spotifyConnectionsStoreName = "spotify-connections";
const spotifyProvider = "spotify";

export type SpotifyPendingAuthorizationAttemptConsumeOptions = {
  readonly state: PkceStateCandidate;
  readonly observedAt: AuthorizationAttemptTimestamp;
};

export type SpotifyPendingAuthorizationAttemptConsumeResult =
  | {
      readonly kind: "consumed";
      readonly attempt: PendingAuthorizationAttempt;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "expired"
        | "invalid-stored-attempt"
        | "missing-attempt"
        | "provider-mismatch"
        | "state-mismatch";
    };

export class SpotifyRefreshTokenConnection {
  private readonly connectionRefreshToken: SpotifyRefreshToken;

  private constructor(refreshToken: SpotifyRefreshToken) {
    this.connectionRefreshToken = refreshToken;
    Object.freeze(this);
  }

  static create(
    refreshToken: SpotifyRefreshToken,
  ): SpotifyRefreshTokenConnection {
    return new SpotifyRefreshTokenConnection(refreshToken);
  }

  get refreshToken(): SpotifyRefreshToken {
    return this.connectionRefreshToken;
  }
}

export type SpotifyRefreshTokenConnectionReadResult =
  | {
      readonly kind: "connection-found";
      readonly connection: SpotifyRefreshTokenConnection;
    }
  | {
      readonly kind: "connection-missing";
    };

export type SpotifyAuthStoragePort = {
  readonly savePendingAuthorizationAttempt: (
    attempt: PendingAuthorizationAttempt,
  ) => Promise<void>;
  readonly consumePendingAuthorizationAttempt: (
    options: SpotifyPendingAuthorizationAttemptConsumeOptions,
  ) => Promise<SpotifyPendingAuthorizationAttemptConsumeResult>;
  readonly readSpotifyRefreshTokenConnection: () => Promise<SpotifyRefreshTokenConnectionReadResult>;
  readonly saveSpotifyRefreshTokenConnection: (
    connection: SpotifyRefreshTokenConnection,
  ) => Promise<void>;
  readonly deleteSpotifyRefreshTokenConnection: () => Promise<void>;
  readonly clearSpotifyAuthorization: () => Promise<void>;
};

export type IndexedDbAuthorizationStoreName =
  | typeof pendingAuthorizationAttemptsStoreName
  | typeof spotifyConnectionsStoreName;

export type IndexedDbAuthorizationStorageKey =
  typeof spotifyProvider | readonly [typeof spotifyProvider, string];

export type IndexedDbRequestHandlers = {
  readonly success: () => void;
  readonly failure: () => void;
};

export type IndexedDbRequestCompletionPort<Value> = {
  readonly value: () => Value;
  readonly error: () => unknown;
  readonly subscribe: (handlers: IndexedDbRequestHandlers) => void;
};

export type IndexedDbTransactionHandlers = {
  readonly complete: () => void;
  readonly failure: () => void;
};

export type IndexedDbTransactionCompletionPort = {
  readonly error: () => unknown;
  readonly subscribe: (handlers: IndexedDbTransactionHandlers) => void;
};

export type IndexedDbAuthorizationObjectStorePort = {
  readonly put: (value: object, key: IndexedDbAuthorizationStorageKey) => void;
  readonly get: (
    key: IndexedDbAuthorizationStorageKey,
  ) => IndexedDbRequestCompletionPort<unknown>;
  readonly delete: (key: IndexedDbAuthorizationStorageKey) => void;
  readonly clear: () => void;
};

export type IndexedDbAuthorizationTransactionPort =
  IndexedDbTransactionCompletionPort & {
    readonly objectStore: (
      storeName: IndexedDbAuthorizationStoreName,
    ) => IndexedDbAuthorizationObjectStorePort;
  };

export type IndexedDbAuthorizationDatabasePort = {
  readonly hasObjectStore: (
    storeName: IndexedDbAuthorizationStoreName,
  ) => boolean;
  readonly createObjectStore: (
    storeName: IndexedDbAuthorizationStoreName,
  ) => void;
  readonly transaction: (
    storeNames:
      | IndexedDbAuthorizationStoreName
      | ReadonlyArray<IndexedDbAuthorizationStoreName>,
  ) => IndexedDbAuthorizationTransactionPort;
  readonly subscribeVersionChange: (handler: () => void) => void;
  readonly close: () => void;
};

export type IndexedDbAuthorizationOpenOptions = {
  readonly name: string;
  readonly version: number;
  readonly upgrade: (database: IndexedDbAuthorizationDatabasePort) => void;
};

export type IndexedDbAuthorizationPort = {
  readonly open: (
    options: IndexedDbAuthorizationOpenOptions,
  ) => IndexedDbRequestCompletionPort<IndexedDbAuthorizationDatabasePort>;
};

export function createIndexedDbSpotifyAuthStorage(
  indexedDb: IndexedDbAuthorizationPort,
): SpotifyAuthStoragePort {
  const database = openAuthorizationDatabase(indexedDb);
  const storage: SpotifyAuthStoragePort = {
    async savePendingAuthorizationAttempt(
      attempt: PendingAuthorizationAttempt,
    ): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(
        pendingAuthorizationAttemptsStoreName,
      );
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        const store = transaction.objectStore(
          pendingAuthorizationAttemptsStoreName,
        );
        store.put(
          storedPendingAuthorizationAttempt(attempt),
          pendingAttemptStorageKey(attempt.state.toStorageValue()),
        );
      } finally {
        await completion;
      }
    },

    async consumePendingAuthorizationAttempt(
      options: SpotifyPendingAuthorizationAttemptConsumeOptions,
    ): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
      const openedDatabase = await database;
      return consumeStoredPendingAuthorizationAttempt(openedDatabase, options);
    },

    async readSpotifyRefreshTokenConnection(): Promise<SpotifyRefreshTokenConnectionReadResult> {
      const openedDatabase = await database;
      return readStoredSpotifyRefreshTokenConnection(openedDatabase);
    },

    async saveSpotifyRefreshTokenConnection(
      connection: SpotifyRefreshTokenConnection,
    ): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(
        spotifyConnectionsStoreName,
      );
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        const store = transaction.objectStore(spotifyConnectionsStoreName);
        store.put(
          storedSpotifyRefreshTokenConnection(connection),
          spotifyProvider,
        );
      } finally {
        await completion;
      }
    },

    async deleteSpotifyRefreshTokenConnection(): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(
        spotifyConnectionsStoreName,
      );
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        const store = transaction.objectStore(spotifyConnectionsStoreName);
        store.delete(spotifyProvider);
      } finally {
        await completion;
      }
    },

    async clearSpotifyAuthorization(): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction([
        pendingAuthorizationAttemptsStoreName,
        spotifyConnectionsStoreName,
      ]);
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        transaction.objectStore(pendingAuthorizationAttemptsStoreName).clear();
        transaction.objectStore(spotifyConnectionsStoreName).clear();
      } finally {
        await completion;
      }
    },
  };

  return Object.freeze(storage);
}

function waitForIndexedDbRequest<Value>(
  request: IndexedDbRequestCompletionPort<Value>,
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    request.subscribe(
      Object.freeze({
        success(): void {
          resolve(request.value());
        },
        failure(): void {
          reject(indexedDbFailure("request", request.error()));
        },
      }),
    );
  });
}

function waitForIndexedDbTransaction(
  transaction: IndexedDbTransactionCompletionPort,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.subscribe(
      Object.freeze({
        complete(): void {
          resolve();
        },
        failure(): void {
          reject(indexedDbFailure("transaction", transaction.error()));
        },
      }),
    );
  });
}

type StoredPendingAuthorizationAttempt = {
  readonly provider: "spotify";
  readonly state: string;
  readonly verifier: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly returnTo: {
    readonly width: number;
    readonly setup: boolean;
  };
};

type StoredSpotifyRefreshTokenConnection = {
  readonly provider: "spotify";
  readonly refreshToken: string;
};

type ParsedStoredPendingAuthorizationAttempt =
  | {
      readonly kind: "success";
      readonly value: PendingAuthorizationAttempt;
    }
  | {
      readonly kind: "failure";
      readonly result: SpotifyPendingAuthorizationAttemptConsumeResult;
    };

type PendingAuthorizationAttemptConsumeState =
  | {
      readonly kind: "waiting";
    }
  | {
      readonly kind: "ready";
      readonly result: SpotifyPendingAuthorizationAttemptConsumeResult;
    };

type SpotifyRefreshTokenConnectionReadState =
  | {
      readonly kind: "waiting";
    }
  | {
      readonly kind: "ready";
      readonly result: SpotifyRefreshTokenConnectionReadResult;
    };

async function openAuthorizationDatabase(
  indexedDb: IndexedDbAuthorizationPort,
): Promise<IndexedDbAuthorizationDatabasePort> {
  const request = indexedDb.open(
    Object.freeze({
      name: databaseName,
      version: databaseVersion,
      upgrade(database: IndexedDbAuthorizationDatabasePort): void {
        if (!database.hasObjectStore(pendingAuthorizationAttemptsStoreName)) {
          database.createObjectStore(pendingAuthorizationAttemptsStoreName);
        }

        if (!database.hasObjectStore(spotifyConnectionsStoreName)) {
          database.createObjectStore(spotifyConnectionsStoreName);
        }
      },
    }),
  );

  const database = await waitForIndexedDbRequest(request);
  database.subscribeVersionChange((): void => {
    database.close();
  });

  return database;
}

function consumeStoredPendingAuthorizationAttempt(
  database: IndexedDbAuthorizationDatabasePort,
  options: SpotifyPendingAuthorizationAttemptConsumeOptions,
): Promise<SpotifyPendingAuthorizationAttemptConsumeResult> {
  return new Promise<SpotifyPendingAuthorizationAttemptConsumeResult>(
    (resolve, reject) => {
      const transaction = database.transaction(
        pendingAuthorizationAttemptsStoreName,
      );
      const store = transaction.objectStore(
        pendingAuthorizationAttemptsStoreName,
      );
      const key = pendingAttemptStorageKey(options.state.toStorageKey());
      let state: PendingAuthorizationAttemptConsumeState = Object.freeze({
        kind: "waiting",
      });

      transaction.subscribe(
        Object.freeze({
          complete(): void {
            if (state.kind === "waiting") {
              reject(
                new Error(
                  "IndexedDB pending authorization transaction completed without a result.",
                ),
              );
              return;
            }

            resolve(state.result);
          },
          failure(): void {
            reject(indexedDbFailure("transaction", transaction.error()));
          },
        }),
      );

      const request = store.get(key);
      request.subscribe(
        Object.freeze({
          success(): void {
            const storedAttempt = request.value();
            if (storedAttempt === undefined) {
              state = frozenPendingAuthorizationAttemptConsumeState(
                frozenRejectedPendingAttempt("missing-attempt"),
              );
              return;
            }

            store.delete(key);
            const parsedAttempt =
              parseStoredPendingAuthorizationAttempt(storedAttempt);
            if (parsedAttempt.kind === "failure") {
              state = frozenPendingAuthorizationAttemptConsumeState(
                parsedAttempt.result,
              );
              return;
            }

            if (
              !matchesPendingAuthorizationAttemptState({
                pending: parsedAttempt.value,
                candidate: options.state,
              })
            ) {
              state = frozenPendingAuthorizationAttemptConsumeState(
                frozenRejectedPendingAttempt("state-mismatch"),
              );
              return;
            }

            if (
              isPendingAuthorizationAttemptExpired({
                pending: parsedAttempt.value,
                observedAt: options.observedAt,
              })
            ) {
              state = frozenPendingAuthorizationAttemptConsumeState(
                frozenRejectedPendingAttempt("expired"),
              );
              return;
            }

            state = frozenPendingAuthorizationAttemptConsumeState(
              frozenConsumedPendingAttempt(parsedAttempt.value),
            );
          },
          failure(): void {
            reject(indexedDbFailure("request", request.error()));
          },
        }),
      );
    },
  );
}

function readStoredSpotifyRefreshTokenConnection(
  database: IndexedDbAuthorizationDatabasePort,
): Promise<SpotifyRefreshTokenConnectionReadResult> {
  return new Promise<SpotifyRefreshTokenConnectionReadResult>(
    (resolve, reject) => {
      const transaction = database.transaction(spotifyConnectionsStoreName);
      const store = transaction.objectStore(spotifyConnectionsStoreName);
      let state: SpotifyRefreshTokenConnectionReadState = Object.freeze({
        kind: "waiting",
      });

      transaction.subscribe(
        Object.freeze({
          complete(): void {
            if (state.kind === "waiting") {
              reject(
                new Error(
                  "IndexedDB Spotify connection transaction completed without a result.",
                ),
              );
              return;
            }

            resolve(state.result);
          },
          failure(): void {
            reject(indexedDbFailure("transaction", transaction.error()));
          },
        }),
      );

      const request = store.get(spotifyProvider);
      request.subscribe(
        Object.freeze({
          success(): void {
            const storedConnection = request.value();
            if (storedConnection === undefined) {
              state = frozenSpotifyRefreshTokenConnectionReadState(
                frozenMissingConnection(),
              );
              return;
            }

            const connection =
              parseStoredSpotifyRefreshTokenConnection(storedConnection);
            if (connection.kind === "failure") {
              store.delete(spotifyProvider);
              state = frozenSpotifyRefreshTokenConnectionReadState(
                frozenMissingConnection(),
              );
              return;
            }

            state = frozenSpotifyRefreshTokenConnectionReadState(
              frozenFoundConnection(connection.value),
            );
          },
          failure(): void {
            reject(indexedDbFailure("request", request.error()));
          },
        }),
      );
    },
  );
}

export function createNativeIndexedDbAuthorizationPort(
  indexedDb: IDBFactory,
): IndexedDbAuthorizationPort {
  const port: IndexedDbAuthorizationPort = {
    open(
      options: IndexedDbAuthorizationOpenOptions,
    ): IndexedDbRequestCompletionPort<IndexedDbAuthorizationDatabasePort> {
      const request = indexedDb.open(options.name, options.version);
      request.onupgradeneeded = (): void => {
        options.upgrade(
          nativeIndexedDbAuthorizationDatabasePort(request.result),
        );
      };

      return nativeIndexedDbAuthorizationOpenRequestCompletionPort(request);
    },
  };

  return Object.freeze(port);
}

function nativeIndexedDbAuthorizationOpenRequestCompletionPort(
  request: IDBOpenDBRequest,
): IndexedDbRequestCompletionPort<IndexedDbAuthorizationDatabasePort> {
  const port: IndexedDbRequestCompletionPort<IndexedDbAuthorizationDatabasePort> =
    {
      value(): IndexedDbAuthorizationDatabasePort {
        return nativeIndexedDbAuthorizationDatabasePort(request.result);
      },
      error(): unknown {
        return request.error;
      },
      subscribe(handlers: IndexedDbRequestHandlers): void {
        request.onsuccess = (): void => {
          handlers.success();
        };
        request.onerror = (): void => {
          handlers.failure();
        };
      },
    };

  return Object.freeze(port);
}

function nativeIndexedDbAuthorizationDatabasePort(
  database: IDBDatabase,
): IndexedDbAuthorizationDatabasePort {
  const port: IndexedDbAuthorizationDatabasePort = {
    hasObjectStore(storeName: IndexedDbAuthorizationStoreName): boolean {
      return database.objectStoreNames.contains(storeName);
    },
    createObjectStore(storeName: IndexedDbAuthorizationStoreName): void {
      database.createObjectStore(storeName);
    },
    transaction(
      storeNames:
        | IndexedDbAuthorizationStoreName
        | ReadonlyArray<IndexedDbAuthorizationStoreName>,
    ): IndexedDbAuthorizationTransactionPort {
      return nativeIndexedDbAuthorizationTransactionPort(
        database.transaction(
          nativeIndexedDbAuthorizationStoreNames(storeNames),
          "readwrite",
        ),
      );
    },
    subscribeVersionChange(handler: () => void): void {
      database.onversionchange = (): void => {
        handler();
      };
    },
    close(): void {
      database.close();
    },
  };

  return Object.freeze(port);
}

function nativeIndexedDbAuthorizationTransactionPort(
  transaction: IDBTransaction,
): IndexedDbAuthorizationTransactionPort {
  const port: IndexedDbAuthorizationTransactionPort = {
    error(): unknown {
      return transaction.error;
    },
    subscribe(handlers: IndexedDbTransactionHandlers): void {
      transaction.oncomplete = (): void => {
        handlers.complete();
      };
      transaction.onerror = (): void => {
        handlers.failure();
      };
      transaction.onabort = (): void => {
        handlers.failure();
      };
    },
    objectStore(
      storeName: IndexedDbAuthorizationStoreName,
    ): IndexedDbAuthorizationObjectStorePort {
      return nativeIndexedDbAuthorizationObjectStorePort(
        transaction.objectStore(storeName),
      );
    },
  };

  return Object.freeze(port);
}

function nativeIndexedDbAuthorizationObjectStorePort(
  store: IDBObjectStore,
): IndexedDbAuthorizationObjectStorePort {
  const port: IndexedDbAuthorizationObjectStorePort = {
    put(value: object, key: IndexedDbAuthorizationStorageKey): void {
      store.put(value, nativeIndexedDbAuthorizationStorageKey(key));
    },
    get(
      key: IndexedDbAuthorizationStorageKey,
    ): IndexedDbRequestCompletionPort<unknown> {
      const request: IDBRequest<unknown> = store.get(
        nativeIndexedDbAuthorizationStorageKey(key),
      );

      return nativeIndexedDbRequestCompletionPort(request);
    },
    delete(key: IndexedDbAuthorizationStorageKey): void {
      store.delete(nativeIndexedDbAuthorizationStorageKey(key));
    },
    clear(): void {
      store.clear();
    },
  };

  return Object.freeze(port);
}

function nativeIndexedDbRequestCompletionPort(
  request: IDBRequest<unknown>,
): IndexedDbRequestCompletionPort<unknown> {
  const port: IndexedDbRequestCompletionPort<unknown> = {
    value(): unknown {
      return request.result;
    },
    error(): unknown {
      return request.error;
    },
    subscribe(handlers: IndexedDbRequestHandlers): void {
      request.onsuccess = (): void => {
        handlers.success();
      };
      request.onerror = (): void => {
        handlers.failure();
      };
    },
  };

  return Object.freeze(port);
}

function nativeIndexedDbAuthorizationStoreNames(
  storeNames:
    | IndexedDbAuthorizationStoreName
    | ReadonlyArray<IndexedDbAuthorizationStoreName>,
): string | Array<string> {
  if (typeof storeNames === "string") {
    return storeNames;
  }

  return [...storeNames];
}

function nativeIndexedDbAuthorizationStorageKey(
  key: IndexedDbAuthorizationStorageKey,
): IDBValidKey {
  if (typeof key === "string") {
    return key;
  }

  return [key[0], key[1]];
}

function storedPendingAuthorizationAttempt(
  attempt: PendingAuthorizationAttempt,
): StoredPendingAuthorizationAttempt {
  const returnTo = storedDisplayReturnConfiguration(attempt.returnTo);
  const record: StoredPendingAuthorizationAttempt = {
    provider: spotifyProvider,
    state: attempt.state.toStorageValue(),
    verifier: attempt.verifier.toStorageValue(),
    createdAt: attempt.createdAt.toEpochMilliseconds(),
    expiresAt: attempt.expiresAt.toEpochMilliseconds(),
    returnTo,
  };

  return Object.freeze(record);
}

function storedDisplayReturnConfiguration(
  returnTo: DisplayReturnConfiguration,
): StoredPendingAuthorizationAttempt["returnTo"] {
  const configuration: StoredPendingAuthorizationAttempt["returnTo"] = {
    width: Number(returnTo.width.toQueryParameter()),
    setup: returnTo.setup.kind === "setup-requested",
  };

  return Object.freeze(configuration);
}

function storedSpotifyRefreshTokenConnection(
  connection: SpotifyRefreshTokenConnection,
): StoredSpotifyRefreshTokenConnection {
  const record: StoredSpotifyRefreshTokenConnection = {
    provider: spotifyProvider,
    refreshToken: connection.refreshToken.toStorageValue(),
  };

  return Object.freeze(record);
}

function parseStoredPendingAuthorizationAttempt(
  input: unknown,
): ParsedStoredPendingAuthorizationAttempt {
  const source = parseStoredObject(input);
  if (source.kind === "failure") {
    return frozenInvalidStoredPendingAttempt();
  }

  if (
    !hasOnlyOwnFields(source.value, [
      "createdAt",
      "expiresAt",
      "provider",
      "returnTo",
      "state",
      "verifier",
    ])
  ) {
    return frozenInvalidStoredPendingAttempt();
  }

  const provider = readStoredDataProperty(source.value, "provider");
  if (provider.kind === "failure") {
    return frozenInvalidStoredPendingAttempt();
  }

  if (provider.value !== spotifyProvider) {
    return frozenProviderMismatchPendingAttempt();
  }

  const state = readStoredDataProperty(source.value, "state");
  const verifier = readStoredDataProperty(source.value, "verifier");
  const createdAt = readStoredDataProperty(source.value, "createdAt");
  const expiresAt = readStoredDataProperty(source.value, "expiresAt");
  const returnTo = readStoredDataProperty(source.value, "returnTo");
  if (
    state.kind === "failure" ||
    verifier.kind === "failure" ||
    createdAt.kind === "failure" ||
    expiresAt.kind === "failure" ||
    returnTo.kind === "failure"
  ) {
    return frozenInvalidStoredPendingAttempt();
  }

  const parsedState = PkceState.parse(state.value);
  const parsedVerifier = PkceVerifier.parse(verifier.value);
  const parsedCreatedAt = AuthorizationAttemptTimestamp.parse(createdAt.value);
  const parsedExpiresAt = AuthorizationAttemptTimestamp.parse(expiresAt.value);
  const parsedReturnTo = parseDisplayReturnConfiguration(returnTo.value);
  if (
    parsedState.kind === "failure" ||
    parsedVerifier.kind === "failure" ||
    parsedCreatedAt.kind === "failure" ||
    parsedExpiresAt.kind === "failure" ||
    parsedReturnTo.kind === "failure"
  ) {
    return frozenInvalidStoredPendingAttempt();
  }

  if (
    parsedCreatedAt.value.toEpochMilliseconds() >
    Number.MAX_SAFE_INTEGER - authorizationAttemptLifetimeMilliseconds
  ) {
    return frozenInvalidStoredPendingAttempt();
  }

  const attempt = PendingAuthorizationAttempt.create({
    state: parsedState.value,
    verifier: parsedVerifier.value,
    createdAt: parsedCreatedAt.value,
    returnTo: parsedReturnTo.value,
  });
  if (
    attempt.expiresAt.toEpochMilliseconds() !==
    parsedExpiresAt.value.toEpochMilliseconds()
  ) {
    return frozenInvalidStoredPendingAttempt();
  }

  const result: ParsedStoredPendingAuthorizationAttempt = {
    kind: "success",
    value: attempt,
  };

  return Object.freeze(result);
}

function parseStoredSpotifyRefreshTokenConnection(
  input: unknown,
): ParseResult<SpotifyRefreshTokenConnection> {
  const source = parseStoredObject(input);
  if (source.kind === "failure") {
    return frozenParseFailure();
  }

  if (!hasOnlyOwnFields(source.value, ["provider", "refreshToken"])) {
    return frozenParseFailure();
  }

  const provider = readStoredDataProperty(source.value, "provider");
  const refreshToken = readStoredDataProperty(source.value, "refreshToken");
  if (provider.kind === "failure" || refreshToken.kind === "failure") {
    return frozenParseFailure();
  }

  if (provider.value !== spotifyProvider) {
    return frozenParseFailure();
  }

  const parsedRefreshToken = SpotifyRefreshToken.parse(refreshToken.value);
  if (parsedRefreshToken.kind === "failure") {
    return frozenParseFailure();
  }

  return succeeded(
    SpotifyRefreshTokenConnection.create(parsedRefreshToken.value),
  );
}

function parseStoredObject(input: unknown): ParseResult<object> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return frozenParseFailure();
  }

  return succeeded(input);
}

function hasOnlyOwnFields(
  source: object,
  allowedFields: ReadonlyArray<string>,
): boolean {
  for (const fieldName of Object.getOwnPropertyNames(source)) {
    if (!allowedFields.includes(fieldName)) {
      return false;
    }
  }

  return Object.getOwnPropertySymbols(source).length === 0;
}

function readStoredDataProperty(
  source: object,
  fieldName: string,
): ParseResult<unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(source, fieldName);
  if (descriptor === undefined || !("value" in descriptor)) {
    return frozenParseFailure();
  }

  return succeeded(descriptor.value);
}

function pendingAttemptStorageKey(
  state: string,
): readonly [typeof spotifyProvider, string] {
  const key: [typeof spotifyProvider, string] = [spotifyProvider, state];

  return Object.freeze(key);
}

function indexedDbFailure(
  operation: "request" | "transaction",
  cause: unknown,
): Error {
  return new Error(`IndexedDB ${operation} failed.`, { cause });
}

function frozenConsumedPendingAttempt(
  attempt: PendingAuthorizationAttempt,
): SpotifyPendingAuthorizationAttemptConsumeResult {
  const result: SpotifyPendingAuthorizationAttemptConsumeResult = {
    kind: "consumed",
    attempt,
  };

  return Object.freeze(result);
}

function frozenPendingAuthorizationAttemptConsumeState(
  result: SpotifyPendingAuthorizationAttemptConsumeResult,
): PendingAuthorizationAttemptConsumeState {
  const state: PendingAuthorizationAttemptConsumeState = {
    kind: "ready",
    result,
  };

  return Object.freeze(state);
}

function frozenRejectedPendingAttempt(
  reason: Extract<
    SpotifyPendingAuthorizationAttemptConsumeResult,
    { readonly kind: "rejected" }
  >["reason"],
): SpotifyPendingAuthorizationAttemptConsumeResult {
  const result: SpotifyPendingAuthorizationAttemptConsumeResult = {
    kind: "rejected",
    reason,
  };

  return Object.freeze(result);
}

function frozenInvalidStoredPendingAttempt(): ParsedStoredPendingAuthorizationAttempt {
  const result: ParsedStoredPendingAuthorizationAttempt = {
    kind: "failure",
    result: frozenRejectedPendingAttempt("invalid-stored-attempt"),
  };

  return Object.freeze(result);
}

function frozenProviderMismatchPendingAttempt(): ParsedStoredPendingAuthorizationAttempt {
  const result: ParsedStoredPendingAuthorizationAttempt = {
    kind: "failure",
    result: frozenRejectedPendingAttempt("provider-mismatch"),
  };

  return Object.freeze(result);
}

function frozenFoundConnection(
  connection: SpotifyRefreshTokenConnection,
): SpotifyRefreshTokenConnectionReadResult {
  const result: SpotifyRefreshTokenConnectionReadResult = {
    kind: "connection-found",
    connection,
  };

  return Object.freeze(result);
}

function frozenSpotifyRefreshTokenConnectionReadState(
  result: SpotifyRefreshTokenConnectionReadResult,
): SpotifyRefreshTokenConnectionReadState {
  const state: SpotifyRefreshTokenConnectionReadState = {
    kind: "ready",
    result,
  };

  return Object.freeze(state);
}

function frozenMissingConnection(): SpotifyRefreshTokenConnectionReadResult {
  const result: SpotifyRefreshTokenConnectionReadResult = {
    kind: "connection-missing",
  };

  return Object.freeze(result);
}

function succeeded<Value>(value: Value): ParseSuccess<Value> {
  const result: ParseSuccess<Value> = {
    kind: "success",
    value,
  };

  return Object.freeze(result);
}

function frozenParseFailure(): ParseFailure {
  const result: ParseFailure = {
    kind: "failure",
  };

  return Object.freeze(result);
}
