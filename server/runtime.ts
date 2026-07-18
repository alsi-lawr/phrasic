import { startProductionHost } from "./host.ts";

const host = await startProductionHost({
  assetDirectory: import.meta.dir,
  configPath: Bun.env.PHRASIC_CONFIG_PATH ?? `${import.meta.dir}/config.json`,
  fakeProviderEnabled: Bun.env.FAKE_PROVIDER_ENABLED === "true",
  hostname: Bun.env.HOST ?? "0.0.0.0",
  port: parsePort(Bun.env.PORT),
});

let stopping = false;

async function stop(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  await host.stop();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

function parsePort(input: string | undefined): number {
  if (input === undefined) {
    return 8080;
  }

  const port = Number(input);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
  }

  return port;
}
