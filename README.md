<div align="center">

<img src="assets/phrasic.svg" alt="Phrasic logo" width="128" height="128">

# Phrasic

**A provider-neutral, browser-based now-playing display.**

Turn live playback metadata into a responsive visual with artwork, attribution,
long-text motion, accessible status updates, and honest connection states.

<p>
  <a href="https://github.com/alsi-lawr/phrasic/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/alsi-lawr/phrasic/actions/workflows/ci.yml/badge.svg?branch=master"></a>
  <a href="https://github.com/alsi-lawr/phrasic/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/alsi-lawr/phrasic?display_name=tag&sort=semver"></a>
</p>

[Get started](#get-started) · [Use the display](#use-the-display) ·
[Wiki](https://github.com/alsi-lawr/phrasic/wiki) ·
[Contributing](CONTRIBUTING.md)

</div>

<p align="center">
  <img
    src="assets/fake-music-flow.webp"
    alt="Phrasic demonstrating authorization, playback, artwork transitions, reconnecting, and long-title motion"
    width="100%"
  >
</p>

## Features

- Spotify tracks and podcast episodes with provider attribution and destinations.
- Native Local playback on supported x86-64 Linux and Windows hosts.
- Responsive layouts from `320` through `7680` pixels.
- Artwork transitions, long-text motion, and reduced-motion behavior.
- Explicit authorization, empty, unsupported, reconnecting, stale, and failure states.
- Browser-owned Spotify PKCE credentials; no client secret or playback history on the host.

## Providers

| Provider       | Route       | Use                                                 |
| -------------- | ----------- | --------------------------------------------------- |
| **Spotify**    | `/spotify/` | Live Spotify playback through browser-based PKCE.   |
| **Local**      | `/local/`   | Playback selected by the paired native service.     |
| **Fake Music** | `/fake/`    | Memory-only development and demonstration provider. |

## Get started

You need a public HTTPS origin, a Spotify Developer application, and Docker.
Register the exact callback:

```text
https://display.example/spotify/
```

Create `config.json`:

```json
{
  "spotify": {
    "clientId": "public-client-id",
    "redirectUri": "https://display.example/spotify/"
  }
}
```

Run the published image:

```sh
docker pull alsilawr/phrasic:latest

docker run --rm --publish 127.0.0.1:8080:8080 \
  --mount type=bind,src="$(pwd)/config.json",dst=/app/config.json,readonly \
  alsilawr/phrasic:latest
```

Put the container behind the HTTPS-owning reverse proxy for your public origin.
Do not add a Spotify client secret or publish the container directly on a public
interface. See the [deployment guide](https://github.com/alsi-lawr/phrasic/wiki/Deployment)
for the complete configuration and host boundary.

## Use the display

Open the setup URL, select **Connect Spotify**, and complete authorization in
that browser profile:

```text
https://display.example/spotify/?width=1920&setup=1
```

Then use the display without `setup=1`. Phrasic works in a browser window, web
view, signage surface, stream compositor, or browser-source implementation.

| Parameter | Value                            |
| --------- | -------------------------------- |
| `width`   | An integer from `320` to `7680`. |
| `setup`   | `1` to show setup controls.      |

For native playback, see [Local playback](https://github.com/alsi-lawr/phrasic/wiki/Local-Playback).

## Documentation

- [Deployment](https://github.com/alsi-lawr/phrasic/wiki/Deployment)
- [Local playback](https://github.com/alsi-lawr/phrasic/wiki/Local-Playback)
- [Troubleshooting](https://github.com/alsi-lawr/phrasic/wiki/Troubleshooting)
- [Fake Music provider](https://github.com/alsi-lawr/phrasic/wiki/Fake-Music-Provider)
- [Spotify display policy](https://github.com/alsi-lawr/phrasic/wiki/Spotify-Display-Policy)
- [Contributing](CONTRIBUTING.md)

Phrasic displays metadata only. It does not play, record, or redistribute audio.
