# U1 execution handoff (candidate, not accepted)

This directory contains actual commands, tool versions, raw TLC outputs, Schema results and candidate file hashes. Parent integrates the candidate and archives these results under record/evidence; the spec-drafter did not write record/ or commit.

## Inputs and outputs

See delivery-manifest.json. Worktree base is c3d2fa5d, U0 revision 3. No existing frozen spec was changed. MR9 has S-1..S-45 (five new clauses); RT10 has S-1..S-83 (seven new clauses). MP7 was not created: cap/margin semantics stay at MP6. CA2/MS6/SL3 are unchanged.

## Actual verification

- schema-examples-final.log: 17 full positive/negative instances, including PendingModelResponse, Draft 2020-12 plus specified cross-value checks. This does not validate digest preimages/provider provenance or permission.
- formal/results.json: actual commands, exit codes, SHA-256 of each configuration, duration and whether the expected result occurred. Fourteen negative configs each violate its named invariant, not merely return nonzero.
- design-check.log: initial full-tree invocation failed because tracked historical evidence was excluded by sparse checkout (687 missing inherited links) and a copied formal README lost one inherited anchor. Parent restored only tracked HEAD evidence; the inherited settlement anchor was restored. design-check-full.log contains the final independent invocation.
- git diff --check: no whitespace error.

## Corrections, retained honestly

The first 3-call expansion hit Tail(empty) in the draft model; this was a model domain error, not a product counterexample. The fixed action leaves an empty sequence empty and does not exclude empty input. The first draft's error was reproduced in initial-domain-error-reproduction/rerun.log with its exact faulty model (the reproduction is not claimed as the original overwritten log). The corrected final 3-call model exhausts 1,675,125 distinct states.

formal-before-explicit-reply holds the earlier completed run before response/reply were split into separate sequences. Final formal/ includes explicit SameBatch and PartialBatch mutation. Only final formal/ results certify the current model. The initial system Python lacked draft-2020-12 support; deprecated RefResolver also mis-scoped a nested resource. Parent prepared the spoke's own tool venv; the current checker uses referencing.Registry and local exact schema IDs. schema-examples.log preserves that old resolver failure, final log is separate.

## Results

| Configuration | Expected check | Exit | generated/distinct | seconds |
|---|---|---|---|---|
| UsageCalibration_Estimated.cfg | positive | 0 | 67203/59655 | 2.67 |
| UsageCalibration_ExactOrBound.cfg | positive | 0 | 65763/58359 | 2.772 |
| UsageCalibration_Progress.cfg | positive | 0 | 18489/16227 | 2.32 |
| UsageCalibration_ThreeCalls.cfg | positive | 0 | 1977491/1675125 | 53.829 |
| UsageCalibration_UpperBound.cfg | positive | 0 | 59523/52743 | 3.333 |
| UsageCalibration_CacheZero.cfg | negative: AnchorSource | 12 | 211/205 | 0.818 |
| UsageCalibration_DoubleOutput.cfg | negative: NoDoubleOutput | 12 | 191/187 | 0.767 |
| UsageCalibration_EstimateExact.cfg | negative: PrecisionHonest | 12 | 4/4 | 0.717 |
| UsageCalibration_EstimatedWindow.cfg | negative: WindowSafe | 12 | 3305/2253 | 1.018 |
| UsageCalibration_IgnoreBasis.cfg | negative: BasisGuard | 12 | 362/324 | 0.767 |
| UsageCalibration_IgnorePrefix.cfg | negative: PrefixGuard | 12 | 352/318 | 0.767 |
| UsageCalibration_LatestBranch.cfg | negative: AnchorSource | 12 | 376/328 | 0.817 |
| UsageCalibration_MissingZero.cfg | negative: AnchorSource | 12 | 201/196 | 0.767 |
| UsageCalibration_PartialBatch.cfg | negative: SameBatch | 12 | 56/56 | 0.667 |
| UsageCalibration_PublishEarly.cfg | negative: NoEarlyPublish | 12 | 32/32 | 0.717 |
| UsageCalibration_RecomputeRecovery.cfg | negative: OriginalBatch | 12 | 113/113 | 0.717 |
| UsageCalibration_ReleaseLease.cfg | negative: LeaseHeld | 12 | 7/7 | 0.667 |
| UsageCalibration_RewriteHistory.cfg | negative: AppendOnly | 12 | 114/114 | 0.717 |
| UsageCalibration_StalePlan.cfg | negative: PlanSendSame | 12 | 19/18 | 0.667 |

## Not established

No real HTTP, paid request, tokenizer/provider correctness, hashes' collision resistance, persistence power-loss safety, cross-tenant runtime permission, no-global-IO implementation check, actual performance improvement or product acceptance. Existing RT9 formal models were copied as normative predecessors; they were not rerun here or used to claim whole-vertical certification. Upper bound/actual input premises are explicit. EstimatedWindow is an expected reachable over-window counterexample, not a defect in the honest estimated policy.

## Open gaps

MR G-16 / RT G-35: binding-specific observation/phi/delta/compatibility evidence (adapter/meter providers). MR G-17 / RT G-36: compaction hard-fit vs estimated guarantee (product/context mainline). None grants permission to implement before accepted contracts and realization.
