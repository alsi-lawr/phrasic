# Spotify Display Policy

## Sources and approved asset

- Spotify Developer Policy: <https://developer.spotify.com/policy> (effective
  2025-05-15; accessed 2026-07-13).
- Spotify Design & Branding Guidelines:
  <https://developer.spotify.com/documentation/design> (accessed 2026-07-13).
- Approved mark source:
  <https://developer.spotify.com/images/guidelines/design/2024-spotify-full-logo.zip>.
  The bundled `public/spotify-full-logo-white.svg` is the exact
  `Full_Logo_White_RGB.svg` archive member, with SHA-256
  `31cdfcdd58d3533a32d287267a1c404f376749b1fc4da99e4baa2233684f053c`.

## Display contract

- Attribute Spotify metadata and artwork with the unmodified full white Spotify
  logo on the overlay's dark shell. Keep the mark outside the artwork, at least
  70 CSS px wide at the default 1920 px overlay width, and clear of competing
  visual elements.
- Render only Spotify-provided original cover art. Preserve its aspect ratio;
  do not crop, overlay, recolor, blur, animate, distort, or persist it. The
  single artwork-only rounded SVG clip uses the legacy 200 px radius scaled as
  `200 × 824 / 1080` from 1080 px artwork to the current 824-unit artwork.
- Present the supplied metadata without manipulation. The semantic companion
  must expose validated `ProviderLink` destinations for the current track or
  episode, every creator, and the applicable album or show. Links open outside
  the overlay and do not imply that the overlay plays content. Metadata and
  cover art must always link back to the applicable Spotify content and must
  not be offered as a standalone metadata or artwork service.
- Do not imply Spotify endorsement, a tie-in, co-branding, or promotion. Do not
  add playback controls.

## Non-rebroadcast limit

This application displays metadata only. It does not play, stream, record, or
redistribute Spotify audio. It must not be used to rebroadcast Spotify
recordings, synchronize Spotify recordings with visual media, or support
prohibited public, business, or commercial use. Users remain responsible for
complying with Spotify's Developer Terms, Developer Policy, and applicable
Spotify terms for their use case.
