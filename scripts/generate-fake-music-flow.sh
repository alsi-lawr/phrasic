#!/usr/bin/env bash
set -euo pipefail

exec bun "$(dirname -- "${BASH_SOURCE[0]}")/demo/generate-fake-music-flow.mjs"
