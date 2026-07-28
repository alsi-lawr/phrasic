import { parseLocalHostOptions } from "./options.ts";
import { startLocalHost, type EmbeddedLocalFile } from "./host.ts";
import { createLocalNativeClient } from "./native-client.ts";

export async function runLocalHost(input: {
  readonly font: EmbeddedLocalFile;
  readonly localPage: Bun.HTMLBundle;
  readonly worker: EmbeddedLocalFile;
}): Promise<void> {
  const parsed = parseLocalHostOptions(process.argv.slice(2));
  if (parsed.kind === "failure") {
    throw new Error("local_host.invalid_arguments");
  }
  const nativeClient = createLocalNativeClient(parsed.value.nativeEndpoint);
  const ready = await nativeClient.proveReadiness(
    parsed.value.expectedInstanceId,
  );
  if (!ready) {
    nativeClient.close();
    throw new Error("local_host.native_readiness_failed");
  }

  const host = await startLocalHost({
    browserPort: parsed.value.browserPort,
    font: input.font,
    localPage: input.localPage,
    nativeClient,
    worker: input.worker,
  });
  process.stdout.write(`PAIRING_URL ${host.pairingUrl.toString()}\n`);
  await consumeControlInput(host);
}

async function consumeControlInput(host: {
  readonly revokeSessions: () => void;
  readonly stop: () => Promise<void>;
}): Promise<void> {
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let revoked = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      pending += decoder.decode(result.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "REVOKE_SESSIONS" && !revoked) {
          revoked = true;
          host.revokeSessions();
          continue;
        }
        if (line === "SHUTDOWN" && revoked) {
          await host.stop();
          return;
        }
        await host.stop();
        throw new Error("local_host.invalid_control");
      }
    }
  } finally {
    reader.releaseLock();
  }

  await host.stop();
  if (pending.length > 0) {
    throw new Error("local_host.invalid_control");
  }
}
