import assert from "node:assert/strict";
import test from "node:test";
import { parseFakeControlEnvelope } from "../../browser/fake/control.ts";

const applicationUrl = new URL("https://display.example/fake/");

const validTrackCommand = {
  kind: "set-track",
  playback: "playing",
  itemId: "track-1",
  title: "Track title",
  itemUrl: "https://music.example/tracks/track-1",
  artworkUrl: "https://display.example/artwork.jpg",
  creators: [
    {
      creatorId: "artist-1",
      name: "Track artist",
      url: "https://music.example/artists/artist-1",
    },
  ],
  collectionId: "album-1",
  collectionTitle: "Album title",
  collectionUrl: "https://music.example/albums/album-1",
} as const;

test("fake control ingress accepts a valid track command", () => {
  const result = parseFakeControlEnvelope(
    envelope(validTrackCommand),
    applicationUrl,
  );

  assert.equal(result.kind, "success");
  if (result.kind === "success") {
    assert.equal(result.value.kind, "set-track");
  }
});

test("fake control ingress rejects extra fields and invalid domain input", () => {
  const invalidInputs: ReadonlyArray<unknown> = [
    { ...envelope(validTrackCommand), extra: true },
    envelope({ ...validTrackCommand, extra: true }),
    envelope({ ...validTrackCommand, itemId: "   " }),
  ];

  for (const input of invalidInputs) {
    assert.deepEqual(parseFakeControlEnvelope(input, applicationUrl), {
      kind: "failure",
      error: { kind: "invalid-fake-control" },
    });
  }
});

function envelope(command: unknown): object {
  return {
    source: "phrasic-fake",
    version: 1,
    command,
  };
}
