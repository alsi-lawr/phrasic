#!/usr/bin/env bash
set -euo pipefail

export HUSKY=0
bun ci --frozen-lockfile --omit peer
bun run codegen:check

case "${1:-}" in
  linux-x64)
    rustup target add x86_64-pc-windows-msvc x86_64-apple-darwin \
      aarch64-unknown-linux-gnu riscv64gc-unknown-linux-gnu
    bun run format:check
    bun run lint
    bun run typecheck
    bun run typecheck:browser
    bun run test:local-media-browser
    bun test --seed 20260713
    bun run build
    bun run build:local-host linux
    cargo build --locked -p phrasic
    bun run scripts/verify-native-local-gateway.ts linux
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets --locked -- -D warnings
    cargo test --workspace --locked
    scripts/verify-rust-target-isolation.sh
    ;;
  win-x64)
    bun run build:local-host windows
    cargo build --locked -p phrasic
    bun run scripts/verify-native-local-gateway.ts windows
    cargo test --workspace --locked
    ;;
  *)
    printf 'unsupported CI RID: %s\n' "${1:-<missing>}" >&2
    exit 1
    ;;
esac
