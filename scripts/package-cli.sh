#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec node --experimental-strip-types "$root/apps/cli/tools/package.ts" "$@"
