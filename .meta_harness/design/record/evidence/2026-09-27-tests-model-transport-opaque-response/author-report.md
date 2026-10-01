# D-091 opaque response implementation handoff

2026-09-27. Execution tree: `/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime-p2-opaque-response`; branch `panqiwei/model-request-runtime-p2-opaque-response`; baseline/HEAD `62da5a5f877e4c5707cb2325e5a8d55b8da19d89`. No commit, merge or push performed. Source is frozen for root integration and independent acceptance.

## Scope and adopted inputs

Implemented only D-091's accepted structural slice of `realization/packages/model/pi-ai-transport/v5-headers-design.md` rev2 (adopted design SHA-256 `11f8bf455260889d25c51c512d119b0a3063d95610474f582dcc735f3b3fd1c7`). D-076/D-082 original plan/send/read/lifecycle responsibilities remain. Relevant accepted RT5 S-53/S-56/S-58/S-59/S-64 and PH-V9 inform this slice; full RT5 header/policy conformance is not claimed.

Only six maintained files in `packages/model/pi-ai-transport/` changed: `src/http.ts`, `src/stream.ts`, `tests/boundaries.spec.ts`, new `tests/opaque-response.spec.ts`, `README.md` and `README_ZH.md`. No runtime types, spec, realization, registry, assets, lockfile or other package source changed. Dependency `dist` directories were built as ignored setup outputs. Bilingual README changes include mechanical Prettier formatting of their existing tables/code alongside the new accurate public-handle description.

## Implementation and acceptance result

| Criterion | Result and evidence |
| --- | --- |
| Actual successful R is frozen, null-prototype and only stop/stopped | Pass: actual TLS response paused before any reader; Reflect.ownKeys, prototype, symbols, descriptors, direct access and `in` assertions in new package tests and compiled public-pack consumer |
| Original stream/status/redactor/plan/reader claim remain private | Pass: one private WeakMap; package-internal `claimResponse` returns state only to `readStream`; root/plugin exports exclude it, standard unlisted package subpath rejects with ERR_PACKAGE_PATH_NOT_EXPORTED |
| stop returns undefined; stopped fulfills undefined | Pass: actual Node HTTPS request, repeated stop, await stopped, server socket-close observation in package test; compiled artifact confirms both values |
| Real identity, same plan and one reader only | Pass: forged/copy/wrong plan/cross-host plan refusal precedes valid first-reader claim; competing first next() rejected; no resend |
| Preserve existing transport/lease/cancel/serving/error behavior | Package suite Pass: 178 tests across 10 files; existing actual HTTPS, registry, Cordis lifecycle, conformance and redaction assertions retained |
| Preserve legacy HTTP-failure header redaction | Pass within inherited finite test scope: non-2xx `failed.headers` remains; success-header test now explicitly asserts no successful public header outlet and retains body/serving redaction assertions |
| Actual compiled behavior negatives | Pass: exposing raw stream and returning req.destroy() each cause AssertionError and Node exit 1 in separately launched packed-consumer processes; snapshots/logs retained under mutants/ and corresponding logs |
| Build/typecheck/format/rules/diff | All executed checks exit 0, details below |

The successful handle has no raw headers at all. This source deliberately emits no new `SendResult.rawHeaders`. Legacy `TransportFailure.headers` remains under its prior range pending complete header adoption. Private WeakMap identity is representation/claim machinery, not resource cleanup: request close still removes abort/connect listeners, releases connection admission and resolves the tracked stopped promise; reader finally still stops/awaits and removes its own cancellation listener. No reliance on GC, no strong enumerable response registry, no new SDK, dependency, retry or fallback.

## Commands actually executed

1. `pnpm install --offline --frozen-lockfile`: exit 0, 80 reused dependencies, no download or lockfile change. Initial test attempts before local setup/build failed at missing Vitest/compiled workspace entries and ran no tests; these were environment preparation failures.
2. `pnpm --filter @omne-harness-lite/pi-ai-transport... run build`: final exit 0, 16 packages. The first edited-source build exposed a TypeScript closure narrowing error; fixed without assertion and rebuilt successfully.
3. `pnpm --filter @omne-harness-lite/pi-ai-transport run typecheck`: exit 0.
4. `pnpm --filter @omne-harness-lite/pi-ai-transport run test`: final exit 0, 10 test files / 178 tests / no type errors, 22:48:43 UTC run. This suite imports the package's public built exports. Earlier successful 22:47:43 run preceded the added cross-host/hidden-shape assertions; only final result is used for the frozen test scope.
5. Shared Prettier run only on six owned maintained files; `pnpm format:check` exit 0. `pnpm lint:rules` exit 0: 27 package rules plus 6 path rules. `git diff --check` exit 0.
6. Actual Node public root/plugin imports: private helper absent, public send/read present, internal subpath blocked; exit 0.
7. `python3 tmp/model-request-runtime/p2-opaque-response/run-public-pack.py`: exit 0 after adapting archive extraction to available Python API. `pnpm pack` produced the frozen transport artifact. EN/ZH README first TS fixture blocks each compiled under strict NodeNext. Packed public JS consumed that fixture and made two actual TLS requests, checked R/stop/stopped/identity/single-reader, exit 0. Two separate compiled mutants each exited 1 specifically with AssertionError; extracted production http.js restored. Raw logs are included. Workspace dependency **builds are linked**, not independently repacked or independently installed; this is an actual transport-pack consumer, not a claim of the whole transitive closure's independent packaging.

No live OpenRouter/model request or paid external effect occurred. TLS endpoints were temporary localhost servers with explicit synthetic model/credential and local CA. Tests and consumer close actual resources; certificate directories are removed, no intended live request/server remains. Default Node runtime and explicit local test policies were used; production policy values were not inferred from them.

## Frozen artifacts and gaps

`frozen.patch` SHA-256: `454e95ccefb057553fffaad20d58cff30af93a8699f7dafb7abd504f8067fdb6` (includes the new test's no-index patch). Actual transport tarball SHA-256: `230f48a824c5b49a1d22d69f78aeb0a4d411e28fd97320273fd2008d9e9db6c0`. `SHA256SUMS` covers source, bilingual README, artifacts, scripts, raw logs and exact deterministic compiled-mutant snapshots. Those mutant snapshots preserve the same unique replacement bytes executed by the archived script; no extra mutant run occurred during snapshot preservation.

PH-V9 passes **only the R structural/stop/identity/public-export finite slice**. It does not pass the real complete S-20/H scenario: RT5 G-6 / PH-G2 production `credential_fragment_min_length`, `credential_header_names`, `credential_patterns` values/matching remain unadopted; no policy defaults/list/regex grammar invented. PH-G1 runtime public type/MR5 adoption, PH-G3 invoke handoff/four outcomes and PH-G4 codec/all writers/TLS→append→reopen remain other owners' work. Full PH-V9, S-20, S-58 H emission, PH-J1/J2, complete observability, durable recovery, distributed guarantees and 37 official model certification are not closed by this implementation. Legacy failed.headers is not a new RT5 second authority adopted here.

Root should audit the frozen six-file diff, integrate source, run changed HUB composition checks and arrange independent acceptance. Required evidence is ignored and needs explicit preservation before retiring this spoke; this report is implementation handoff, not final acceptance or new design authority.
