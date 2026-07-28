import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createRequire } from "node:module";

import { windowsProtocExtractionCommand } from "./local-media-codegen-windows.ts";

type GeneratorTooling = {
  readonly grpcWebFile: string;
  readonly grpcWebSha256: string;
  readonly grpcWebUrl: string;
  readonly protocArchiveFile: string;
  readonly protocArchiveSha256: string;
  readonly protocArchiveUrl: string;
  readonly protocExecutable: string;
};

type GeneratorPlatform =
  | (GeneratorTooling & {
      readonly kind: "linux";
      readonly unzipCommand: readonly ["unzip", "-q"];
    })
  | (GeneratorTooling & {
      readonly kind: "windows";
    });

const workspaceRoot = join(import.meta.dir, "..");
const cacheRoot = join(
  Bun.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "phrasic-codegen",
);
const generatedRoot = join(workspaceRoot, "browser", "generated");
const fixtureRoot = join(workspaceRoot, "fixtures", "local-media", "v1");
const protoRoot = join(workspaceRoot, "proto");
const schemaPath = join(
  protoRoot,
  "phrasic",
  "local",
  "v1",
  "local_media.proto",
);

const linuxX64: GeneratorPlatform = {
  kind: "linux",
  grpcWebFile: "protoc-gen-grpc-web-2.0.2-linux-x86_64",
  grpcWebSha256:
    "10ff6c6e58018ff9e684cff1d9c008b8cc79d915c4f8be4fd47791333e1be299",
  grpcWebUrl:
    "https://github.com/grpc/grpc-web/releases/download/2.0.2/protoc-gen-grpc-web-2.0.2-linux-x86_64",
  protocArchiveFile: "protoc-3.20.3-linux-x86_64.zip",
  protocArchiveSha256:
    "44a6b498e996b845edef83864734c0e52f42197e85c9d567af55f4e3ff09d755",
  protocArchiveUrl:
    "https://github.com/protocolbuffers/protobuf/releases/download/v3.20.3/protoc-3.20.3-linux-x86_64.zip",
  protocExecutable: join("bin", "protoc"),
  unzipCommand: ["unzip", "-q"],
};

const windowsX64: GeneratorPlatform = {
  kind: "windows",
  grpcWebFile: "protoc-gen-grpc-web-2.0.2-windows-x86_64.exe",
  grpcWebSha256:
    "9cf57127b2893f5def6f04bf70c53b190c440e4d315f068346798a43ac4834ce",
  grpcWebUrl:
    "https://github.com/grpc/grpc-web/releases/download/2.0.2/protoc-gen-grpc-web-2.0.2-windows-x86_64.exe",
  protocArchiveFile: "protoc-3.20.3-win64.zip",
  protocArchiveSha256:
    "08e885a5d4dc1306cf31d0861527abd1d0953d6b8ad9a1fbadccecda6c4e4ba0",
  protocArchiveUrl:
    "https://github.com/protocolbuffers/protobuf/releases/download/v3.20.3/protoc-3.20.3-win64.zip",
  protocExecutable: join("bin", "protoc.exe"),
};

const platform = resolvePlatform();
await mkdir(cacheRoot, { recursive: true });
const protoc = await prepareProtoc(platform);
const grpcWebPlugin = await downloadVerified(
  platform.grpcWebUrl,
  platform.grpcWebFile,
  platform.grpcWebSha256,
);
await chmod(grpcWebPlugin, 0o755);

await run("cargo", ["build", "--locked", "--package", "phrasic-rpc"]);
await rm(join(generatedRoot, "phrasic"), { force: true, recursive: true });
await mkdir(generatedRoot, { recursive: true });
await run(protoc, [
  `--proto_path=${protoRoot}`,
  `--plugin=protoc-gen-grpc-web=${grpcWebPlugin}`,
  `--js_out=import_style=commonjs,binary:${generatedRoot}`,
  `--grpc-web_out=import_style=commonjs+dts,mode=grpcweb:${generatedRoot}`,
  schemaPath,
]);
await writeFixtures();

function resolvePlatform(): GeneratorPlatform {
  if (process.platform === "linux" && process.arch === "x64") {
    return linuxX64;
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return windowsX64;
  }

  throw new Error("codegen supports Linux x64 and Windows x64 only");
}

async function prepareProtoc(platform: GeneratorPlatform): Promise<string> {
  const archive = await downloadVerified(
    platform.protocArchiveUrl,
    platform.protocArchiveFile,
    platform.protocArchiveSha256,
  );
  const executable = join(cacheRoot, platform.protocExecutable);
  if (await exists(executable)) {
    return executable;
  }

  if (platform.kind === "linux") {
    const [unzipCommand, ...unzipArguments] = platform.unzipCommand;
    await run(unzipCommand, [...unzipArguments, archive, "-d", cacheRoot]);
    return executable;
  }

  const [windowsCommand, ...windowsArguments] = windowsProtocExtractionCommand(
    archive,
    cacheRoot,
  );
  await run(windowsCommand, windowsArguments);
  return executable;
}

async function downloadVerified(
  url: string,
  file: string,
  sha256: string,
): Promise<string> {
  const destination = join(cacheRoot, file);
  if (await exists(destination)) {
    await verifySha256(destination, sha256);
    return destination;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`codegen download failed: ${response.status} ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) {
    throw new Error(
      `codegen download checksum mismatch for ${basename(destination)}`,
    );
  }

  await writeFile(destination, bytes);
  return destination;
}

async function verifySha256(path: string, expected: string): Promise<void> {
  const actual = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (actual !== expected) {
    throw new Error(`codegen cache checksum mismatch for ${basename(path)}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function run(
  command: string,
  arguments_: ReadonlyArray<string>,
): Promise<void> {
  const process_ = Bun.spawn([command, ...arguments_], {
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await process_.exited;
  if (exitCode !== 0) {
    throw new Error(`codegen command failed: ${command}`);
  }
}

async function writeFixtures(): Promise<void> {
  const require = createRequire(import.meta.url);
  const generated = require(
    join(generatedRoot, "phrasic", "local", "v1", "local_media_pb.js"),
  );
  const snapshot = new generated.GetSnapshotResponse();
  const capability = new generated.CapabilityState();
  const available = new generated.AvailableSnapshot();
  const item = new generated.PlaybackItem();
  const timeline = new generated.Timeline();

  capability.setStatus(generated.CapabilityStatus.CAPABILITY_STATUS_AVAILABLE);
  item.setTitle("Northern lights");
  item.setCreator("Phrasic fixture");
  timeline.setPositionMilliseconds(1_234);
  timeline.setDurationMilliseconds(3_456);
  available.setActivity(generated.PlaybackActivity.PLAYBACK_ACTIVITY_PLAYING);
  available.setItem(item);
  available.setTimeline(timeline);
  available.setSelectionReason(
    generated.SelectionReason.SELECTION_REASON_SOLE_PLAYING,
  );
  snapshot.setInstanceId(
    new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  );
  snapshot.setRevision(42);
  snapshot.setObservedAtMonotonicMilliseconds(12_345);
  snapshot.setPollHintMilliseconds(1_000);
  snapshot.setCapability(capability);
  snapshot.setAvailable(available);

  const binary = snapshot.serializeBinary();
  await mkdir(fixtureRoot, { recursive: true });
  await writeFile(join(fixtureRoot, "snapshot.bin"), binary);
}
