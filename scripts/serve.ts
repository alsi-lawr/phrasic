import { startProductionHost } from "../server/host.ts";

const host = await startProductionHost({
  assetDirectory: Bun.env.PHRASIC_ASSET_ROOT ?? "dist",
  configPath: Bun.env.PHRASIC_CONFIG_PATH ?? "config.json",
  fakeProviderEnabled: Bun.env.FAKE_PROVIDER_ENABLED === "true",
  hostname: Bun.env.HOST ?? "0.0.0.0",
  port: parsePort(Bun.env.PORT),
});

console.info(`Phrasic production server: ${host.url}`);

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
