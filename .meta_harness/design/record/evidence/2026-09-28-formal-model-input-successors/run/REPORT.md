# Independent bounded TLC receipt — 2026-09-28

Scope: candidate `capability.model-request-runtime/v6` S-74–S-76 and candidate `capability.loop-extension-runner/v4` S-53–S-54. This is independent finite safety-model execution, not specification acceptance, unbounded proof, provider conformance, or production verification. No model or product source was changed here.

Input roots and provenance:

- RT6 source: `panqiwei/model-request-runtime-runtime6-spec`, baseline HEAD `84260cacf634a2fb172f3ecad3a177948a46996a`; author-confirmed corrected source HEAD `2400c6dd65f714cb1f37c7b5f6eebeddce84e24d`. Candidate files are uncommitted. Initial 13-file snapshot is `rt6/input-sha256.json`; corrected FinalPlan 6-file snapshot is `rt6/input-rev2-sha256.json`. Original FinalPlan parse failure is retained separately.
- Runner4 source: `panqiwei/model-request-runtime-runner4-spec`, baseline HEAD `fd4c87f2bc2809843ecec7937834a235906b2163`; author-confirmed new model snapshot is `runner4/input-sha256.json`. Candidate files are uncommitted.
- Each source byte was compared with the author's SHA-256 handoff, copied before TLC, and compared again with the snapshot manifest. Source files were never used as TLC working inputs.

Tool: `TLC2 Version 2026.09.12.025210 (rev: 867aefb)` via `/usr/local/bin/tlc`, Eclipse Adoptium Java 21.0.12.1, `/opt/tlaplus/tla2tools.jar` SHA-256 `db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1`. Exact environment output is `rt6/environment.json`. Runs were sequential (`-workers 1`), at most one TLC process at a time, with 120-second per-case timeout; none timed out. Each run directory holds `command.json`, raw `stdout.log`, `stderr.log`, `exit.json`, and TLC metadata. Each `command.json` preserves the historical absolute `cwd` and metadata path used in the original run. Those paths are historical facts and may not exist after publication. To rerun elsewhere, set `cwd` to this package’s matching `rt6/input`, `rt6/input-rev2`, or `runner4/input`; choose a fresh local `-metadir`, and otherwise retain the recorded module/config command. Check this portable package’s recorded evidence and all package hashes with `python3 verify_package.py` from the package root.

| Model | Positive result | Negative controls: exit 12 and exact violated invariant |
|---|---|---|
| RT6 FinalPlan | `FinalPlan.cfg`: exit 0, 49 distinct states; `FinalPlan_Public.cfg`: exit 0, 43 distinct states | `FinalPlan_NoCheck`: CheckedBeforeEffects; `FinalPlan_Mutable`: SameFixedPlan; `FinalPlan_UnknownExceeded`: UnknownNotExceeded |
| RT6 PendingReply | exit 0, 8 distinct states | `PendingReply_Default`: NoInventedDisposition; `PendingReply_DropFacts`: CompleteHandoff |
| RT6 RetryHistory | exit 0, 42 distinct states | `RetryHistory_DispatchCount`: CountsOwnConclusions |
| Runner4 FailureHistory | exit 0, 4,306 distinct states | `mixed-model-call`: CallAssociation; `lost-retry-history`: LosslessHistory; `return-before-conclusion`: WriteBeforeReturn; `reevaluate-concluded`: ReplayNoReevaluation |

The first RT6 FinalPlan input (`ad4ff68a…`) failed parsing at `FinalPlan.tla:19` with a precedence conflict and exit 150, before any invariant was checked. The author corrected three comparison expressions; the corrected module SHA-256 is `bdc58e64ef05a4c598340386a7c2d8305393cc2dc1f55a89b4526c02324bbf92`. Config bytes did not change. The original failure remains in `rt6/runs/FinalPlan/`; corrected runs are in `rt6/runs-rev2/`.

Machine receipt: `RESULT.json`. `verify_results.py` checks every frozen input hash, positive completion and empty queue, exact negative invariant and exit, and the retained parse failure. Its in-memory false-success probes confirm that a missing success marker and a wrong violated invariant are rejected. The receipt passes: 5 positive configurations and 10 designated negative controls.

Model bounds come from the candidate formal README: FinalPlan has one plan/send, representative quantities 1–3 and experimental cap 2 with accurate or conservative-bound measurement as an input premise; PendingReply abstracts five fact tokens and three explicit dispositions; RetryHistory has one call, at most two effective conclusions and three dispatches; Runner4 has two calls, at most two history entries, four dispatch sequences and one post-commit crash. None of these models verifies actual token measurement, attachment material acquisition, response Schema completeness, durable log provenance, real multi-writer coordination, provider resources, or production Run termination. The inherited byte-identical models were intentionally not rerun. No Alloy or real IO was executed.
