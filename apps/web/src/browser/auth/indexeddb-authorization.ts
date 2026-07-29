export const pendingAuthorizationAttemptsStoreName =
  "pending-authorization-attempts";
export const spotifyConnectionsStoreName = "spotify-connections";
export const spotifyAuthorizationStorageProvider = "spotify";

export type IndexedDbAuthorizationStoreName =
  | typeof pendingAuthorizationAttemptsStoreName
  | typeof spotifyConnectionsStoreName;

export type IndexedDbAuthorizationStorageKey =
  | typeof spotifyAuthorizationStorageProvider
  | readonly [typeof spotifyAuthorizationStorageProvider, string];

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

  return port;
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

  return port;
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

  return port;
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

  return port;
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

  return port;
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

  return port;
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
