# Spotify Now Playing for OBS

A browser-only now-playing overlay for OBS. The static Vite SPA at `/spotify/`
uses Spotify PKCE authorization in the browser to display the current Spotify
track or episode.

Each browser profile has one Spotify connection per deployed origin. The
application has no application server, client secret, database, playback
history, or Spotify audio playback or rebroadcasting.

## Build and deploy

Build the container image:

```sh
docker build -t obs-nowplaying .
```

Create a deployment-specific `config.json` beside the command:

```json
{
  "spotify": {
    "clientId": "public-client-id",
    "redirectUri": "https://overlay.example/spotify/"
  }
}
```

Run the static server on port 8080, mounting that file read-only at its static
root:

```sh
docker run --rm --publish 8080:8080 \
  --mount type=bind,src="$(pwd)/config.json",dst=/srv/config.json,readonly \
  obs-nowplaying
```

Register exactly `https://overlay.example/spotify/` as the Spotify redirect URI,
replacing `overlay.example` with the public HTTPS origin in both the Dashboard
and `config.json`. The `/spotify/` path, including its trailing slash, must
match exactly and have no query string or fragment. The client ID and redirect
URI are public; do not add tokens, a client secret, or other fields.

For public TLS and routing, an outer Caddy may proxy to the container:

```caddyfile
overlay.example {
  reverse_proxy 127.0.0.1:8080
}
```

Caddy-to-Caddy is intentional packaging isolation: the outer Caddy owns TLS
and routing; the container's Caddy owns this app's static files and response
headers. The bundled Caddyfile applies the [static-host response header and
cache contract](deploy/static-host-headers.md); non-container static hosts and
CDNs must reproduce it.

## Add the overlay to OBS

1. Add a **Browser Source** using
   `https://overlay.example/spotify/?width=1920&setup=1`, replacing the origin
   with your deployment. Set the OBS source width to match the URL width.
2. Right-click the source, choose **Interact**, select **Connect Spotify**, and
   complete authorization in that Browser Source's browser profile.
3. Once connected, remove `&setup=1` for the clean overlay URL:
   `https://overlay.example/spotify/?width=1920`.

`width` is optional and defaults to `1920`; when supplied, it must occur once
and be an integer from `320` through `7680`. `setup=1` enables setup controls.
Malformed, repeated, out-of-range, or unsupported display parameters show an
in-overlay setup diagnostic and use the default display width.

To reconnect or log out later, add `setup=1` again and use **Interact**.
**Disconnect Spotify** clears that profile's connection, after which **Connect
Spotify** authorizes again. **Reconnect Spotify** is available while playback
is reconnecting; **Retry playback** is available after a playback-update
failure.

## Troubleshooting

| Symptom                                                | What to check                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spotify rejects the callback or does not return to OBS | Register the exact HTTPS `https://overlay.example/spotify/` callback, make it match the `redirectUri` in `/config.json`, and physically serve `/spotify/` with its trailing slash. |
| The overlay reports unavailable configuration          | Put the exact two-field JSON at same-origin `/config.json`, serve it as JSON, do not cache it, and remove extra fields.                                                            |
| Spotify access was revoked                             | Open `?setup=1` through **Interact**, disconnect, then connect and approve Spotify again.                                                                                          |
| Nothing is playing                                     | Start a Spotify track or episode in the connected account. This overlay displays metadata; it does not play audio.                                                                 |
| The current item is unsupported                        | Only Spotify tracks and episodes are displayable.                                                                                                                                  |
| A width diagnostic appears                             | Use one integer `width` from `320` to `7680`, and use `setup=1` only once when setup controls are needed.                                                                          |

## Spotify attribution and artwork

The overlay attributes Spotify with its full Spotify logo. Metadata and
Spotify-provided artwork link back to the applicable Spotify content; preserve
that attribution and link relationship. Artwork must retain its aspect ratio;
apart from the permitted proportional corner rounding, it must not be cropped,
overlaid, recolored, blurred, animated, distorted, or persisted. Do not use the
overlay to present Spotify metadata or artwork as a standalone service or to
redistribute Spotify audio.

Read the repository's [Spotify display policy](docs/spotify-display-policy.md)
alongside the [Spotify Developer Policy](https://developer.spotify.com/policy)
and [Spotify Design & Branding Guidelines](https://developer.spotify.com/documentation/design).

## 2.0 breaking boundary

There is no v1 migration. Deploy the static `dist/` output, provide the current
`/config.json`, and authorize again for each browser origin and profile that
will use the overlay.
