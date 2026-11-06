#!/bin/bash
# usage: build.sh probe.ts -> out/probe.mjs
W=/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
mkdir -p /tmp/ir-w3/probes/out
"$W/node_modules/.bin/esbuild" "$1" --bundle --platform=node --format=esm --conditions=source \
  --alias:HOSTSRC=$W/packages/mcp/mcp-host-local/src/index.ts \
  --outfile=/tmp/ir-w3/probes/out/$(basename "$1" .ts).mjs --log-level=warning \
  --resolve-extensions=.ts,.js,.mjs --main-fields=module,main
