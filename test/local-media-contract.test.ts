import { expect, test } from "bun:test";

import { windowsProtocExtractionCommand } from "../scripts/local-media-codegen-windows.ts";
import { GetSnapshotResponse } from "../browser/generated/phrasic/local/v1/local_media_pb.js";

const fixturePath = "fixtures/local-media/v1/snapshot.bin";

test("generated Bun contract round-trips the golden binary fixture", async (): Promise<void> => {
  const binary = new Uint8Array(await Bun.file(fixturePath).arrayBuffer());
  const snapshot = GetSnapshotResponse.deserializeBinary(binary);

  expect(snapshot.getInstanceId_asU8()).toHaveLength(16);
  expect(snapshot.getRevision()).toBe(42);
  expect(snapshot.getPollHintMilliseconds()).toBe(1_000);
  expect(snapshot.serializeBinary()).toEqual(binary);
});

test("Windows codegen invokes PowerShell with one complete extraction command", (): void => {
  expect(
    windowsProtocExtractionCommand(
      "C:\\Users\\O'Hara\\.cache\\protoc.zip",
      "C:\\Users\\O'Hara\\.cache",
    ),
  ).toEqual([
    "powershell",
    "-NoProfile",
    "-Command",
    "Expand-Archive -LiteralPath 'C:\\Users\\O''Hara\\.cache\\protoc.zip' -DestinationPath 'C:\\Users\\O''Hara\\.cache'",
  ]);
});
