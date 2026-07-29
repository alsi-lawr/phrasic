# Contributing to Phrasic

## Development environment

The locked Nix shell provides Bun, Chromium, ffmpeg, and rustup. The repository
declares its stable Rust toolchain in `rust-toolchain.toml`.

```sh
nix develop
bun ci --frozen-lockfile --omit peer
bun run dev
```

Without Nix, install the current stable Bun and Rust toolchains. Chromium and
ffmpeg are additionally required to regenerate the demonstration.

The development server exposes Spotify at `http://localhost:5173/spotify/` and
Fake Music at `http://localhost:5173/fake/`.

## Repository layout

```text
apps/
  host/       Bun production host and native Local browser gateway
  web/        browser source, provider entrypoints, and public assets
packages/
  domain/     provider-neutral TypeScript playback domain
crates/       Rust workspace for native playback
proto/        Local media protocol
fixtures/     generated cross-runtime contract fixtures
scripts/      build, verification, code generation, and demo tooling
tests/        runtime, browser, host, and domain behavior tests
```

Build and run the production host locally:

```sh
bun run build
bun run serve
```

Build the complete x86-64 Linux Nix package or its hosted-only output:

```sh
nix build
nix build .#host
```

## Local playback development

Build the target-specific Local host before running the Rust service:

```sh
bun run build:local-host linux
PHRASIC_LOCAL_HOST="$(pwd)/dist/native/linux/phrasic-local-host" \
  cargo run --locked -p phrasic -- serve ./phrasic.toml
```

Use `windows` instead of `linux` for the Windows build. Configuration, pairing,
source selection, and artwork behavior are documented in the
[Local playback guide](https://github.com/alsi-lawr/phrasic/wiki/Local-Playback).

## Generated Local media contract

Regenerate the browser bindings and binary fixture after changing the protobuf:

```sh
bun run codegen
```

CI verifies that the generated output is current with:

```sh
bun run codegen:check
```

## Checks

Run the narrow check relevant to a change while working, then the complete local
suite before proposing it:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run typecheck:browser
bun run test:local-media-browser
bun test --seed 20260713
bun run build

cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
```

The platform CI entrypoints are `scripts/ci.sh linux-x64` and
`scripts/ci.sh win-x64`. The Linux job also runs the private D-Bus integration
suite, native gateway smoke check, and Rust target-isolation verification.

## Fake Music and the README demonstration

The Fake Music route exercises authorization, playback, recovery, and overlay
states without external accounts or persistence. Its control contract is in the
[Fake Music provider guide](https://github.com/alsi-lawr/phrasic/wiki/Fake-Music-Provider).

Regenerate the README demonstration with:

```sh
scripts/generate-fake-music-flow.sh
```

The harness builds Phrasic, launches an isolated headless Chromium session,
records the flow, and replaces `assets/fake-music-flow.webp`.
