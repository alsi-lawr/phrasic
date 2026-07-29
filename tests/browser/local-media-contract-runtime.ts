import { GetSnapshotResponse } from "../../apps/web/src/browser/generated/phrasic/local/v1/local_media_pb.js";

const fixturePath = "/fixtures/local-media/v1/snapshot.bin";

const fixtureResponse = await fetch(fixturePath);
if (!fixtureResponse.ok) {
  throw new Error(
    `Unable to load the local media fixture: ${fixtureResponse.status}.`,
  );
}

const binary = new Uint8Array(await fixtureResponse.arrayBuffer());
const snapshot = GetSnapshotResponse.deserializeBinary(binary);
const roundTripped = snapshot.serializeBinary();

if (
  roundTripped.byteLength !== binary.byteLength ||
  !roundTripped.every((value, index) => value === binary[index])
) {
  throw new Error("The browser generated contract changed the golden fixture.");
}

document.body.dataset.localMediaContract = "passed";
document.body.textContent = "Local media browser fixture round trip passed.";
