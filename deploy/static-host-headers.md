# Static-host response header and cache contract

This is a host-agnostic deployment contract. It is **not automatically applied**
by Vite, this repository, or the generated `dist/` directory. Configure an HTTPS
static host and any CDN in front of it to emit these response headers for the
published origin.

## Required baseline response headers

Send these headers on every application response. The CSP is shown as a single
line because HTTP header values are single lines.

```http
Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data: https://i.scdn.co; font-src 'self'; connect-src 'self' https://accounts.spotify.com https://api.spotify.com; worker-src 'self'; manifest-src 'self'; media-src 'none'; frame-src 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), web-share=(), xr-spatial-tracking=()
```

The CSP permits only same-origin application files, the Spotify accounts and API
origins required by PKCE and playback polling, and Spotify's documented
`https://i.scdn.co` artwork origin. `data:` is retained solely for the
build-embedded fallback artwork; it does not allow an arbitrary network image
origin. No generic `https:` source is permitted for images or connections.

## Required cache rules

Apply cache rules by URL path, ignoring the query string. In particular, every
OAuth callback request to `/spotify/`, including one with `code`, `state`, or an
error parameter, must receive the callback HTML rule.

| Published path                                                   | Required response header                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `/config.json`                                                   | `Cache-Control: no-store, no-cache, max-age=0, must-revalidate` |
| `/spotify/` and `/spotify/index.html`                            | `Cache-Control: no-store, no-cache, max-age=0, must-revalidate` |
| `/`, `/index.html`, and every other HTML entry                   | `Cache-Control: no-cache, max-age=0, must-revalidate`           |
| `/assets/<name>-<content-hash>.<ext>` emitted by Vite            | `Cache-Control: public, max-age=31536000, immutable`            |
| `/fonts/*`, `/favicon.ico`, and every other unhashed static file | `Cache-Control: no-cache, max-age=0, must-revalidate`           |

Serve `/config.json` as `Content-Type: application/json; charset=utf-8`. Its
entire public runtime shape is:

```json
{
  "spotify": {
    "clientId": "public-client-id",
    "redirectUri": "https://deployment.example/spotify/"
  }
}
```

The client ID and redirect URI are public by design. Do not put a client secret,
token, credential, or any other configuration field in that file. Runtime
configuration is always requested from same-origin `/config.json`; Vite build
environment values are not a configuration channel.

## What metadata cannot enforce

Both HTML entries contain CSP and referrer metadata as a browser fallback. They
do not replace the HTTP headers above:

- Only an HTTP CSP can enforce `frame-ancestors`, and the header is applied
  before the document is parsed.
- `Cache-Control`, `X-Content-Type-Options`, and `Permissions-Policy` are
  response protections; HTML metadata cannot apply them to configuration, worker,
  font, or asset responses.
- The `Referrer-Policy` header covers every response and navigation. The HTML
  metadata only affects the parsed document.

Do not add deployment-provider files, service workers, cache layers, or runtime
secret injection to implement this contract.
