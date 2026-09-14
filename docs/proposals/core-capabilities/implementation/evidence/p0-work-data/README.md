# P0 work-data implementation evidence

## Scope and fixed inputs

This evidence covers only `packages/core/work-data/`, the P0 work-data slice of A30/A31. The spoke
started clean on `impl/dsh-p0-work-data` at `9de28b2fb43c9ae528b58e3259e699cff7a20e03`.
The accepted implementation input is the body of “共享值、完整 DTO 与 Schema 消费” from
`979d80f39f9da11031845f6e2112567299443ed2` (original lines 57–234, excluding its heading), with
SHA-256 `147f458a5402394ec3875c0142008f474192296e4e23b495010e8ceeaa0155a9`.

The product consumes frozen `data.agent-runtime-identity` v1 and `data.core-work` v1. Their source
and built schema hashes are respectively:

- `37393c0774f7a71ee6bf663388a2ec27821740f98b19d487b1299d39829aca74`
- `1c11b06bb94756cfea6f162173c9f4070be71bf44eb09f8ddeb3e199d579c203`

No frozen specification file was changed. Records, admission, Cordis behavior, business state,
authorization policy, model/tool execution, and application composition are outside this evidence.

## TDD chain

| Behavior | RED commit/log | GREEN commit/log | Observed result |
|---|---|---|---|
| strict JSON text, decoded duplicate keys, decimal equivalence and limits | `28431f0`; [RED](red-parse-json.txt) | `fee1608`; [GREEN](green-parse-json.txt) | 22 target tests passed |
| strict object snapshots and `core-json/1` | `f2bf9c9`; [RED](red-json-values.txt) | `3488f5c`; [GREEN](green-json-values.txt) | 39 cumulative tests passed |
| 29 DTO validators and original Schema resources | `7077ff5`; [RED](red-schema-data.txt) | `3eeb63b`; [GREEN](green-schema-data.txt) | strict compile and 52 cumulative tests passed |
| deeply frozen `Checked` results | `f83c022`; [RED](red-checked-freeze.txt) | `c9c71a0`; [GREEN](green-checked-and-unions.txt) | strict compile and 73 cumulative tests passed |
| build-time Schema identity/integrity gate | `1c7ec54`; [RED](red-schema-build.txt) | `101efed`; [GREEN](green-schema-build.txt) | valid exact copy and corrupted-source rejection passed |
| capacity before recursive JSON parsing | `bf90a34`; [RED](red-preparse-capacity.txt) | `42ffa71`; [GREEN](green-preparse-capacity.txt) | strict compile and 88 cumulative tests passed |
| strict preflight and visitor implementation capacity | `d85cb21`; [RED](red-preparse-guard.txt) | `eef1ba1`; [GREEN](green-preparse-guard.txt) | strict compile and 91 cumulative tests passed |

The union-variant cases added with the last GREEN verify more branches of the already implemented
exact-`$defs` mechanism. They are conformity coverage rather than an invented new RED.

## Environment and commands

The leaf used Node `v24.18.0`, pnpm `10.28.1`, TypeScript `6.0.3`, Vitest `4.1.8`, Ajv `8.20.0`,
and jsonc-parser `3.3.1`. Dependencies were installed in this leaf with:

```text
pnpm install --ignore-workspace --lockfile=false --ignore-scripts
```

The final leaf verification commands are:

```text
pnpm run build
pnpm run typecheck
pnpm test
sha256sum src/schemas/*.json dist/schemas/*.json
git diff --check
```

The final leaf run reported four test files and 91 passing tests. The increase from the earlier
TDD row's 73 tests includes conformity coverage for cross-realm plain data, dense array descriptors,
shared non-cyclic references, limit metadata, number boundaries and escaped duplicate-key paths,
plus the pre-recursion capacity and strict parser-guard regressions recorded above.

## Independent artifact observation

`pnpm pack --ignore-workspace --json` produced a tarball containing only `dist/index.js`,
`dist/index.d.ts`, both `dist/schemas/*.json` resources, and package metadata/README/provenance.
The final observed tarball SHA-256 after the capacity fix was
`dd1b58f7bc83cadb73983c1c937b509e3071f7fc93e1b35ff7c70ad38d0fe478`.

It was installed under the repository-external directory
`/tmp/omne-work-data-parser-guard.J5WPSK`, whose ancestors had no `node_modules`. An earlier pre-final
consumer correctly failed its first offline install because the current pnpm store lacked the
jsonc-parser tarball; this was not counted as GREEN. The authorized environment setup fetched the
exact declared versions. The final consumer then used
`pnpm install --offline --ignore-workspace --ignore-scripts` successfully and observed:

```text
PASS: final tarball public runtime and strict types
@omne-harness-lite/work-data dependencies:
  ajv: 8.20.0
  jsonc-parser: 3.3.1
installed schema SHA-256:
  37393c0774f7a71ee6bf663388a2ec27821740f98b19d487b1299d39829aca74
  1c11b06bb94756cfea6f162173c9f4070be71bf44eb09f8ddeb3e199d579c203
```

The valid external consumer passed strict `NodeNext` compilation and executed the public runtime
entry. A separate invalid consumer exited `2` with TS2322 for both a missing `AgentRef.incarnationId`
and a forged `tool_call` `InputBlock`.

## Remaining integration responsibility

The leaf manifest declares all runtime and test dependencies, but this spoke did not alter the root
workspace lock. The HUB owner must update `pnpm-lock.yaml`, install from that lock, run the revised
package checker against the integrated tarball, and perform the broader product/document gates.
This evidence does not claim full A30/A31, the model–tool loop, DR behavior, or final acceptance.
