#!/usr/bin/env bash
set -euo pipefail

readonly toolchain='1.88.0'
readonly linux_target='x86_64-unknown-linux-gnu'
readonly windows_target='x86_64-pc-windows-msvc'
readonly unsupported_diagnostic='Phrasic Local Media supports x86-64 Linux GNU and Windows MSVC targets only; generic macOS and native ARM64 are unsupported.'

require_exact_unsupported_diagnostic() {
  local target="$1"
  local output

  output="$(mktemp)"
  if cargo "+${toolchain}" check --locked -p phrasic --target "$target" >"$output" 2>&1; then
    rm -f "$output"
    printf 'unsupported target unexpectedly compiled: %s\n' "$target" >&2
    return 1
  fi

  grep -F -- "$unsupported_diagnostic" "$output"
  rm -f "$output"
}

require_dep_info_adapter() {
  local target="$1"
  local included_adapter="$2"
  local excluded_adapter="$3"
  local dep_info_directory="target/${target}/debug/deps"
  local dep_info_found='false'
  local dep_info

  while IFS= read -r dep_info; do
    dep_info_found='true'
    grep -F -- "$included_adapter" "$dep_info"
    if grep -F -- "$excluded_adapter" "$dep_info"; then
      printf 'target %s dep-info includes the opposite adapter: %s\n' "$target" "$dep_info" >&2
      exit 1
    fi
  done < <(find "$dep_info_directory" -maxdepth 1 -type f -name 'phrasic-*.d' -print)

  if [[ "$dep_info_found" != 'true' ]]; then
    printf 'target %s has no phrasic dep-info files\n' "$target" >&2
    exit 1
  fi
}

for target in "$linux_target" "$windows_target"; do
  cargo "+${toolchain}" metadata --locked --format-version=1 --filter-platform "$target" >/dev/null
  cargo "+${toolchain}" tree --locked -p phrasic --target "$target" --all-features --edges all
  cargo "+${toolchain}" check --locked -p phrasic --all-targets --target "$target"
done

rustc "+${toolchain}" --print cfg --target "$linux_target" | grep -Fx 'target_vendor="unknown"'
rustc "+${toolchain}" --print cfg --target "$windows_target" | grep -Fx 'target_vendor="pc"'
require_dep_info_adapter "$linux_target" 'crates/phrasic/src/platform/linux.rs' 'crates/phrasic/src/platform/windows.rs'
require_dep_info_adapter "$windows_target" 'crates/phrasic/src/platform/windows.rs' 'crates/phrasic/src/platform/linux.rs'

grep -F -- '#[path = "platform/linux.rs"]' crates/phrasic/src/main.rs
grep -F -- '#[path = "platform/windows.rs"]' crates/phrasic/src/main.rs

if grep -RInE --include='*.rs' '(std::env::consts::OS|cfg!\(target_os|TcpListener|UdpSocket|Command::new|\.spawn\(|static[[:space:]]+mut|OnceLock|LazyLock)' crates/phrasic/src; then
  printf '%s\n' 'forbidden runtime selection, effect, or global mutable state in production Rust source' >&2
  exit 1
fi

if grep -RInE --include='*.rs' '(\.unwrap\(|\.expect\(|\b(panic|todo|unimplemented)[[:space:]]*!|^[[:space:]]*unsafe[[:space:]])' crates scripts; then
  printf '%s\n' 'forbidden Rust shortcut or unsafe block found' >&2
  exit 1
fi

require_exact_unsupported_diagnostic x86_64-apple-darwin
require_exact_unsupported_diagnostic aarch64-unknown-linux-gnu
require_exact_unsupported_diagnostic riscv64gc-unknown-linux-gnu

cargo "+${toolchain}" build --locked --release --target "$linux_target" -p phrasic
readonly linux_binary="target/${linux_target}/release/phrasic"
readonly highest_glibc="$({ readelf --version-info "$linux_binary" | grep -oE 'GLIBC_[0-9]+\.[0-9]+' | sed 's/GLIBC_//' | sort -V | tail -n 1; } || true)"

if grep -aqF -- 'windows-empty-adapter' "$linux_binary"; then
  printf '%s\n' 'Linux artifact contains the Windows adapter marker' >&2
  exit 1
fi

if ! grep -aqF -- 'linux-empty-adapter' "$linux_binary"; then
  printf '%s\n' 'Linux artifact does not contain the Linux adapter marker' >&2
  exit 1
fi

if [[ -z "$highest_glibc" ]]; then
  printf '%s\n' 'Linux binary has no inspectable GLIBC symbol requirement' >&2
  exit 1
fi

if [[ "$(printf '%s\n%s\n' '2.35' "$highest_glibc" | sort -V | tail -n 1)" != '2.35' ]]; then
  printf 'Linux binary requires GLIBC_%s, above the 2.35 support floor\n' "$highest_glibc" >&2
  exit 1
fi

printf 'Linux binary maximum GLIBC symbol: %s\n' "$highest_glibc"
