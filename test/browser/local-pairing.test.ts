import assert from "node:assert/strict";
import { test } from "bun:test";
import { redeemPairingCapability } from "../../browser/local/pairing.ts";
import { parseLocalHostOptions } from "../../server/local/options.ts";
import { createPairingAuthority } from "../../server/local/pairing.ts";

test("Local pairing redeems once into one host-only process session", () => {
  let now = 10;
  let randomCall = 0;
  const authority = createPairingAuthority({
    monotonicNow(): number {
      return now;
    },
    randomBytes(): Uint8Array {
      randomCall += 1;
      return new Uint8Array(32).fill(randomCall);
    },
  });
  const capability = authority.capabilityFragment();
  const accepted = authority.redeem(capability);
  assert.equal(accepted.kind, "accepted");
  if (accepted.kind !== "accepted") {
    throw new Error("The fixed Local pairing capability was rejected.");
  }
  assert.match(
    accepted.setCookie,
    /^phrasic_local_session=[A-Za-z0-9_-]{43}; HttpOnly; SameSite=Strict; Path=\/$/,
  );
  const cookie = accepted.setCookie.split(";")[0];
  assert.notEqual(cookie, undefined);
  assert.equal(authority.authenticate(cookie ?? null), true);
  assert.equal(authority.redeem(capability).kind, "rejected");

  authority.revoke();
  now += 1;
  assert.equal(authority.authenticate(cookie ?? null), false);
});

test("Local pairing expires without issuing a session", () => {
  let now = 0;
  const authority = createPairingAuthority({
    monotonicNow(): number {
      return now;
    },
    randomBytes(): Uint8Array {
      return new Uint8Array(32).fill(7);
    },
  });
  const capability = authority.capabilityFragment();
  now = 120_000;
  assert.equal(authority.redeem(capability).kind, "rejected");
  assert.equal(authority.authenticate(null), false);
});

test("browser pairing removes the fragment before sending the capability", async () => {
  const events: string[] = [];
  const result = await redeemPairingCapability(
    {
      currentUrl(): URL {
        return new URL(
          "http://127.0.0.1:43123/local/#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        );
      },
      fetch(_input, init): Promise<Pick<Response, "ok">> {
        events.push(`fetch:${String(init.body)}`);
        return Promise.resolve({ ok: true });
      },
      replaceHistory(path): void {
        events.push(`history:${path}`);
      },
    },
    new AbortController().signal,
  );

  assert.deepEqual(events, [
    "history:/local/",
    "fetch:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ]);
  assert.equal(result.kind, "paired-or-existing-session");
});

test("Local host arguments accept only the fixed target-specific boundary", () => {
  const parsed = parseLocalHostOptions(
    [
      "--native-endpoint",
      "/run/user/1000/phrasic/v1-43123.sock",
      "--expected-instance-id",
      "01010101010101010101010101010101",
      "--browser-port",
      "43123",
    ],
    "linux",
  );
  assert.equal(parsed.kind, "success");
  assert.equal(
    parseLocalHostOptions(
      [
        "--native-endpoint",
        "/run/user/1000/phrasic/v1-43123.sock",
        "--expected-instance-id",
        "01010101010101010101010101010101",
        "--browser-port",
        "0",
      ],
      "linux",
    ).kind,
    "failure",
  );
  assert.equal(
    parseLocalHostOptions(
      [
        "--native-endpoint",
        "\\\\.\\pipe\\LOCAL\\phrasic-local-v1-43123",
        "--expected-instance-id",
        "01010101010101010101010101010101",
        "--browser-port",
        "43123",
      ],
      "linux",
    ).kind,
    "failure",
  );
});
