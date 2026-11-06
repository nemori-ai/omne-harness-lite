#!/bin/bash
W=/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host
"$W/node_modules/.bin/esbuild" "$1" --bundle --platform=node --format=esm --conditions=source \
  --alias:HOSTSRC=$W/packages/mcp/mcp-host-local/src/index.ts \
  --outfile=/tmp/w3r3-a/out/$(basename "$1" .ts).mjs --log-level=warning \
  --resolve-extensions=.ts,.js,.mjs --main-fields=module,main
