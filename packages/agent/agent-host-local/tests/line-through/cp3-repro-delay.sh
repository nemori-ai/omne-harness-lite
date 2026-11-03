#!/usr/bin/env bash
# Widens the AD-02 window between the read of the execution head and its commitLog by a pure
# scheduling delay, then runs CP3 with cp3-repro-loop.sh. It patches only the built
# session-adapters dist file of $ROOT (no logic change) and restores it on exit. KL-146 in
# ../README.md uses it.
# Usage: cp3-repro-delay.sh <delay-ms> <runs> <tag>   (ROOT and OUT as in cp3-repro-loop.sh)
set -u
here=$(cd "$(dirname "$0")" && pwd)
export ROOT=${ROOT:-$(git -C "$here" rev-parse --show-toplevel)}
delay=${1:?delay-ms}
runs=${2:?runs}
tag=${3:?tag}
file="$ROOT/packages/session/session-adapters/dist/cordis/journal-interpretation.js"
saved=$(mktemp)
cp "$file" "$saved"
trap 'cp "$saved" "$file"; rm -f "$saved"' EXIT
sed -i 's#^\(\s*\)const read = await ports.read(\(.*\));$#\1const read = await ports.read(\2);\n\1await new Promise(resolve => setTimeout(resolve, '"$delay"'));#' "$file"
grep -q "setTimeout(resolve, $delay)" "$file" || { echo "the read of AD-02 was not found in $file"; exit 2; }
bash "$here/cp3-repro-loop.sh" "$runs" "$tag"
