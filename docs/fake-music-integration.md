# Fake Music integration

The shipped `/fake/` entry exercises authorization, playback, failures, and
overlay rendering without Spotify configuration, authentication, storage, or
network requests. It is intended for local development, automated checks, and
controlled demonstrations.

## Enable the entry

Vite serves the entry during development:

```sh
npm run dev
```

Open `http://localhost:5173/fake/`. The Caddy deployment returns HTTP 404 for
`/fake`, `/fake/`, and `/fake/index.html` by default. Enable those paths only
when deliberately exposing the test facility:

```sh
docker run --rm --publish 127.0.0.1:8080:8080 \
  --env FAKE_PROVIDER_ENABLED=true \
  phrasic
```

Hosts that do not use the bundled Caddyfile must reproduce the same default-off
gate. Keep the route disabled in normal production deployments.

## Regenerate the demonstration

The checked-in harness builds the production app, launches a local preview and
headless Chrome, drives the complete Fake Music flow, records native
transparency at 24 fps, and replaces `docs/fake-music-flow.webp`:

```sh
docs/generate-fake-music-flow.sh
```

It requires the repository's npm dependencies, `google-chrome`, and `ffmpeg`.
Set `CHROME_BIN`, `PREVIEW_PORT`, or `CHROME_DEBUG_PORT` to override their
defaults. Temporary frames and the intermediate transparent GIF are removed
after the WebP is written.

## Send controls

Controls are same-window `message` events. Open the `/fake/` page's developer
console and call `window.postMessage` with the page origin as the target origin:

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: { kind: "resolve-authorization", decision: "approved" },
  },
  window.location.origin,
);
```

The outer object and every command object are exact contracts. Unknown fields,
missing fields, accessors, symbols, invalid identities, malformed text, and
invalid URLs are rejected without changing state.

### Authorization commands

Select **Connect Fake Music** before approving or denying authorization.

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: { kind: "resolve-authorization", decision: "denied" },
  },
  window.location.origin,
);

window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: { kind: "expire-authorization" },
  },
  window.location.origin,
);
```

Approval connects the provider, denial returns to authorization-required, and
expiry immediately invalidates the current credential. Duplicate or
out-of-order authorization decisions have no effect.

### Empty and unsupported playback

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: { kind: "set-empty" },
  },
  window.location.origin,
);

window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: { kind: "set-unsupported", reason: "advertisement" },
  },
  window.location.origin,
);
```

Unsupported reasons are `advertisement`, `local-item`, and
`unknown-item-type`.

### Custom track

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: {
      kind: "set-track",
      playback: "playing",
      itemId: "track-demo-1",
      title: "A deliberately long track title for marquee testing",
      itemUrl: "https://example.test/tracks/track-demo-1",
      artworkUrl: "/fake-artwork.svg",
      creators: [
        {
          creatorId: "creator-demo-1",
          name: "Example Artist",
          url: "https://example.test/artists/creator-demo-1",
        },
      ],
      collectionId: "collection-demo-1",
      collectionTitle: "Example Album",
      collectionUrl: "https://example.test/albums/collection-demo-1",
    },
  },
  window.location.origin,
);
```

Use `playback: "paused"` for a paused item. Track creators must be non-empty.
The item, every creator, and the collection require caller-supplied stable IDs
and HTTPS destinations.

### Custom episode

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: {
      kind: "set-episode",
      playback: "paused",
      itemId: "episode-demo-1",
      title: "The demonstration episode",
      itemUrl: "https://example.test/episodes/episode-demo-1",
      artworkUrl: null,
      showId: "show-demo-1",
      showTitle: "Example Show",
      publisher: "Example Publisher",
      showUrl: "https://example.test/shows/show-demo-1",
    },
  },
  window.location.origin,
);
```

Episodes require caller-supplied item and show IDs plus HTTPS destinations.
Text fields accept arbitrary non-empty strings. Artwork may be `null`, a
same-origin HTTP(S) URL, or an external HTTPS URL. Relative same-origin artwork
URLs are accepted. Playback position and duration are fixed valid fake values.

### Provider failures

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: {
      kind: "set-provider-failure",
      failure: { kind: "network-failure" },
    },
  },
  window.location.origin,
);
```

The `failure` value accepts these exact objects:

```text
{ kind: "malformed-response" }
{ kind: "network-failure" }
{ kind: "permission-denied" }
{ kind: "rate-limited", retryAfterMilliseconds: number | null }
{ kind: "server-failure", status: number }
{ kind: "unauthorized" }
{ kind: "unexpected-response", status: number }
```

`null` represents a missing or invalid retry delay. A network failure after an
item retains stale metadata while reconnecting; a network failure after empty
playback reconnects without stale metadata. A later content command triggers an
immediate recovery attempt.

### Terminal failures

```js
window.postMessage(
  {
    source: "phrasic-fake",
    version: 1,
    command: {
      kind: "set-fatal",
      reason: "browser-capability-unavailable",
    },
  },
  window.location.origin,
);
```

The other terminal reason is `configuration-unavailable`. Terminal state lasts
until page reload.

## Lifecycle

The integration starts authorization-required and keeps all authorization and
playback state in worker memory. The latest playback command is retained before
authorization and becomes the first connected state after approval. Logout,
page reload, and worker disposal erase authorization, pending work, playback,
and fatal state. Nothing is persisted or migrated, and there is no visible
fixture panel or cross-page control channel.
