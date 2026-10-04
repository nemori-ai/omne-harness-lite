# Independent opaque RawResponse safety slice

Verdict: **Pass** for the specifically dispatched D-091 opaque-response slice on source `2fd302cee8ad180d3f122cd697794ea970c775d7`, including transport implementation commit `300309fd`. This is a scoped independent verification result, not final acceptance of model-request-runtime or the full response-header design.

Worktree `/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime-p2-mr5-independent` was tracked-clean before the explicitly requested fast-forward from `62da5a5f`; it remains tracked-clean. Earlier MR5 evidence is unchanged. Writes are only the new ignored `tmp/model-request-runtime/p2-opaque-independent/**` evidence. No tracked product/tests/docs/spec/registry edits, commit, push or external model requests occurred.

## Accepted scope

Authority is D-091 partial adoption, `.meta_harness/design/record/decisions/model-transport-response-resource-adoption/decision.md`, adopting only the resource-hiding and real stop-return subset of transport v5-headers-design rev2 SHA256 `11f8bf455260889d25c51c512d119b0a3063d95610474f582dcc735f3b3fd1c7`. D-076 and D-082 retain the existing explicit complete-definition, single-send, resource and fixed-lease boundaries. RT5 S-58/S-59 express opaque successful R, no resend and one reader; no rawHeaders/H emission or full S20 implementation is accepted by this test slice. The historical candidate labels in the provider draft do not supersede D-091's precise partial adoption.

Source inputs include `packages/model/pi-ai-transport/src/http.ts`, `src/stream.ts`, package exports and bilingual READMEs; the new package `opaque-response.spec.ts` was read as author's evidence, not copied as the acceptance oracle. The independent oracle uses its own teaching definition, public message admission and independently generated local TLS certificate. Its synthetic model/credential/header sentinel is test data, never an official definition or live route.

## Real public artifact and environment

Node24.18.0, pnpm10.28.1, TypeScript6.0.3 and the checkout's Python3.12.13. The actual baseline artifact was generated with `pnpm --dir packages/model/pi-ai-transport pack --pack-destination <evidence>/packs` after a real package/dependency build. The consumer resolves its transport public root to its own extracted tarball's `dist/index.js`; root and plugin are loaded using the normal package name and exports map. Baseline installed transport members are byte-compared against that exact archive.

This is **one actual transport pack plus explicitly built worktree dependency packages**, as allowed in the dispatch. `DEPENDENCY_SCOPE.json` records15 dependency links and exact resolved paths; those dependencies use their normal public exports and the same frozen source. It is not a fully independent transitive-pack installation, registry publication or cross-process host certification. The root's separate178 transport/147 runtime test results are not claimed as rerun by this verifier.

## Acceptance results

| Criterion | Result and observable evidence |
|---|---|
| R before any reader | Pass. A real TLS server sends200 headers, including a synthetic secret, then holds the body open. The actual returned JS object is frozen and has null prototype; `Reflect.ownKeys` is exactly stop/stopped. No symbol/getter/setter fields, resource-bearing prototype or stream/headers/rawHeaders/request/socket/statusCode/redact/iterator members. Stop function has only normal length/name properties; stopped Promise has no custom own members. |
| Real return and stop | Pass. Two stop calls return actual undefined; stopped resolves actual undefined. A previously registered server-side secure socket close event arrives, closed count is1 and live socket set is0. Sending returned exactly one observed POST to `/api/v1/chat/completions`; stop does not resend. |
| Identity and exclusive reader | Pass. A second real TLS fixture sends the complete SSE body; its response finish event and two event-loop turns occur before reading. Forged and reflection-copied handles, and a different genuine plan are rejected with invalidInput. The genuine first reader survives those checks and a competing reader is rejected. Three arrival events contain the complete `deferred-real-body`, final ended=end, and stopped resolves undefined. Subsequent reading remains rejected; total observed requests stays1. |
| Export boundary | Pass. The actual public root exports16 names and plugin3, none of the response/plan/resource unwrap helpers. Five unlisted subpaths http, stream, src/http.ts, dist/http.js and internal all reject with ERR_PACKAGE_PATH_NOT_EXPORTED. |
| No unaccepted headers expansion | Pass within slice. Successful SendResult has no rawHeaders member. The safe handle contains no successful response header field. This test does not evaluate legacy failed.headers or full credential policy. |
| Behavior negative: restore stream | Pass as a control. A complete isolated copy of actual transport source adds stream:res to the returned object, then really compiles successfully. The same public JS/TLS oracle exits1 specifically with AssertionError OPAQUE_OWN_KEYS. |
| Behavior negative: expression stop | Pass as a control. A second complete source copy replaces the void block with `stop: () => req.destroy()`, compiles successfully, and is staged as an isolated actual public package. The same oracle exits1 with AssertionError STOP_RETURNS_UNDEFINED; actual value is ClientRequest. The observed stderr stream is65,536 bytes, retained as captured; the primary assertion and returned type are present. |
| Documentation | Pass. English/Chinese line195 documents only stop/stopped, actual undefined return, actual-close wait, same-plan single reader, no successful headers yet, and legacy failed.headers/full policy limits. Existing code example matrix was not rerun, per dispatch. |
| Cleanup | Pass after measurement fix. Every positive fixture closes its transport and actual TLS socket; every mutant fixture closes in finally even after an assertion. The runner completes without a live test process. No tracked files changed. |

## First failure and measurement correction

The first positive run PID192555 exited1 at `fixture actual socket cleanup` after the delayed-reader scenario had already produced its correct complete body and final result. My original fixture asserted secure-socket set size0 immediately after `server.close`'s callback, before the previously attached secure socket close listener had run. That callback was not an adequate observable resource terminal condition.

The correction adds only `await deadline(socketClosed, 'fixture actual socket close event')` before the unchanged `sockets.size === 0` assertion. It neither changes product code nor reduces a threshold, skips a scenario or retries on elapsed time. Parent explicitly accepted this observation correction. Original PID/argv/exit/stdout/stderr remain in `raw/positive.*`; `MEASUREMENT-CORRECTION.patch` records the sole added wait. A reconstructed pre-correction oracle is retained explicitly as reconstruction, not falsely labelled an original snapshot captured before execution.

Exactly one corrected positive run, PID192776, exits0 (`OPAQUE_INDEPENDENT_PASS`). Each mutant was compiled and run once: stream compiler PID192800 exit0, stop compiler PID192787 exit0; negative stream PID192927 exit1; negative stop PID192934 exit1. No retry-until-green sequence occurred.

## Reproduction and frozen evidence

`command.py` records each actual argument array, cwd, child PID, start/end, exit and separate full captured stdout/stderr in `raw/<label>.*`. Controlled labels include build, pack, prepare, certificate, positive, positive-corrected, compile-stream, compile-stop, negative-stream and negative-stop. Mutant source differences are `stream.patch` and `stop.patch`; `MUTANTS.json` records compiled output/archive hashes. Oracle and each isolated consumer's oracle are equal bytes. The local cert/key are controlled test fixtures only.

To reproduce against the frozen staged fixtures, invoke the recorded Node argv in each consumer cwd; compile commands point at each complete isolated mutant source and the same worktree compiler. `prepare.py` defines setup from the independently created real baseline tarball. Source/authority/evidence hashes, installed-member byte comparisons, all command results and baseline archive hash are retained in `SHA256.json` and `PACK-MEMBERS.json`. No earlier MR5 evidence was modified.

Excluded: rawHeaders H capture/handling, G6 policy production values/security review, legacy HTTP failed.headers, full PH-V9 secret graph, G1/G3/G4, invoke→append/reopen, lease migration/Run/clock recovery, thirteen service operations, end-to-end observability and37 model certifications. Real TLS here means controlled loopback TLS, not OpenRouter or vendor behavior. The observations do not establish a sandbox against debuggers or same-process memory access. Dispatch final acceptance remains with root.
