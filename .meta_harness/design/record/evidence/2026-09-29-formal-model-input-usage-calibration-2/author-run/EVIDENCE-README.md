# U1 review revision 2 execution handoff

Candidate only; no acceptance, implementation or network requests. Base f5891f5a. This directory is separate from the first-round evidence and no first-round raw output was replaced.

B1: RT10 S-59 read is the sole first interpreter of same-response observedInput/provenance, including known prompt total with missing cache detail. S-54 field ledger explicitly carries it. Error/partial termination retains known facts; opaque/raw side channels are forbidden.

B2: MR9 known outputGroup now has its own required projectionRevision. requestInput unavailable + known output remains valid. When both are known their revisions must equal. Twenty full Schema/relationship examples passed expected outcomes, including the new three cases (schema-examples.log).

B3: RT10 chooses the newest available actual causal ancestor. A separate stable three-dispatch configuration checks ReanchorProgress and non-vacuous EventuallyReanchored independently from EventuallyDone. NeverUseAnchor and KeepOldAnchor violate the named temporal property under those same premises. Existing scopes remain separate.

N1: new adapter evidence gap is G-37; existing LC6 G-35 and compaction G-36 retain their meanings. N2: mutable execution history and implementation status removed from normative verification files; current files contain obligations and change impact only.

Six positive TLC configurations passed; sixteen negative configurations hit the expected assertion/property. See formal/results.json for exact commands, durations, configuration hashes and raw output paths. TLC reports the temporal error as `Temporal property ReanchorProgress was violated.`; the result collector initially expected a generic plural string and marked those two false. Only the collector/result interpretation was fixed from the actual named error; raw logs were not rewritten. results-before-log-classifier-fix.json retains that intermediate report. No parser failure, timeout or arbitrary nonzero exit is counted as a passing negative test.

| Configuration | Check | Exit | generated/distinct | seconds |
|---|---|---|---|---|
| UsageCalibration_Estimated.cfg | positive | 0 | 67203/59655 | 3.022 |
| UsageCalibration_ExactOrBound.cfg | positive | 0 | 65763/58359 | 3.072 |
| UsageCalibration_Progress.cfg | EventuallyDone | 0 | 18489/16227 | 3.076 |
| UsageCalibration_ReanchorProgress.cfg | positive | 0 | 78069/66825 | 16.611 |
| UsageCalibration_ThreeCalls.cfg | positive | 0 | 1977491/1675125 | 56.349 |
| UsageCalibration_UpperBound.cfg | positive | 0 | 59523/52743 | 3.425 |
| UsageCalibration_CacheZero.cfg | AnchorSource | 12 | 211/205 | 0.919 |
| UsageCalibration_DoubleOutput.cfg | NoDoubleOutput | 12 | 191/187 | 0.868 |
| UsageCalibration_EstimateExact.cfg | PrecisionHonest | 12 | 4/4 | 0.818 |
| UsageCalibration_EstimatedWindow.cfg | WindowSafe | 12 | 3305/2253 | 1.069 |
| UsageCalibration_IgnoreBasis.cfg | BasisGuard | 12 | 362/324 | 0.868 |
| UsageCalibration_IgnorePrefix.cfg | PrefixGuard | 12 | 352/318 | 0.868 |
| UsageCalibration_KeepOldAnchor.cfg | ReanchorProgress | 13 | 78069/66825 | 11.942 |
| UsageCalibration_LatestBranch.cfg | AnchorSource | 12 | 376/328 | 0.767 |
| UsageCalibration_MissingZero.cfg | AnchorSource | 12 | 201/196 | 0.717 |
| UsageCalibration_NeverUseAnchor.cfg | ReanchorProgress | 13 | 24269/21794 | 3.974 |
| UsageCalibration_PartialBatch.cfg | SameBatch | 12 | 56/56 | 0.717 |
| UsageCalibration_PublishEarly.cfg | NoEarlyPublish | 12 | 32/32 | 0.767 |
| UsageCalibration_RecomputeRecovery.cfg | OriginalBatch | 12 | 113/113 | 0.718 |
| UsageCalibration_ReleaseLease.cfg | LeaseHeld | 12 | 7/7 | 0.667 |
| UsageCalibration_RewriteHistory.cfg | AppendOnly | 12 | 114/114 | 0.767 |
| UsageCalibration_StalePlan.cfg | PlanSendSame | 12 | 19/18 | 0.767 |

Schema runner: this spoke's .venv/bin/python, jsonschema 4.26.0 with explicit referencing.Registry of local exact IDs. Formal tools: Java 21.0.12.1, /opt/tlaplus/tla2tools.jar (same first-round tool digest); tool output includes precise versions. design-check-final.log records the full internal registered gate; diff-check has no whitespace errors. The formal gate's registered mode is not mistaken for TLC execution: actual runs are separate above.

Unchanged limits: finite model only, not upstream tokenizer/phi accuracy, permission implementation, digest preimage evidence, power-loss behavior, real network or performance certification. Existing thirteen-operation semantics are not rebuilt. No MP7, new data service, store, or product estimate-policy change.
