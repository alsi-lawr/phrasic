import type {
  IndexedDbAuthorizationDatabasePort,
  IndexedDbAuthorizationObjectStorePort,
  IndexedDbAuthorizationOpenOptions,
  IndexedDbAuthorizationPort,
  IndexedDbAuthorizationStorageKey,
  IndexedDbAuthorizationStoreName,
  IndexedDbAuthorizationTransactionPort,
  IndexedDbRequestCompletionPort,
  IndexedDbRequestHandlers,
  IndexedDbTransactionHandlers,
} from "../../../browser/auth/storage.ts";

type ControlledAuthorizationIndexedDbRecord = {
  readonly storeName: IndexedDbAuthorizationStoreName;
  readonly key: IndexedDbAuthorizationStorageKey;
  readonly value: unknown;
};

type ControlledAuthorizationIndexedDbOperation =
  | {
      readonly kind: "put";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
    }
  | {
      readonly kind: "get";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
    }
  | {
      readonly kind: "delete";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
    }
  | {
      readonly kind: "clear";
      readonly storeName: IndexedDbAuthorizationStoreName;
    };

type ControlledAuthorizationIndexedDbTransaction = {
  readonly storeNames: ReadonlyArray<IndexedDbAuthorizationStoreName>;
  readonly operations: ReadonlyArray<ControlledAuthorizationIndexedDbOperation>;
};

type ControlledAuthorizationIndexedDbFixture = {
  readonly port: IndexedDbAuthorizationPort;
  readonly seedRecord: (record: ControlledAuthorizationIndexedDbRecord) => void;
  readonly records: (
    storeName: IndexedDbAuthorizationStoreName,
  ) => ReadonlyArray<ControlledAuthorizationIndexedDbRecord>;
  readonly createdStoreNames: () => ReadonlyArray<IndexedDbAuthorizationStoreName>;
  readonly committedTransactions: () => ReadonlyArray<ControlledAuthorizationIndexedDbTransaction>;
  readonly resetCommittedTransactions: () => void;
  readonly failNextOpenRequest: (error: Error) => void;
  readonly failNextGetRequest: (error: Error) => void;
  readonly failNextTransaction: (error: Error) => void;
};

type StoredAuthorizationRecord = {
  readonly key: IndexedDbAuthorizationStorageKey;
  readonly value: unknown;
};

type StoreRecords = Map<string, StoredAuthorizationRecord>;

type StoredAuthorizationRecords = Map<
  IndexedDbAuthorizationStoreName,
  StoreRecords
>;

type ControlledRequest<Value> = {
  readonly port: IndexedDbRequestCompletionPort<Value>;
  readonly succeed: (value: Value) => void;
  readonly fail: (error: Error) => void;
};

type QueuedAuthorizationOperation =
  | {
      readonly kind: "put";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
      readonly value: object;
    }
  | {
      readonly kind: "get";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
      readonly request: ControlledRequest<unknown>;
    }
  | {
      readonly kind: "delete";
      readonly storeName: IndexedDbAuthorizationStoreName;
      readonly key: IndexedDbAuthorizationStorageKey;
    }
  | {
      readonly kind: "clear";
      readonly storeName: IndexedDbAuthorizationStoreName;
    };

type RequestState<Value> =
  | {
      readonly kind: "waiting";
      readonly handlers: IndexedDbRequestHandlers | undefined;
    }
  | {
      readonly kind: "succeeded";
      readonly value: Value;
    }
  | {
      readonly kind: "failed";
      readonly error: Error;
    };

type TransactionState =
  | {
      readonly kind: "waiting";
      readonly handlers: IndexedDbTransactionHandlers | undefined;
    }
  | {
      readonly kind: "completed";
    }
  | {
      readonly kind: "failed";
      readonly error: Error;
    };

type TransactionExecution =
  | {
      readonly kind: "success";
    }
  | {
      readonly kind: "failure";
      readonly error: Error;
    };

type ControlledTransaction = {
  readonly port: IndexedDbAuthorizationTransactionPort;
  readonly storeNames: ReadonlyArray<IndexedDbAuthorizationStoreName>;
  readonly execute: (
    records: StoredAuthorizationRecords,
    takeNextGetRequestError: () => Error | undefined,
  ) => TransactionExecution;
  readonly complete: () => void;
  readonly fail: (error: Error) => void;
  readonly snapshot: () => ControlledAuthorizationIndexedDbTransaction;
};

export function createControlledAuthorizationIndexedDbFixture(): ControlledAuthorizationIndexedDbFixture {
  const records = new Map<IndexedDbAuthorizationStoreName, StoreRecords>();
  const createdStoreNames: Array<IndexedDbAuthorizationStoreName> = [];
  const queuedTransactions: Array<ControlledTransaction> = [];
  let committedTransactions: Array<ControlledAuthorizationIndexedDbTransaction> =
    [];
  let nextOpenRequestError: Error | undefined;
  let nextGetRequestError: Error | undefined;
  let nextTransactionError: Error | undefined;
  let opened = false;
  let processingTransactions = false;

  const databasePortContents: IndexedDbAuthorizationDatabasePort = {
    hasObjectStore(storeName: IndexedDbAuthorizationStoreName): boolean {
      return records.has(storeName);
    },
    createObjectStore(storeName: IndexedDbAuthorizationStoreName): void {
      if (records.has(storeName)) {
        throw new Error(`IndexedDB object store already exists: ${storeName}.`);
      }

      records.set(storeName, new Map());
      createdStoreNames.push(storeName);
    },
    transaction(
      storeNames:
        | IndexedDbAuthorizationStoreName
        | ReadonlyArray<IndexedDbAuthorizationStoreName>,
    ): IndexedDbAuthorizationTransactionPort {
      const transaction = createControlledTransaction(
        frozenStoreNames(storeNames),
      );
      for (const storeName of transaction.storeNames) {
        requireStore(records, storeName);
      }

      queuedTransactions.push(transaction);
      scheduleTransactionProcessing();

      return transaction.port;
    },
    subscribeVersionChange(handler: () => void): void {
      void handler;
    },
    close(): void {},
  };
  const databasePort = Object.freeze(databasePortContents);
  const portContents: IndexedDbAuthorizationPort = {
    open(
      options: IndexedDbAuthorizationOpenOptions,
    ): IndexedDbRequestCompletionPort<IndexedDbAuthorizationDatabasePort> {
      const request =
        createControlledRequest<IndexedDbAuthorizationDatabasePort>();
      queueMicrotask((): void => {
        const openRequestError = takeNextOpenRequestError();
        if (openRequestError !== undefined) {
          request.fail(openRequestError);
          return;
        }

        if (!opened) {
          options.upgrade(databasePort);
          opened = true;
        }

        request.succeed(databasePort);
      });

      return request.port;
    },
  };
  const fixture: ControlledAuthorizationIndexedDbFixture = {
    port: Object.freeze(portContents),
    seedRecord(record: ControlledAuthorizationIndexedDbRecord): void {
      validateStoreKey(record.storeName, record.key);
      requireStore(records, record.storeName).set(
        storageKeyId(record.key),
        frozenStoredAuthorizationRecord(record.key, record.value),
      );
    },
    records(
      storeName: IndexedDbAuthorizationStoreName,
    ): ReadonlyArray<ControlledAuthorizationIndexedDbRecord> {
      const snapshot = Array.from(
        requireStore(records, storeName).values(),
        (record) => frozenControlledAuthorizationRecord(storeName, record),
      );

      return Object.freeze(snapshot);
    },
    createdStoreNames(): ReadonlyArray<IndexedDbAuthorizationStoreName> {
      return Object.freeze([...createdStoreNames]);
    },
    committedTransactions(): ReadonlyArray<ControlledAuthorizationIndexedDbTransaction> {
      return Object.freeze([...committedTransactions]);
    },
    resetCommittedTransactions(): void {
      committedTransactions = [];
    },
    failNextOpenRequest(error: Error): void {
      nextOpenRequestError = error;
    },
    failNextGetRequest(error: Error): void {
      nextGetRequestError = error;
    },
    failNextTransaction(error: Error): void {
      nextTransactionError = error;
    },
  };

  return Object.freeze(fixture);

  function scheduleTransactionProcessing(): void {
    if (processingTransactions) {
      return;
    }

    processingTransactions = true;
    queueMicrotask(processNextTransaction);
  }

  function processNextTransaction(): void {
    const transaction = queuedTransactions.shift();
    if (transaction === undefined) {
      processingTransactions = false;
      return;
    }

    const transactionError = takeNextTransactionError();
    if (transactionError !== undefined) {
      transaction.fail(transactionError);
      queueMicrotask(processNextTransaction);
      return;
    }

    const nextRecords = copiedRecords(records);
    const result = transaction.execute(nextRecords, takeNextGetRequestError);
    if (result.kind === "failure") {
      transaction.fail(result.error);
      queueMicrotask(processNextTransaction);
      return;
    }

    records.clear();
    for (const [storeName, storeRecords] of nextRecords) {
      records.set(storeName, storeRecords);
    }
    committedTransactions.push(transaction.snapshot());
    transaction.complete();
    queueMicrotask(processNextTransaction);
  }

  function takeNextGetRequestError(): Error | undefined {
    const error = nextGetRequestError;
    nextGetRequestError = undefined;

    return error;
  }

  function takeNextOpenRequestError(): Error | undefined {
    const error = nextOpenRequestError;
    nextOpenRequestError = undefined;

    return error;
  }

  function takeNextTransactionError(): Error | undefined {
    const error = nextTransactionError;
    nextTransactionError = undefined;

    return error;
  }
}

function createControlledTransaction(
  storeNames: ReadonlyArray<IndexedDbAuthorizationStoreName>,
): ControlledTransaction {
  const operations: Array<QueuedAuthorizationOperation> = [];
  let state: TransactionState = Object.freeze({
    kind: "waiting",
    handlers: undefined,
  });
  const portContents: IndexedDbAuthorizationTransactionPort = {
    error(): unknown {
      if (state.kind === "failed") {
        return state.error;
      }

      throw new Error("IndexedDB transaction did not fail.");
    },
    subscribe(handlers: IndexedDbTransactionHandlers): void {
      if (state.kind !== "waiting" || state.handlers !== undefined) {
        throw new Error("IndexedDB transaction handlers already subscribed.");
      }

      state = Object.freeze({ kind: "waiting", handlers });
    },
    objectStore(
      storeName: IndexedDbAuthorizationStoreName,
    ): IndexedDbAuthorizationObjectStorePort {
      if (!storeNames.includes(storeName)) {
        throw new Error(
          `IndexedDB transaction does not include: ${storeName}.`,
        );
      }

      return createControlledObjectStore(
        storeName,
        operations,
        (): boolean => state.kind === "waiting",
      );
    },
  };
  const port = Object.freeze(portContents);
  const transaction: ControlledTransaction = {
    port,
    storeNames,
    execute(
      records: StoredAuthorizationRecords,
      takeNextGetRequestError: () => Error | undefined,
    ): TransactionExecution {
      for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        if (operation === undefined) {
          throw new Error("Expected IndexedDB transaction operation.");
        }

        const storeRecords = requireStore(records, operation.storeName);
        switch (operation.kind) {
          case "put":
            storeRecords.set(
              storageKeyId(operation.key),
              frozenStoredAuthorizationRecord(operation.key, operation.value),
            );
            break;
          case "get": {
            const requestError = takeNextGetRequestError();
            if (requestError !== undefined) {
              operation.request.fail(requestError);
              return Object.freeze({ kind: "failure", error: requestError });
            }

            const record = storeRecords.get(storageKeyId(operation.key));
            operation.request.succeed(record?.value);
            break;
          }
          case "delete":
            storeRecords.delete(storageKeyId(operation.key));
            break;
          case "clear":
            storeRecords.clear();
            break;
        }
      }

      return Object.freeze({ kind: "success" });
    },
    complete(): void {
      const handlers = waitingTransactionHandlers(state);
      state = Object.freeze({ kind: "completed" });
      handlers.complete();
    },
    fail(error: Error): void {
      const handlers = waitingTransactionHandlers(state);
      state = Object.freeze({ kind: "failed", error });
      handlers.failure();
    },
    snapshot(): ControlledAuthorizationIndexedDbTransaction {
      const snapshot: ControlledAuthorizationIndexedDbTransaction = {
        storeNames: Object.freeze([...storeNames]),
        operations: Object.freeze(
          operations.map(describeAuthorizationOperation),
        ),
      };

      return Object.freeze(snapshot);
    },
  };

  return Object.freeze(transaction);
}

function createControlledObjectStore(
  storeName: IndexedDbAuthorizationStoreName,
  operations: Array<QueuedAuthorizationOperation>,
  isWaiting: () => boolean,
): IndexedDbAuthorizationObjectStorePort {
  const port: IndexedDbAuthorizationObjectStorePort = {
    put(value: object, key: IndexedDbAuthorizationStorageKey): void {
      validateStoreKey(storeName, key);
      ensureWaitingTransaction(isWaiting);
      operations.push(
        Object.freeze({
          kind: "put",
          storeName,
          key: frozenStorageKey(key),
          value,
        }),
      );
    },
    get(
      key: IndexedDbAuthorizationStorageKey,
    ): IndexedDbRequestCompletionPort<unknown> {
      validateStoreKey(storeName, key);
      ensureWaitingTransaction(isWaiting);
      const request = createControlledRequest<unknown>();
      operations.push(
        Object.freeze({
          kind: "get",
          storeName,
          key: frozenStorageKey(key),
          request,
        }),
      );

      return request.port;
    },
    delete(key: IndexedDbAuthorizationStorageKey): void {
      validateStoreKey(storeName, key);
      ensureWaitingTransaction(isWaiting);
      operations.push(
        Object.freeze({
          kind: "delete",
          storeName,
          key: frozenStorageKey(key),
        }),
      );
    },
    clear(): void {
      ensureWaitingTransaction(isWaiting);
      operations.push(Object.freeze({ kind: "clear", storeName }));
    },
  };

  return Object.freeze(port);
}

function createControlledRequest<Value>(): ControlledRequest<Value> {
  let state: RequestState<Value> = Object.freeze({
    kind: "waiting",
    handlers: undefined,
  });
  const port: IndexedDbRequestCompletionPort<Value> = {
    value(): Value {
      if (state.kind === "succeeded") {
        return state.value;
      }

      throw new Error("IndexedDB request did not succeed.");
    },
    error(): unknown {
      if (state.kind === "failed") {
        return state.error;
      }

      throw new Error("IndexedDB request did not fail.");
    },
    subscribe(handlers: IndexedDbRequestHandlers): void {
      if (state.kind !== "waiting" || state.handlers !== undefined) {
        throw new Error("IndexedDB request handlers already subscribed.");
      }

      state = Object.freeze({ kind: "waiting", handlers });
    },
  };
  const request: ControlledRequest<Value> = {
    port: Object.freeze(port),
    succeed(value: Value): void {
      const handlers = waitingRequestHandlers(state);
      state = Object.freeze({ kind: "succeeded", value });
      handlers.success();
    },
    fail(error: Error): void {
      const handlers = waitingRequestHandlers(state);
      state = Object.freeze({ kind: "failed", error });
      handlers.failure();
    },
  };

  return Object.freeze(request);
}

function copiedRecords(
  records: StoredAuthorizationRecords,
): StoredAuthorizationRecords {
  const copy: StoredAuthorizationRecords = new Map();
  for (const [storeName, storeRecords] of records) {
    copy.set(storeName, new Map(storeRecords));
  }

  return copy;
}

function frozenStoreNames(
  storeNames:
    | IndexedDbAuthorizationStoreName
    | ReadonlyArray<IndexedDbAuthorizationStoreName>,
): ReadonlyArray<IndexedDbAuthorizationStoreName> {
  const names = typeof storeNames === "string" ? [storeNames] : [...storeNames];

  return Object.freeze(names);
}

function requireStore(
  records: StoredAuthorizationRecords,
  storeName: IndexedDbAuthorizationStoreName,
): StoreRecords {
  const storeRecords = records.get(storeName);
  if (storeRecords === undefined) {
    throw new Error(`IndexedDB object store does not exist: ${storeName}.`);
  }

  return storeRecords;
}

function validateStoreKey(
  storeName: IndexedDbAuthorizationStoreName,
  key: IndexedDbAuthorizationStorageKey,
): void {
  const isPendingAuthorizationAttemptStore =
    storeName === "pending-authorization-attempts";
  const hasExpectedKey = isPendingAuthorizationAttemptStore
    ? Array.isArray(key)
    : typeof key === "string";
  if (!hasExpectedKey) {
    throw new Error(`Unexpected IndexedDB key for store: ${storeName}.`);
  }
}

function ensureWaitingTransaction(isWaiting: () => boolean): void {
  if (!isWaiting()) {
    throw new Error("IndexedDB transaction already completed.");
  }
}

function waitingRequestHandlers<Value>(
  state: RequestState<Value>,
): IndexedDbRequestHandlers {
  if (state.kind !== "waiting" || state.handlers === undefined) {
    throw new Error("Expected IndexedDB request handlers.");
  }

  return state.handlers;
}

function waitingTransactionHandlers(
  state: TransactionState,
): IndexedDbTransactionHandlers {
  if (state.kind !== "waiting" || state.handlers === undefined) {
    throw new Error("Expected IndexedDB transaction handlers.");
  }

  return state.handlers;
}

function storageKeyId(key: IndexedDbAuthorizationStorageKey): string {
  return JSON.stringify(key);
}

function frozenStorageKey(
  key: IndexedDbAuthorizationStorageKey,
): IndexedDbAuthorizationStorageKey {
  if (typeof key === "string") {
    return key;
  }

  const copiedKey: ["spotify", string] = [key[0], key[1]];

  return Object.freeze(copiedKey);
}

function frozenStoredAuthorizationRecord(
  key: IndexedDbAuthorizationStorageKey,
  value: unknown,
): StoredAuthorizationRecord {
  return Object.freeze({ key: frozenStorageKey(key), value });
}

function frozenControlledAuthorizationRecord(
  storeName: IndexedDbAuthorizationStoreName,
  record: StoredAuthorizationRecord,
): ControlledAuthorizationIndexedDbRecord {
  return Object.freeze({
    storeName,
    key: frozenStorageKey(record.key),
    value: record.value,
  });
}

function describeAuthorizationOperation(
  operation: QueuedAuthorizationOperation,
): ControlledAuthorizationIndexedDbOperation {
  switch (operation.kind) {
    case "put":
    case "get":
    case "delete":
      return Object.freeze({
        kind: operation.kind,
        storeName: operation.storeName,
        key: frozenStorageKey(operation.key),
      });
    case "clear":
      return Object.freeze({ kind: "clear", storeName: operation.storeName });
  }
}
