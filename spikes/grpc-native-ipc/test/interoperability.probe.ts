import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

type ExpectedScenario =
  "abort" | "concurrency" | "deadline" | "status" | "success" | "unavailable";

type BrowserReport = {
  readonly detail: string;
  readonly passed: boolean;
  readonly scenario: ExpectedScenario;
};

class LineCapture {
  readonly completed: Promise<void>;
  readonly lines: Array<string> = [];

  constructor(stream: ReadableStream<Uint8Array>) {
    this.completed = this.consume(stream);
  }

  async waitFor(fragment: string, timeoutMilliseconds = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (this.lines.some((line) => line.includes(fragment))) {
        return;
      }
      await Bun.sleep(10);
    }
    throw new Error(
      `Timed out waiting for process output: ${fragment}\n${this.text()}`,
    );
  }

  text(): string {
    return this.lines.join("\n");
  }

  private async consume(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      pending += decoder.decode(result.value, { stream: true });
      const completeLines = pending.split(/\r?\n/);
      pending = completeLines.pop() ?? "";
      this.lines.push(...completeLines);
    }
    pending += decoder.decode();
    if (pending.length > 0) {
      this.lines.push(pending);
    }
  }
}

const workspaceRoot = join(import.meta.dir, "..");
const platform = process.platform;
const executableSuffix = platform === "win32" ? ".exe" : "";
const nativeTransport =
  platform === "win32" ? "windows-named-pipe" : "linux-uds";
const runIdentifier = `${process.pid}-${Date.now()}`;
const scratchRoot = process.env.RUNNER_TEMP ?? tmpdir();
const browserPort = 45_006;
const nativeEndpoint =
  platform === "win32"
    ? `\\\\.\\pipe\\phrasic-t006-${runIdentifier}`
    : join(scratchRoot, `phrasic-t006-${runIdentifier}.sock`);
const shutdownFile = join(
  scratchRoot,
  `phrasic-t006-${runIdentifier}.shutdown`,
);
const nativeBinary = join(
  workspaceRoot,
  "target",
  "debug",
  `phrasic-grpc-native-ipc-spike${executableSuffix}`,
);
const terminatorBundle = join(workspaceRoot, "dist", "terminator.cjs");
const browserRoot = join(workspaceRoot, "dist", "browser");

const startNative = () => {
  const subprocess = Bun.spawn(
    [nativeBinary, "serve-native", nativeEndpoint, shutdownFile],
    { stderr: "pipe", stdout: "pipe" },
  );
  return {
    process: subprocess,
    stderr: new LineCapture(subprocess.stderr),
    stdout: new LineCapture(subprocess.stdout),
  };
};

const startTerminator = () => {
  const subprocess = Bun.spawn([process.execPath, terminatorBundle], {
    env: {
      ...process.env,
      SPIKE_BROWSER_PORT: String(browserPort),
      SPIKE_BROWSER_ROOT: browserRoot,
      SPIKE_NATIVE_ENDPOINT: nativeEndpoint,
      SPIKE_NATIVE_TRANSPORT: nativeTransport,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    process: subprocess,
    stderr: new LineCapture(subprocess.stderr),
    stdout: new LineCapture(subprocess.stdout),
  };
};

type ReadinessOutcome =
  | { readonly kind: "ready" }
  | { readonly code: number; readonly kind: "stopped" };

const waitForReady = async (
  launched: {
    readonly process: { readonly exited: Promise<number> };
    readonly stderr: LineCapture;
    readonly stdout: LineCapture;
  },
  marker: string,
  label: string,
): Promise<void> => {
  const ready = async (): Promise<ReadinessOutcome> => {
    await launched.stdout.waitFor(marker);
    return { kind: "ready" };
  };
  const stopped = launched.process.exited.then((code): ReadinessOutcome => ({
    code,
    kind: "stopped",
  }));
  let outcome: ReadinessOutcome;
  try {
    outcome = await Promise.race([ready(), stopped]);
  } catch (caught: unknown) {
    const detail = caught instanceof Error ? caught.message : "unknown failure";
    throw new Error(
      `${label} readiness failed: ${detail}\nstdout:\n${launched.stdout.text()}\nstderr:\n${launched.stderr.text()}`,
    );
  }
  if (outcome.kind === "stopped") {
    throw new Error(
      `${label} stopped before readiness with exit ${outcome.code}\nstdout:\n${launched.stdout.text()}\nstderr:\n${launched.stderr.text()}`,
    );
  }
};

const parseBrowserReport = (
  html: string,
  scenario: ExpectedScenario,
): BrowserReport => {
  const match = /data-spike-result="([A-Za-z0-9+/=]+)"/.exec(html);
  const encoded = match?.[1];
  if (encoded === undefined) {
    throw new Error(`Browser result attribute is absent: ${html}`);
  }
  const parsed: unknown = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("detail" in parsed) ||
    !("passed" in parsed) ||
    !("scenario" in parsed) ||
    typeof parsed.detail !== "string" ||
    typeof parsed.passed !== "boolean" ||
    parsed.scenario !== scenario
  ) {
    throw new Error("Browser report failed validation");
  }
  return { detail: parsed.detail, passed: parsed.passed, scenario };
};

const runBrowserScenario = async (
  scenario: ExpectedScenario,
  runNumber: number,
): Promise<BrowserReport> => {
  const chrome =
    process.env.CHROME_BIN ??
    (platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : "google-chrome");
  const userDataDirectory = join(
    scratchRoot,
    `phrasic-t006-chrome-${runIdentifier}-${runNumber}`,
  );
  const platformArguments = platform === "win32" ? [] : ["--no-sandbox"];
  const subprocess = Bun.spawn(
    [
      chrome,
      "--headless=new",
      "--disable-background-networking",
      "--disable-gpu",
      ...platformArguments,
      `--user-data-dir=${userDataDirectory}`,
      "--virtual-time-budget=6000",
      "--dump-dom",
      `http://127.0.0.1:${browserPort}/?scenario=${scenario}`,
    ],
    { stderr: "pipe", stdout: "pipe" },
  );
  const [exitCode, html, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Chrome failed with exit ${exitCode}: ${stderr}`);
  }
  const report = parseBrowserReport(html, scenario);
  process.stdout.write(
    `browser scenario=${scenario} detail=${report.detail}\n`,
  );
  return report;
};

const waitForExit = async (
  subprocess: ReturnType<typeof Bun.spawn>,
  label: string,
): Promise<number> => {
  type ExitOutcome =
    | { readonly code: number; readonly kind: "exited" }
    | { readonly kind: "timeout" };
  const exited: Promise<ExitOutcome> = subprocess.exited.then((code) => ({
    code,
    kind: "exited",
  }));
  const timeout: Promise<ExitOutcome> = Bun.sleep(5_000).then(() => ({
    kind: "timeout",
  }));
  const outcome = await Promise.race([exited, timeout]);
  if (outcome.kind === "timeout") {
    subprocess.kill();
    throw new Error(`${label} did not stop cleanly`);
  }
  return outcome.code;
};

const listenerEvidence = async (
  nativeProcessId: number,
  terminatorProcessId: number,
): Promise<void> => {
  if (platform === "win32") {
    const netstat = Bun.spawn(["netstat", "-ano", "-p", "tcp"], {
      stdout: "pipe",
    });
    const output = await new Response(netstat.stdout).text();
    expect(await netstat.exited).toBe(0);
    const listeners = output
      .split(/\r?\n/)
      .filter((line) => line.includes("LISTENING"));
    expect(
      listeners.some(
        (line) =>
          line.includes(`127.0.0.1:${browserPort}`) &&
          line.trim().endsWith(String(terminatorProcessId)),
      ),
    ).toBeTrue();
    expect(
      listeners.some((line) => line.trim().endsWith(String(nativeProcessId))),
    ).toBeFalse();
    process.stdout.write(
      `listener browser=127.0.0.1:${browserPort} transport=windows-named-pipe native_tcp=false\n`,
    );
    return;
  }

  const tcp = Bun.spawn(["ss", "-ltnp"], { stdout: "pipe" });
  const tcpOutput = await new Response(tcp.stdout).text();
  expect(await tcp.exited).toBe(0);
  expect(tcpOutput).toContain(`127.0.0.1:${browserPort}`);
  expect(tcpOutput).not.toContain(`pid=${nativeProcessId}`);

  const unix = Bun.spawn(["ss", "-lxnp"], { stdout: "pipe" });
  const unixOutput = await new Response(unix.stdout).text();
  expect(await unix.exited).toBe(0);
  expect(unixOutput).toContain(nativeEndpoint);
  process.stdout.write(
    `listener browser=127.0.0.1:${browserPort} transport=linux-uds endpoint=${nativeEndpoint} native_tcp=false\n`,
  );
};

const browserListenerIsAbsent = async (): Promise<void> => {
  if (platform === "win32") {
    const netstat = Bun.spawn(["netstat", "-ano", "-p", "tcp"], {
      stdout: "pipe",
    });
    const output = await new Response(netstat.stdout).text();
    expect(await netstat.exited).toBe(0);
    const listeners = output
      .split(/\r?\n/)
      .filter((line) => line.includes("LISTENING"));
    expect(
      listeners.some((line) => line.includes(`127.0.0.1:${browserPort}`)),
    ).toBeFalse();
    return;
  }
  const tcp = Bun.spawn(["ss", "-ltn"], { stdout: "pipe" });
  const output = await new Response(tcp.stdout).text();
  expect(await tcp.exited).toBe(0);
  expect(output).not.toContain(`127.0.0.1:${browserPort}`);
};

test("binary gRPC-Web reaches native Tonic IPC through Bun across lifecycle boundaries", async () => {
  expect(await Bun.file(nativeBinary).exists()).toBeTrue();
  expect(await Bun.file(terminatorBundle).exists()).toBeTrue();
  expect(await Bun.file(join(browserRoot, "index.html")).exists()).toBeTrue();

  let native = startNative();
  let terminator = startTerminator();
  let browserRun = 0;
  const runScenario = async (
    scenario: ExpectedScenario,
  ): Promise<BrowserReport> => {
    browserRun += 1;
    return runBrowserScenario(scenario, browserRun);
  };
  try {
    await waitForReady(
      native,
      `READY transport=${nativeTransport}`,
      "native service",
    );
    await waitForReady(
      terminator,
      `READY browser=127.0.0.1:${browserPort}`,
      "Bun terminator",
    );
    await listenerEvidence(native.process.pid, terminator.process.pid);

    expect((await runScenario("success")).passed).toBeTrue();
    expect((await runScenario("status")).passed).toBeTrue();
    expect((await runScenario("deadline")).passed).toBeTrue();
    await native.stderr.waitFor("EVENT cancellation request_id=deadline");
    expect((await runScenario("abort")).passed).toBeTrue();
    await native.stderr.waitFor("EVENT cancellation request_id=abort");
    expect((await runScenario("concurrency")).passed).toBeTrue();

    await Bun.write(shutdownFile, "shutdown");
    expect(await waitForExit(native.process, "native service")).toBe(0);
    await Promise.all([native.stdout.completed, native.stderr.completed]);
    if (platform !== "win32") {
      expect(await Bun.file(nativeEndpoint).exists()).toBeFalse();
    }

    expect((await runScenario("unavailable")).passed).toBeTrue();
    await Bun.file(shutdownFile).delete();
    native = startNative();
    await waitForReady(
      native,
      `READY transport=${nativeTransport}`,
      "restarted native service",
    );
    await Bun.sleep(1_500);
    expect((await runScenario("success")).passed).toBeTrue();

    await Bun.write(shutdownFile, "shutdown");
    expect(await waitForExit(native.process, "restarted native service")).toBe(
      0,
    );
    await Promise.all([native.stdout.completed, native.stderr.completed]);
    await Bun.file(shutdownFile).delete();

    const shutdownResponse = await fetch(
      `http://127.0.0.1:${browserPort}/__shutdown`,
      {
        method: "POST",
      },
    );
    expect(shutdownResponse.status).toBe(202);
    expect(await waitForExit(terminator.process, "Bun terminator")).toBe(0);
    await Promise.all([
      terminator.stdout.completed,
      terminator.stderr.completed,
    ]);
    await browserListenerIsAbsent();
    process.stdout.write(
      "cleanup native_endpoint=true browser_listener=true\n",
    );
  } finally {
    if (native.process.exitCode === null) {
      native.process.kill();
    }
    if (terminator.process.exitCode === null) {
      terminator.process.kill();
    }
  }
}, 120_000);
