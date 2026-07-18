#!/usr/bin/env bash
set -euo pipefail

exec bun "$(dirname -- "${BASH_SOURCE[0]}")/fake-music-flow/generate.mjs"
