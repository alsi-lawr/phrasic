import assert from "node:assert/strict";
import test from "node:test";
import {
  waitForIndexedDbRequest,
  waitForIndexedDbTransaction,
  type IndexedDbRequestCompletionPort,
  type IndexedDbRequestHandlers,
  type IndexedDbTransactionCompletionPort,
  type IndexedDbTransactionHandlers,
} from "../../../browser/auth/storage.ts";

type RequestFixture<Value> = {
  readonly port: IndexedDbRequestCompletionPort<Value>;
  readonly succeed: () => void;
  readonly fail: () => void;
};

type TransactionFixture = {
  readonly port: IndexedDbTransactionCompletionPort;
  readonly complete: () => void;
  readonly fail: () => void;
};

test("IndexedDB request helper resolves the request value only after success", async () => {
  const fixture = requestFixture(42);
  const completion = waitForIndexedDbRequest(fixture.port);

  fixture.succeed();

  assert.equal(await completion, 42);
});

test("IndexedDB request helper rejects a request failure without exposing the raw error", async () => {
  const fixture = requestFixture("unused");
  const completion = waitForIndexedDbRequest(fixture.port);

  fixture.fail();

  await assert.rejects(completion, {
    message: "IndexedDB request failed.",
  });
});

test("IndexedDB transaction helper resolves completion and rejects abort/error notifications", async () => {
  const completedFixture = transactionFixture();
  const completed = waitForIndexedDbTransaction(completedFixture.port);
  completedFixture.complete();
  await completed;

  const failedFixture = transactionFixture();
  const failed = waitForIndexedDbTransaction(failedFixture.port);
  failedFixture.fail();
  await assert.rejects(failed, {
    message: "IndexedDB transaction failed.",
  });
});

function requestFixture<Value>(value: Value): RequestFixture<Value> {
  let handlers: IndexedDbRequestHandlers | undefined;
  const port: IndexedDbRequestCompletionPort<Value> = {
    value(): Value {
      return value;
    },
    error(): unknown {
      return new Error("simulated IndexedDB request failure");
    },
    subscribe(nextHandlers: IndexedDbRequestHandlers): void {
      handlers = nextHandlers;
    },
  };
  const fixture: RequestFixture<Value> = {
    port: Object.freeze(port),
    succeed(): void {
      requestHandlers(handlers).success();
    },
    fail(): void {
      requestHandlers(handlers).failure();
    },
  };

  return Object.freeze(fixture);
}

function transactionFixture(): TransactionFixture {
  let handlers: IndexedDbTransactionHandlers | undefined;
  const port: IndexedDbTransactionCompletionPort = {
    error(): unknown {
      return new Error("simulated IndexedDB transaction failure");
    },
    subscribe(nextHandlers: IndexedDbTransactionHandlers): void {
      handlers = nextHandlers;
    },
  };
  const fixture: TransactionFixture = {
    port: Object.freeze(port),
    complete(): void {
      transactionHandlers(handlers).complete();
    },
    fail(): void {
      transactionHandlers(handlers).failure();
    },
  };

  return Object.freeze(fixture);
}

function requestHandlers(
  handlers: IndexedDbRequestHandlers | undefined,
): IndexedDbRequestHandlers {
  if (handlers === undefined) {
    throw new Error("Expected IndexedDB request handlers to be subscribed.");
  }

  return handlers;
}

function transactionHandlers(
  handlers: IndexedDbTransactionHandlers | undefined,
): IndexedDbTransactionHandlers {
  if (handlers === undefined) {
    throw new Error(
      "Expected IndexedDB transaction handlers to be subscribed.",
    );
  }

  return handlers;
}
