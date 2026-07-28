import assert from "node:assert/strict";
import { test } from "bun:test";
import { fetchBrowserConfiguration } from "../../browser/configuration-fetch.ts";

type CapturedFetchCall = {
  readonly init: RequestInit;
  readonly url: URL;
};

test("the browser configuration fetch preserves the request security boundary", async () => {
  const controller = new AbortController();
  const url = new URL("https://nowplaying.example/config.json");
  const source = Object.freeze({ spotify: Object.freeze({ clientId: "id" }) });
  let capturedFetchCall: CapturedFetchCall | undefined;

  const configuration = await fetchBrowserConfiguration({
    fetchImplementation(input, init) {
      capturedFetchCall = Object.freeze({ init, url: input });
      return Promise.resolve(
        Object.freeze({
          ok: false,
          json(): Promise<unknown> {
            return Promise.resolve(source);
          },
        }),
      );
    },
    signal: controller.signal,
    url,
  });

  if (capturedFetchCall === undefined) {
    throw new Error("Expected configuration fetch to be called.");
  }

  assert.equal(capturedFetchCall.url, url);
  assert.equal(capturedFetchCall.init.cache, "no-store");
  assert.equal(capturedFetchCall.init.credentials, "same-origin");
  assert.equal(capturedFetchCall.init.redirect, "error");
  assert.equal(capturedFetchCall.init.signal, controller.signal);
  assert.equal(configuration.ok, false);
  assert.equal(await configuration.readJson(), source);
});
