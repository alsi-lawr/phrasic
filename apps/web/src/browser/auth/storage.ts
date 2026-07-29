import { PendingAuthorizationAttempt } from "./pkce-values.ts";

import {
  pendingAuthorizationAttemptsStoreName,
  spotifyAuthorizationStorageProvider,
  spotifyConnectionsStoreName,
  type IndexedDbAuthorizationDatabasePort,
  type IndexedDbAuthorizationPort,
  type IndexedDbRequestCompletionPort,
  type IndexedDbTransactionCompletionPort,
} from "./indexeddb-authorization.ts";
import {
  isPendingAuthorizationAttemptExpired,
  matchesPendingAuthorizationAttemptState,
} from "./pkce.ts";
import { SpotifyRefreshToken } from "./spotify-token-values.ts";
import type {
  SpotifyAuthStoragePort,
  SpotifyPendingAuthorizationAttemptConsumeOptions,
  SpotifyPendingAuthorizationAttemptConsumeResult,
  SpotifyRefreshTokenReadResult,
} from "./spotify-auth-storage-contract.ts";
import {
  parseStoredPendingAuthorizationAttempt,
  parseStoredSpotifyRefreshToken,
  storedPendingAuthorizationAttempt,
  storedSpotifyRefreshToken,
} from "./spotify-auth-storage-records.ts";

const databaseName = "phrasic-browser-auth";
const databaseVersion = 1;

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

    async readSpotifyRefreshToken(): Promise<SpotifyRefreshTokenReadResult> {
      const openedDatabase = await database;
      return readStoredSpotifyRefreshToken(openedDatabase);
    },

    async saveSpotifyRefreshToken(
      refreshToken: SpotifyRefreshToken,
    ): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(
        spotifyConnectionsStoreName,
      );
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        const store = transaction.objectStore(spotifyConnectionsStoreName);
        store.put(
          storedSpotifyRefreshToken(refreshToken),
          spotifyAuthorizationStorageProvider,
        );
      } finally {
        await completion;
      }
    },

    async deleteSpotifyRefreshToken(): Promise<void> {
      const openedDatabase = await database;
      const transaction = openedDatabase.transaction(
        spotifyConnectionsStoreName,
      );
      const completion = waitForIndexedDbTransaction(transaction);

      try {
        const store = transaction.objectStore(spotifyConnectionsStoreName);
        store.delete(spotifyAuthorizationStorageProvider);
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

  return storage;
}

function waitForIndexedDbRequest<Value>(
  request: IndexedDbRequestCompletionPort<Value>,
): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    request.subscribe({
      success(): void {
        resolve(request.value());
      },
      failure(): void {
        reject(indexedDbFailure("request", request.error()));
      },
    });
  });
}

function waitForIndexedDbTransaction(
  transaction: IndexedDbTransactionCompletionPort,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.subscribe({
      complete(): void {
        resolve();
      },
      failure(): void {
        reject(indexedDbFailure("transaction", transaction.error()));
      },
    });
  });
}

type PendingAuthorizationAttemptConsumeState =
  | {
      readonly kind: "waiting";
    }
  | {
      readonly kind: "ready";
      readonly result: SpotifyPendingAuthorizationAttemptConsumeResult;
    };

type SpotifyRefreshTokenReadState =
  | {
      readonly kind: "waiting";
    }
  | {
      readonly kind: "ready";
      readonly result: SpotifyRefreshTokenReadResult;
    };

async function openAuthorizationDatabase(
  indexedDb: IndexedDbAuthorizationPort,
): Promise<IndexedDbAuthorizationDatabasePort> {
  const request = indexedDb.open({
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
  });

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
      let state: PendingAuthorizationAttemptConsumeState = {
        kind: "waiting",
      };

      transaction.subscribe({
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
      });

      const request = store.get(key);
      request.subscribe({
        success(): void {
          const storedAttempt = request.value();
          if (storedAttempt === undefined) {
            state = pendingAuthorizationAttemptConsumeState(
              rejectedPendingAttempt("missing-attempt"),
            );
            return;
          }

          store.delete(key);
          const parsedAttempt =
            parseStoredPendingAuthorizationAttempt(storedAttempt);
          if (parsedAttempt.kind === "failure") {
            state = pendingAuthorizationAttemptConsumeState(
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
            state = pendingAuthorizationAttemptConsumeState(
              rejectedPendingAttempt("state-mismatch"),
            );
            return;
          }

          if (
            isPendingAuthorizationAttemptExpired({
              pending: parsedAttempt.value,
              observedAt: options.observedAt,
            })
          ) {
            state = pendingAuthorizationAttemptConsumeState(
              rejectedPendingAttempt("expired"),
            );
            return;
          }

          state = pendingAuthorizationAttemptConsumeState(
            consumedPendingAttempt(parsedAttempt.value),
          );
        },
        failure(): void {
          reject(indexedDbFailure("request", request.error()));
        },
      });
    },
  );
}

function readStoredSpotifyRefreshToken(
  database: IndexedDbAuthorizationDatabasePort,
): Promise<SpotifyRefreshTokenReadResult> {
  return new Promise<SpotifyRefreshTokenReadResult>((resolve, reject) => {
    const transaction = database.transaction(spotifyConnectionsStoreName);
    const store = transaction.objectStore(spotifyConnectionsStoreName);
    let state: SpotifyRefreshTokenReadState = {
      kind: "waiting",
    };

    transaction.subscribe({
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
    });

    const request = store.get(spotifyAuthorizationStorageProvider);
    request.subscribe({
      success(): void {
        const storedRefreshToken = request.value();
        if (storedRefreshToken === undefined) {
          state = spotifyRefreshTokenReadState(missingRefreshToken());
          return;
        }

        const refreshToken = parseStoredSpotifyRefreshToken(storedRefreshToken);
        if (refreshToken.kind === "failure") {
          store.delete(spotifyAuthorizationStorageProvider);
          state = spotifyRefreshTokenReadState(missingRefreshToken());
          return;
        }

        state = spotifyRefreshTokenReadState(
          foundRefreshToken(refreshToken.value),
        );
      },
      failure(): void {
        reject(indexedDbFailure("request", request.error()));
      },
    });
  });
}

function pendingAttemptStorageKey(
  state: string,
): readonly [typeof spotifyAuthorizationStorageProvider, string] {
  const key: [typeof spotifyAuthorizationStorageProvider, string] = [
    spotifyAuthorizationStorageProvider,
    state,
  ];

  return key;
}

function indexedDbFailure(
  operation: "request" | "transaction",
  cause: unknown,
): Error {
  return new Error(`IndexedDB ${operation} failed.`, { cause });
}

function consumedPendingAttempt(
  attempt: PendingAuthorizationAttempt,
): SpotifyPendingAuthorizationAttemptConsumeResult {
  const result: SpotifyPendingAuthorizationAttemptConsumeResult = {
    kind: "consumed",
    attempt,
  };

  return result;
}

function pendingAuthorizationAttemptConsumeState(
  result: SpotifyPendingAuthorizationAttemptConsumeResult,
): PendingAuthorizationAttemptConsumeState {
  const state: PendingAuthorizationAttemptConsumeState = {
    kind: "ready",
    result,
  };

  return state;
}

function rejectedPendingAttempt(
  reason: Extract<
    SpotifyPendingAuthorizationAttemptConsumeResult,
    { readonly kind: "rejected" }
  >["reason"],
): SpotifyPendingAuthorizationAttemptConsumeResult {
  const result: SpotifyPendingAuthorizationAttemptConsumeResult = {
    kind: "rejected",
    reason,
  };

  return result;
}

function foundRefreshToken(
  refreshToken: SpotifyRefreshToken,
): SpotifyRefreshTokenReadResult {
  const result: SpotifyRefreshTokenReadResult = {
    kind: "found",
    refreshToken,
  };

  return result;
}

function spotifyRefreshTokenReadState(
  result: SpotifyRefreshTokenReadResult,
): SpotifyRefreshTokenReadState {
  const state: SpotifyRefreshTokenReadState = {
    kind: "ready",
    result,
  };

  return state;
}

function missingRefreshToken(): SpotifyRefreshTokenReadResult {
  const result: SpotifyRefreshTokenReadResult = {
    kind: "missing",
  };

  return result;
}
