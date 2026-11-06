#!/usr/bin/env bash
cd "$(dirname "$0")"
M=./mutate.sh
D=mutdefs
C=@omne-harness/mcp-contract
H=@omne-harness/mcp-host-local
P=@omne-harness/mcp
B=build.ts; L=lost.ts
m=packages/mcp/mcp/src/internal
bash $M V1 $m/build.ts $D/V1.old $D/V1.new "$P" packages/mcp/mcp --mode fast tests/ensure.spec.ts tests/refresh.spec.ts
bash $M V2 $m/build.ts $D/V2.old $D/V2.new "$P" packages/mcp/mcp --mode fast tests/ensure.spec.ts tests/refresh.spec.ts
bash $M V3 $m/lost.ts $D/V3.old $D/V3.new "$P" packages/mcp/mcp --mode fast tests/lost.spec.ts
bash $M V4 $m/lost.ts $D/V4.old $D/V4.new "$P" packages/mcp/mcp --mode fast tests/lost.spec.ts
bash $M V11 $m/lost.ts $D/V11.old $D/V11.new "$P" packages/mcp/mcp --mode fast tests/tasks.spec.ts
bash $M V12 $m/build.ts $D/V12.old $D/V12.new "$P" packages/mcp/mcp --mode fast tests/refresh.spec.ts
k=packages/mcp/mcp-contract/src
bash $M V5c $k/decisions.ts $D/V5.old $D/V5.new "$C" packages/mcp/mcp-contract --mode fast tests/decisions.spec.ts
bash $M V5h $k/decisions.ts $D/V5.old $D/V5.new "$C $H" packages/mcp/mcp-host-local --mode fast tests/session.spec.ts
bash $M V6 $k/decisions.ts $D/V6.old $D/V6.new "$C" packages/mcp/mcp-contract --mode fast tests/decisions.spec.ts
bash $M V15 $k/decisions.ts $D/V15.old $D/V15.new "$C" packages/mcp/mcp-contract --mode fast tests/decisions.spec.ts
bash $M V9s $k/testing-scripted-transport.ts $D/V9s.old $D/V9s.new "$C" packages/mcp/mcp-contract --mode fast tests/transport-conformance.spec.ts
bash $M V10s $k/testing-scripted-transport.ts $D/V10s.old $D/V10s.new "$C" packages/mcp/mcp-contract --mode fast tests/transport-conformance.spec.ts
bash $M V13 $k/testing-transport.ts $D/V13.old $D/V13.new "$C" packages/mcp/mcp-contract --mode fast tests/transport-conformance.spec.ts
bash $M V14 $k/testing-transport.ts $D/V14.old $D/V14.new "$C" packages/mcp/mcp-contract --mode fast tests/transport-conformance.spec.ts
h=packages/mcp/mcp-host-local/src
bash $M V8 $h/session.ts $D/V8.old $D/V8.new "$H" packages/mcp/mcp-host-local --mode fast tests/session.spec.ts
bash $M V9h $h/session.ts $D/V9h.old $D/V9h.new "$H" packages/mcp/mcp-host-local --mode slow --typecheck.enabled=false tests/conformance.spec.ts -t 'close\(\) after'
bash $M V10h $h/session.ts $D/V10h.old $D/V10h.new "$H" packages/mcp/mcp-host-local --mode slow --typecheck.enabled=false tests/conformance.spec.ts -t 'close\(\) after'
