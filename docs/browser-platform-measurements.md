# Bun Browser Build Measurements

This document records the current Bun browser-build surface. The pre-cutover
baseline and raw command output are retained in the Casefile preflight evidence
for the accepted Bun cutover.

## Reproducible commands

```sh
bun --version
bun ci --frozen-lockfile --omit peer
bun run format:check
bun run lint
bun run typecheck
bun run typecheck:browser
bun test --seed 20260713
bun run build
```

The build is one Bun API invocation for `index.html`, `spotify/index.html`, and
`fake/index.html`. It disables environment injection and source maps, bundles
Tailwind through `bun-plugin-tailwind`, emits deterministic metadata, copies
only the declared public-file allowlist, and emits separately built hashed URLs
for both module workers.

## Current artifact contract

- Root, Spotify, and Fake HTML entries are emitted at `index.html`,
  `spotify/index.html`, and `fake/index.html`.
- Browser chunks, CSS, imported artwork, and both workers have content hashes.
- The root public allowlist is `fake-artwork.svg`, `favicon.svg`,
  `fonts/GeistVF.woff`, and `spotify-full-logo-white.svg`.
- `build-metadata.json` records only deterministic build inputs; it contains no
  timestamps or build environment values.
- No production source maps or `sourceMappingURL` references are emitted.

## T-001 cutover measurement

Captured on Linux x86-64 with Bun `1.3.13`. The before values are the supplied
pre-cutover evidence for `eaea5340466347746788892e822662900a05f99b`; the after
values are two clean immutable installs and two production builds of this
source.

| Measure                         |                  Before |                   After |
| ------------------------------- | ----------------------: | ----------------------: |
| Clean install wall time         |                1,090 ms |                   62 ms |
| Second frozen install wall time |            not captured |                   66 ms |
| Installed dependencies          |       112,067,000 bytes |       119,288,297 bytes |
| Production build wall time      |                  550 ms | 272 ms (second: 188 ms) |
| Production output               | 425,907 bytes; 13 files | 425,080 bytes; 17 files |
| Browser JavaScript              |           335,826 bytes |           333,296 bytes |

Both immutable installs retained the exact `bun.lock` SHA-256. Although the
lock records `bun@1.3.14` as `bun-plugin-tailwind`'s peer resolution, the
canonical `bun ci --frozen-lockfile --omit peer` install omits it: the installed
`node_modules/bun` path is absent and the invoked Bun runtime is `1.3.13`.
The two generated production inventories were byte-for-byte identical.

`bun-plugin-tailwind` is an accepted direct build dependency. Its installed
payload is 7,221,297 bytes larger than the baseline, but it is not copied to the
deployed output. The deployed output is 827 bytes smaller than the Vite
baseline and deployed JavaScript is 2,530 bytes smaller, while retaining the
separate hashed Spotify and Fake worker bundles, deterministic metadata, and
the explicit public-file allowlist.

## Tracked source and dependency count

The tracked source/config inventory counts files with `.css`, `.html`, `.json`,
`.md`, `.mjs`, `.nix`, `.sh`, `.toml`, `.ts`, `.tsx`, or `.yml` suffixes, plus
`.dockerignore`, `.gitattributes`, `.gitignore`, `.oxlintrc.json`,
`.prettierignore`, `Caddyfile`, `Dockerfile`, and `package.json`. It deliberately
excludes lockfiles and public binary assets, so it measures maintained
source/config rather than install or deploy payload.

| Measure                     |  Before |   After |   Delta |
| --------------------------- | ------: | ------: | ------: |
| Tracked source/config files |     140 |     143 |      +3 |
| Tracked source/config bytes | 817,504 | 723,136 | -94,368 |
| Direct package dependencies |      13 |      11 |      -2 |

## Per-system Nix dependency hashes

The fixed-output Bun dependency derivation has distinct hashes for
`x86_64-linux` and `aarch64-linux`, because Bun selects architecture-specific
optional packages. The x86_64 package build and output inventory were run
natively. The aarch64 hash was constructed deterministically on this x86_64
host with `bun ci --frozen-lockfile --omit peer --os linux --cpu arm64` after
the derivation's local Husky-only preparation; its recursive Nix hash is
`sha256-ui859NfmeQ9jHjJVUsPkXcBm8hlq6PjeSeQ7BU/gnxE=`. Native aarch64 package
execution is not claimed here: it requires the T-003 remote-CI verification
gate because this host has neither aarch64 binfmt support nor a remote builder.
