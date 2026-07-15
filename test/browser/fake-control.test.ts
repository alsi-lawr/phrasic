import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFakeControlEnvelope,
  type FakeControlCommand,
} from "../../browser/fake/control.ts";
import type { Result } from "../../domain/playback.ts";

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

test("fake control ingress validates track commands into trusted domain values", () => {
  const command = expectSuccess(
    parseFakeControlEnvelope(envelope(validTrackCommand), applicationUrl),
  );

  assert.equal(command.kind, "set-track");
  if (command.kind !== "set-track") {
    throw new Error("Expected a parsed track command");
  }

  assert.equal(command.itemId, "track-1");
  assert.equal(command.title, "Track title");
  assert.deepEqual(command.itemLink, {
    providerId: "fake",
    href: "https://music.example/tracks/track-1",
  });
  assert.deepEqual(command.artwork, {
    kind: "available",
    url: "https://display.example/artwork.jpg",
  });
  assert.deepEqual(command.creators, [
    {
      creatorId: "artist-1",
      creator: {
        name: "Track artist",
        links: [
          {
            providerId: "fake",
            href: "https://music.example/artists/artist-1",
          },
        ],
      },
    },
  ]);
  assert.deepEqual(command.collection, {
    id: "album-1",
    title: "Album title",
    links: [
      {
        providerId: "fake",
        href: "https://music.example/albums/album-1",
      },
    ],
  });
});

test("fake control ingress rejects extra fields and invalid domain values", () => {
  const invalidCommands: ReadonlyArray<unknown> = [
    { ...validTrackCommand, extra: true },
    { ...validTrackCommand, itemId: "   " },
    { ...validTrackCommand, title: "" },
    { ...validTrackCommand, itemUrl: "http://music.example/track-1" },
    {
      ...validTrackCommand,
      creators: [{ ...validTrackCommand.creators[0], name: "\t" }],
    },
    { ...validTrackCommand, collectionId: "" },
  ];

  for (const command of invalidCommands) {
    assert.deepEqual(
      parseFakeControlEnvelope(envelope(command), applicationUrl),
      {
        kind: "failure",
        error: { kind: "invalid-fake-control" },
      },
    );
  }

  assert.deepEqual(
    parseFakeControlEnvelope(
      { ...envelope(validTrackCommand), extra: true },
      applicationUrl,
    ),
    {
      kind: "failure",
      error: { kind: "invalid-fake-control" },
    },
  );
});

function envelope(command: unknown): object {
  return {
    source: "phrasic-fake",
    version: 1,
    command,
  };
}

function expectSuccess(
  result: Result<FakeControlCommand, unknown>,
): FakeControlCommand {
  if (result.kind === "success") {
    return result.value;
  }

  throw new Error("Expected a valid fake control command");
}
