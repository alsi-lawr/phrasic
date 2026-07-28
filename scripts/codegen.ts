import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createRequire } from "node:module";

import { windowsProtocExtractionCommand } from "./local-media-codegen-windows.ts";

type GeneratorTooling = {
  readonly grpcWebFile: string;
  readonly grpcWebSha256: string;
  readonly grpcWebUrl: string;
  readonly javascriptArchiveFile: string;
  readonly javascriptArchiveSha256: string;
  readonly javascriptArchiveUrl: string;
  readonly javascriptExecutable: string;
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
  "protoc-35.1-js-4.0.2-grpc-web-2.0.2",
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
  javascriptArchiveFile: "protobuf-javascript-4.0.2-linux-x86_64.zip",
  javascriptArchiveSha256:
    "e4b0bc2c9fe32a21167c6d84a50df21c2f405552f9a6ed7d5e858d92cac46d22",
  javascriptArchiveUrl:
    "https://github.com/protocolbuffers/protobuf-javascript/releases/download/v4.0.2/protobuf-javascript-4.0.2-linux-x86_64.zip",
  javascriptExecutable: join("bin", "protoc-gen-js"),
  protocArchiveFile: "protoc-35.1-linux-x86_64.zip",
  protocArchiveSha256:
    "6930ebf62bd4ea607b98fff052596c6ee564b9835b4ce172c75a3f53ae9d91b7",
  protocArchiveUrl:
    "https://github.com/protocolbuffers/protobuf/releases/download/v35.1/protoc-35.1-linux-x86_64.zip",
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
  javascriptArchiveFile: "protobuf-javascript-4.0.2-win64.zip",
  javascriptArchiveSha256:
    "3366089810f67c20c7c84d3e77607ab751e20eb1c5be295a2472363866ca07e1",
  javascriptArchiveUrl:
    "https://github.com/protocolbuffers/protobuf-javascript/releases/download/v4.0.2/protobuf-javascript-4.0.2-win64.zip",
  javascriptExecutable: join("bin", "protoc-gen-js.exe"),
  protocArchiveFile: "protoc-35.1-win64.zip",
  protocArchiveSha256:
    "5d3ff218d7d91eea95f7569bcb5a98f3030f8996d44151279d9772edcff76082",
  protocArchiveUrl:
    "https://github.com/protocolbuffers/protobuf/releases/download/v35.1/protoc-35.1-win64.zip",
  protocExecutable: join("bin", "protoc.exe"),
};

const platform = resolvePlatform();
await mkdir(cacheRoot, { recursive: true });
const protoc = await prepareArchivedTool(
  platform,
  platform.protocArchiveUrl,
  platform.protocArchiveFile,
  platform.protocArchiveSha256,
  platform.protocExecutable,
);
const javascriptPlugin = await prepareArchivedTool(
  platform,
  platform.javascriptArchiveUrl,
  platform.javascriptArchiveFile,
  platform.javascriptArchiveSha256,
  platform.javascriptExecutable,
);
const grpcWebPlugin = await downloadVerified(
  platform.grpcWebUrl,
  platform.grpcWebFile,
  platform.grpcWebSha256,
);
await chmod(grpcWebPlugin, 0o755);
if (platform.kind === "linux") {
  await chmod(javascriptPlugin, 0o755);
}

await run("cargo", ["build", "--locked", "--package", "phrasic-rpc"]);
await rm(join(generatedRoot, "phrasic"), { force: true, recursive: true });
await mkdir(generatedRoot, { recursive: true });
await run(protoc, [
  `--proto_path=${protoRoot}`,
  `--plugin=protoc-gen-js=${javascriptPlugin}`,
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

async function prepareArchivedTool(
  platform: GeneratorPlatform,
  archiveUrl: string,
  archiveFile: string,
  archiveSha256: string,
  executablePath: string,
): Promise<string> {
  const archive = await downloadVerified(
    archiveUrl,
    archiveFile,
    archiveSha256,
  );
  const executable = join(cacheRoot, executablePath);
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
  const executable = Bun.which(command);
  if (executable === null) {
    throw new Error(`codegen command unavailable: ${command}`);
  }
  const resolvedExecutable = await realpath(executable);
  const invocation =
    command === "cargo" && basename(resolvedExecutable) === "rustup"
      ? [resolvedExecutable, "run", "stable", "cargo", ...arguments_]
      : [resolvedExecutable, ...arguments_];
  const process_ = Bun.spawn(invocation, {
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
