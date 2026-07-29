import assert from "node:assert/strict";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  GetInstanceInfoRequest,
  GetInstanceInfoResponse,
  GetSnapshotRequest,
  GetSnapshotResponse,
} from "../apps/web/src/browser/generated/phrasic/local/v1/local_media_pb.js";

const root = resolve(import.meta.dir, "..");

if (process.env.PHRASIC_GATEWAY_HOST !== undefined) {
  await proxy(process.argv.slice(2));
} else {
  await smoke(process.argv[2]);
}

async function smoke(target: string | undefined): Promise<void> {
  const platform = targetPlatform(target);
  const suffix = platform === "windows" ? ".exe" : "";
  const scratch = join(root, ".agent-workspace", `native-smoke-${process.pid}`);
  const runtime = join(scratch, "runtime");
  const record = join(scratch, "pairing");
  const release = join(scratch, "release");
  const proxyPath = join(scratch, `proxy${suffix}`);
  const hostPath =
    process.env.PHRASIC_GATEWAY_LOCAL_HOST ??
    join(root, "dist", "native", platform, `phrasic-local-host${suffix}`);
  const rustPath =
    process.env.PHRASIC_GATEWAY_NATIVE_SERVICE ??
    join(root, "target", "debug", `phrasic${suffix}`);
  const port = 43_123;
  const origin = `http://127.0.0.1:${port}`;
  const endpoint =
    platform === "windows"
      ? `\\\\.\\pipe\\LOCAL\\phrasic-local-v1-${port}`
      : join(runtime, "phrasic", `v1-${port}.sock`);
  let rust: Bun.ReadableSubprocess | undefined;

  await rm(scratch, { force: true, recursive: true });
  await mkdir(runtime, { mode: 0o700, recursive: true });
  try {
    assert.equal(await Bun.file(hostPath).exists(), true);
    assert.equal(await Bun.file(rustPath).exists(), true);
    const built = await Bun.build({
      compile: {
        autoloadBunfig: false,
        autoloadDotenv: false,
        outfile: proxyPath,
      },
      entrypoints: [import.meta.path],
      env: "disable",
      minify: true,
      sourcemap: "none",
      target: "bun",
    });
    assert.equal(built.success, true);

    const config = join(scratch, "phrasic.toml");
    await Bun.write(
      config,
      `schema_version = 1\nport = ${port}\nbrowser_handoff = "print"\n`,
    );
    rust = Bun.spawn([rustPath, "serve", config], {
      env: {
        ...process.env,
        PHRASIC_GATEWAY_HOST: hostPath,
        PHRASIC_GATEWAY_RECORD: record,
        PHRASIC_GATEWAY_RELEASE: release,
        PHRASIC_LOCAL_HOST: proxyPath,
        ...(platform === "linux" ? { XDG_RUNTIME_DIR: runtime } : {}),
      },
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });

    const pairingUrl = pairingUrlFromRecord(await waitForFile(record, rust));
    const paired = await fetch(`${origin}/local/pair`, {
      body: pairingUrl.hash.slice(1),
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        origin,
      },
      method: "POST",
    });
    assert.equal(paired.status, 204);
    const cookie = paired.headers.get("set-cookie")?.split(";", 1)[0];
    assert.notEqual(cookie, undefined);

    const info = GetInstanceInfoResponse.deserializeBinary(
      await grpcWeb(
        origin,
        "/phrasic.local.v1.LocalMedia/GetInstanceInfo",
        new GetInstanceInfoRequest().serializeBinary(),
        required(cookie),
      ),
    );
    const instanceId = info.getInstanceId_asU8();
    assert.equal(instanceId.byteLength, 16);
    const request = new GetSnapshotRequest();
    request.setExpectedInstanceId(instanceId);
    const snapshot = GetSnapshotResponse.deserializeBinary(
      await grpcWeb(
        origin,
        "/phrasic.local.v1.LocalMedia/GetSnapshot",
        request.serializeBinary(),
        required(cookie),
      ),
    );
    assert.deepEqual(snapshot.getInstanceId_asU8(), instanceId);

    await Bun.write(release, "release");
    assert.equal(await exitWithin(rust, 10_000), 1);
    const [stdout, stderr] = await Promise.all([
      new Response(rust.stdout).text(),
      new Response(rust.stderr).text(),
    ]);
    assert.equal(stdout, "");
    assert.match(stderr, /bun\.control_failed/);
    assert.equal(await connectionFails(`${origin}/local/`), true);
    if (platform === "linux") {
      assert.equal(await Bun.file(endpoint).exists(), false);
    }
    console.info(
      `native gateway smoke transport=${platform === "windows" ? "named-pipe" : "uds"} readiness=true snapshot=true cleanup=true`,
    );
  } finally {
    if (rust?.exitCode === null) {
      rust.kill();
      await exitWithin(rust, 5_000).catch(() => undefined);
    }
    await rm(scratch, { force: true, recursive: true });
  }
}

async function proxy(arguments_: string[]): Promise<void> {
  const host = Bun.spawn(
    [required(process.env.PHRASIC_GATEWAY_HOST), ...arguments_],
    { stderr: "inherit", stdin: "pipe", stdout: "pipe" },
  );
  const input = forwardInput(host);
  try {
    const first = await host.stdout.getReader().read();
    if (first.done) {
      throw new Error("Local host stopped before pairing.");
    }
    const record = new TextDecoder().decode(first.value);
    if (!record.startsWith("PAIRING_URL ") || !record.endsWith("\n")) {
      throw new Error("Local host pairing record is invalid.");
    }
    const recordPath = required(process.env.PHRASIC_GATEWAY_RECORD);
    await Bun.write(recordPath, record);
    await chmod(recordPath, 0o600);
    const release = required(process.env.PHRASIC_GATEWAY_RELEASE);
    while (!(await Bun.file(release).exists())) {
      await Bun.sleep(10);
    }
    process.stdout.write(record);
    process.exitCode = await host.exited;
    await input;
  } finally {
    if (host.exitCode === null) {
      host.kill();
    }
  }
}

async function forwardInput(
  host: Bun.Subprocess<"pipe", "pipe", "inherit">,
): Promise<void> {
  const reader = Bun.stdin.stream().getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) {
      host.stdin.end();
      return;
    }
    host.stdin.write(next.value);
    await host.stdin.flush();
  }
}

async function grpcWeb(
  origin: string,
  method: string,
  payload: Uint8Array,
  cookie: string,
): Promise<Uint8Array> {
  const frame = new Uint8Array(payload.byteLength + 5);
  new DataView(frame.buffer).setUint32(1, payload.byteLength, false);
  frame.set(payload, 5);
  const response = await fetch(`${origin}${method}`, {
    body: frame,
    headers: {
      "content-type": "application/grpc-web+proto",
      cookie,
      origin,
    },
    method: "POST",
  });
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(body[0], 0);
  const length = new DataView(body.buffer, body.byteOffset).getUint32(1, false);
  assert.equal(body[5 + length], 0x80);
  assert.match(new TextDecoder().decode(body), /grpc-status: 0/);
  return body.subarray(5, 5 + length);
}

async function waitForFile(
  path: string,
  process: Bun.ReadableSubprocess,
): Promise<string> {
  for (let attempt = 0; attempt < 450; attempt += 1) {
    if (await Bun.file(path).exists()) {
      return Bun.file(path).text();
    }
    if (process.exitCode !== null) {
      const stderr = await new Response(process.stderr).text();
      throw new Error(
        `Native sidecar stopped with exit ${process.exitCode}: ${stderr}`,
      );
    }
    await Bun.sleep(10);
  }
  throw new Error("Local gateway did not become ready.");
}

async function exitWithin(
  process: { readonly exited: Promise<number> },
  milliseconds: number,
): Promise<number> {
  const code = await Promise.race([
    process.exited,
    Bun.sleep(milliseconds).then(() => undefined),
  ]);
  if (code === undefined) {
    throw new Error("Native gateway did not stop.");
  }
  return code;
}

async function connectionFails(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return false;
  } catch {
    return true;
  }
}

function pairingUrlFromRecord(record: string): URL {
  return new URL(record.trim().replace("PAIRING_URL ", ""));
}

function targetPlatform(value: string | undefined): "linux" | "windows" {
  if (value === "linux" && process.platform === "linux") {
    return value;
  }
  if (value === "windows" && process.platform === "win32") {
    return value;
  }
  throw new Error("Native gateway smoke target does not match this runner.");
}

function required<Value>(value: Value | undefined): Value {
  if (value === undefined) {
    throw new Error("Native gateway smoke state is incomplete.");
  }
  return value;
}
