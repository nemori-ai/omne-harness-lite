# SL3 candidate finite model execution — run 1

Executed by `/root/b1_session_log_formal_verification` on 2026-09-27; independent of candidate drafting. This is execution evidence, not architecture review, specification acceptance, implementation acceptance, or a mathematical proof.

## Result and preserved inputs

All 20 requested entry points matched their execution oracle: 2 SANY parses, 3 completed positive TLC safety explorations, and 15 named invariant counterexamples for negative/reachability configurations. All model inputs and 2 navigation files match their supplied fingerprints before, throughout, and after execution. No check timed out; no source was modified or committed; no external model request was made.

Candidate source is `panqiwei/model-request-runtime-b1-spec` at `60c0652df9a396b5ef9af256809638be37b42c2a`, with the uncommitted SL3 candidate fixed by 24 resource hashes. Contract SHA-256: `f7086724e58e736dc5dccc92dcd936eabda82c1cae5c0fbf523c966ed51e1fa8`. Snapshots are in `inputs/`; `input-snapshot.json` and `input-final-observation.json` verify preservation. The commit alone does not identify this uncommitted candidate.

## Environment and exact commands

Actual Java: Eclipse Adoptium / Temurin `21.0.12.1+1-LTS`. SANY: `2.2`, created 08 July 2020. TLC: `2026.09.12.025210`, rev `867aefb`. JAR `/opt/tlaplus/tla2tools.jar` SHA-256: `db131ddb48e7004d823bef4493df7b35694babe37505b9d9fa5685e7a331f1f1`. Java binary SHA-256: `999c141a6e620c71aa4230ccb62341a89162f37818753ff006d766bf935dcbe1`. Java tool paths were read only from `JAVA_BIN` and `TLA2TOOLS_JAR` in `/etc/environment`.

The execution CWD was the candidate `.meta_harness/design` root. Positive argv exactly follows `registry-candidate.json` after resolving its two tool variables, except the dispatch-authorized `-metadir` absolute destination under this run. Negative configurations use the same model and flags with their listed config. No constants, assertions, premises, workers or GC flags were changed. All original and actual positive argv, all 20 actual argv, CWD, PID, start/end, timeout and exit are preserved in `commands.json`, `metadata.json`, `RESULTS.json` and `tasks/*/{result,runtime}.json`.

At most 3 check processes ran concurrently and every TLC process had 1 worker. Tool timeout was 300 seconds per task, not product retry policy. TLC reports 8 cores, 7824 MB heap, 64 MB offheap, Linux 5.15.0-1084-aws amd64 and MSBDiskFPSet/DiskStateQueue. Its throughput-GC warning was preserved without changing argv. The metadata-only `TLC -help` command exits 1 by the actual tool; raw help is preserved and was not counted as a model failure or successful model check. Task invocations completed normally with no termination or restart.

Run command:

```sh
/data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/.venv/bin/python /data/qiwei/repos/omne-harness-lite/.worktrees/model-request-runtime/tmp/model-request-runtime/b1-late-coordination/formal-v3-run-1/run.py
```

The directory is intentionally single-use: task folder creation refuses to overwrite a previous run. Re-execution requires a separately authorized new run directory. `run.py` remains exactly the script whose hash is recorded at execution. `summarize.py` performs post-execution evidence rendering without invoking TLC.

## Checks and counts

| Entry point | Exit | Named failure / checked outcome | Generated | Distinct | Queue left | Reported depth | Trace states |
|---|---:|---|---:|---:|---:|---:|---:|
| sany-SessionLog | 0 | SANY semantic processing completed | — | — | — | — | 0 |
| sany-TailSettlement | 0 | SANY semantic processing completed | — | — | — | — | 0 |
| session-log-v3-appends | 0 | No error found; queue exhausted | 5846 | 2784 | 0 | 8 | 0 |
| session-log-v3-tail-attempt | 0 | No error found; queue exhausted | 44385 | 17539 | 0 | 23 | 0 |
| session-log-v3-tail-run-end | 0 | No error found; queue exhausted | 44385 | 17539 | 0 | 23 | 0 |
| SessionLog_NoSerialization_Fence | 12 | FenceHolds | 1397 | 824 | 645 | 5 | 5 |
| SessionLog_NoSerialization_Key | 12 | UniqueDedupeKey | 991 | 563 | 424 | 5 | 5 |
| SessionLog_Reach_DuplicateRejected | 12 | NeverDuplicateRejected | 86 | 62 | 41 | 4 | 4 |
| SessionLog_Reach_StaleRejected | 12 | NeverStaleRejected | 139 | 115 | 91 | 4 | 4 |
| SessionLog_VolatileDedupe | 12 | UniqueDedupeKey | 889 | 625 | 411 | 6 | 6 |
| TailSettlement_NoTail_Attempt | 12 | TailGuardSound | 85 | 71 | 47 | 5 | 5 |
| TailSettlement_NoTail_RunEnd | 12 | TailGuardSound | 85 | 71 | 47 | 5 | 5 |
| TailSettlement_PartialRead_Attempt | 12 | LateCorrect | 150 | 116 | 74 | 5 | 5 |
| TailSettlement_PartialRead_RunEnd | 12 | LateCorrect | 150 | 116 | 74 | 5 | 5 |
| TailSettlement_Reach_Duplicate | 12 | NeverDuplicateRejected | 573 | 381 | 222 | 7 | 7 |
| TailSettlement_Reach_Late | 12 | NeverLateSettled | 150 | 116 | 74 | 5 | 5 |
| TailSettlement_Reach_TailChanged | 12 | NeverTailChanged | 85 | 71 | 47 | 5 | 5 |
| TailSettlement_SplitTail_Attempt | 12 | TailGuardSound | 195 | 148 | 90 | 6 | 6 |
| TailSettlement_SplitTail_RunEnd | 12 | TailGuardSound | 195 | 148 | 90 | 6 | 6 |
| TailSettlement_UnknownAsNoWrite | 12 | NoFalseNoWrite | 65 | 56 | 36 | 5 | 5 |

Positive counts denote the fully explored finite state graph, with queue 0; negative counts denote exploration stopped at the first required counterexample and do not claim exhaustion. The field `complete_search_depth` quotes TLC’s standard phrase; for negative runs it is only the reported depth at that failure. Each first failure and complete raw stdout/stderr is retained. No separate action-coverage counters were requested by the candidate argv or collected; the counts are state-graph counts, not per-action coverage metrics.

## Assertion-to-clause scope

- `SessionLog.cfg`: `TypeOK` checks the model value domain; `UniqueDedupeKey` checks S-8 and `FenceHolds` S-10, under S-14 serialized judgement/write and durable dedupe. Domain: 2 attempts, 1 opaque key, 2 appender slots, MaxLen 3 and at most 1 modeled crash. Condition is the unconditional projection.
- `TailSettlement_Attempt.cfg` and `TailSettlement_RunEnd.cfg`: `TypeOK`, `TailGuardSound` for S-33, `LateCorrect` for the S-34/S-36 consumer projection, and `NoFalseNoWrite` for S-22/S-35. Domain: 2 settling actors sharing one response identity; actor 1 submits one response, actor 2 submits message plus response; original attempt 1; MaxRequests 2; at most one boundary and one unrelated record; attempt boundary 2 or same-attempt end. CheckTail, AtomicTail, CompleteRead, SafeRecovery are TRUE.
- Seven broken-tail/read/recovery configurations and three new reachability configurations demonstrate assertion sensitivity and non-vacuous conflict/duplicate/late behavior. The five retained SessionLog validity configurations independently re-execute durable dedupe, serialization and rejection reachability on v3 inputs.

No fairness or liveness task is present. TailSettlement has CHECK_DEADLOCK FALSE; completed finite safety exploration does not imply production progress or lack of starvation.

## Individual trace inspection

### SessionLog_NoSerialization_Fence

- Expected and actual invariant: `FenceHolds`; TLC exit `12`. Raw trace: `tasks/SessionLog_NoSerialization_Fence/trace.txt`.
- Actions: Initial predicate → Judge(1,[att |- → Judge(2,[att |- → Write(2) → Write(1).
- Inspection: Judge(1) approves fenced attempt 1, Judge(2) approves attempt 2, Write(2) precedes Write(1). Final log contains attempt 2 then fenced attempt 1; FenceHolds is false.

### SessionLog_NoSerialization_Key

- Expected and actual invariant: `UniqueDedupeKey`; TLC exit `12`. Raw trace: `tasks/SessionLog_NoSerialization_Key/trace.txt`.
- Actions: Initial predicate → Judge(1,[att |- → Judge(2,[att |- → Write(1) → Write(2).
- Inspection: Both slots judge key 1 free before either write. Write(1) and Write(2) then append two entries with key 1; UniqueDedupeKey is false.

### SessionLog_Reach_DuplicateRejected

- Expected and actual invariant: `NeverDuplicateRejected`; TLC exit `12`. Raw trace: `tasks/SessionLog_Reach_DuplicateRejected/trace.txt`.
- Actions: Initial predicate → Judge(1,[att |- → Write(1) → Judge(1,[att |-.
- Inspection: An unfenced key 1 commits, then another unfenced Judge on key 1 produces busy=TRUE and ok=FALSE. NeverDuplicateRejected is false; the positive dedupe rejection path is reachable.

### SessionLog_Reach_StaleRejected

- Expected and actual invariant: `NeverStaleRejected`; TLC exit `12`. Raw trace: `tasks/SessionLog_Reach_StaleRejected/trace.txt`.
- Actions: Initial predicate → Judge(1,[att |- → Write(1) → Judge(1,[att |-.
- Inspection: Attempt 2 commits, then Judge(1) for fenced attempt 1 produces busy=TRUE and ok=FALSE. NeverStaleRejected is false; the positive fence rejection path is reachable.

### SessionLog_VolatileDedupe

- Expected and actual invariant: `UniqueDedupeKey`; TLC exit `12`. Raw trace: `tasks/SessionLog_VolatileDedupe/trace.txt`.
- Actions: Initial predicate → Judge(1,[att |- → Write(1) → Crash → Judge(1,[att |- → Write(1).
- Inspection: Key 1 is committed, Crash clears mem while retaining log, another Judge accepts key 1, then Write appends it again. UniqueDedupeKey is false despite serialized judgement.

### TailSettlement_NoTail_Attempt

- Expected and actual invariant: `TailGuardSound`; TLC exit `12`. Raw trace: `tasks/TailSettlement_NoTail_Attempt/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → AppendBoundary → Commit(1,FALSE).
- Inspection: Actor 1 reads basis 1, submits, AppendBoundary records attempt 2, then Commit succeeds using basis 1 before actual tail 2. TailGuardSound is false; response late=FALSE is also inconsistent with preceding attempt 2.

### TailSettlement_NoTail_RunEnd

- Expected and actual invariant: `TailGuardSound`; TLC exit `12`. Raw trace: `tasks/TailSettlement_NoTail_RunEnd/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → AppendBoundary → Commit(1,FALSE).
- Inspection: Actor 1 reads basis 1, submits, AppendBoundary records end at attempt 1, then Commit succeeds using basis 1 before actual tail 2. TailGuardSound is false; this is a same-attempt terminal race.

### TailSettlement_PartialRead_Attempt

- Expected and actual invariant: `LateCorrect`; TLC exit `12`. Raw trace: `tasks/TailSettlement_PartialRead_Attempt/trace.txt`.
- Actions: Initial predicate → AppendBoundary → ReadPrefix(1) → Submit(1) → Commit(1,FALSE).
- Inspection: AppendBoundary commits attempt 2 before ReadPrefix; the broken read keeps basis 2 but plannedLate=FALSE. Commit uses a matching tail and writes late=FALSE after attempt 2; LateCorrect is false while response basis=before=2.

### TailSettlement_PartialRead_RunEnd

- Expected and actual invariant: `LateCorrect`; TLC exit `12`. Raw trace: `tasks/TailSettlement_PartialRead_RunEnd/trace.txt`.
- Actions: Initial predicate → AppendBoundary → ReadPrefix(1) → Submit(1) → Commit(1,FALSE).
- Inspection: AppendBoundary commits end at attempt 1 before ReadPrefix; the broken read keeps basis 2 but plannedLate=FALSE. Commit uses a matching tail and writes late=FALSE after end; LateCorrect is false while response basis=before=2.

### TailSettlement_Reach_Duplicate

- Expected and actual invariant: `NeverDuplicateRejected`; TLC exit `12`. Raw trace: `tasks/TailSettlement_Reach_Duplicate/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → ReadPrefix(2) → Submit(2) → Commit(1,FALSE) → Commit(2,FALSE).
- Inspection: Both actors submit from basis 1. Actor 1 commits response key 1; actor 2 receives alreadyRecorded. Final log contains no actor-2 message, and dedupe wins over the concurrently stale tail. NeverDuplicateRejected is false. Reverse winner order is part of the positive state graph, but this saved first trace only demonstrates actor 1 winning.

### TailSettlement_Reach_Late

- Expected and actual invariant: `NeverLateSettled`; TLC exit `12`. Raw trace: `tasks/TailSettlement_Reach_Late/trace.txt`.
- Actions: Initial predicate → AppendBoundary → ReadPrefix(1) → Submit(1) → Commit(1,FALSE).
- Inspection: Boundary attempt 2 commits first. A complete read sets plannedLate=TRUE and basis=2; actor 1 Commit succeeds with late=TRUE. NeverLateSettled is false, so the positive model does not reject every late response. This first trace does not include an earlier tailChanged and retry.

### TailSettlement_Reach_TailChanged

- Expected and actual invariant: `NeverTailChanged`; TLC exit `12`. Raw trace: `tasks/TailSettlement_Reach_TailChanged/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → AppendBoundary → Commit(1,FALSE).
- Inspection: Actor 1 reads basis 1, submits, boundary extends log to 2, then Commit returns tailChanged and log stays unchanged. NeverTailChanged is false; actual conflict is reachable with all positive premises.

### TailSettlement_SplitTail_Attempt

- Expected and actual invariant: `TailGuardSound`; TLC exit `12`. Raw trace: `tasks/TailSettlement_SplitTail_Attempt/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → CompareSeparately(1) → AppendBoundary → Commit(1,FALSE).
- Inspection: CompareSeparately approves basis 1 and saves tailOK=TRUE; AppendBoundary records attempt 2; Commit reuses the verdict, with response basis 1 and before 2. TailGuardSound is false.

### TailSettlement_SplitTail_RunEnd

- Expected and actual invariant: `TailGuardSound`; TLC exit `12`. Raw trace: `tasks/TailSettlement_SplitTail_RunEnd/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → CompareSeparately(1) → AppendBoundary → Commit(1,FALSE).
- Inspection: CompareSeparately approves basis 1 and saves tailOK=TRUE; AppendBoundary records end at attempt 1; Commit reuses the verdict, with response basis 1 and before 2. TailGuardSound is false.

### TailSettlement_UnknownAsNoWrite

- Expected and actual invariant: `NoFalseNoWrite`; TLC exit `12`. Raw trace: `tasks/TailSettlement_UnknownAsNoWrite/trace.txt`.
- Actions: Initial predicate → ReadPrefix(1) → Submit(1) → LoseBeforeCommit(1) → Recover(1).
- Inspection: Actor 1 ReadPrefix, Submit, LoseBeforeCommit, then unsafe Recover adds <<1,1>> to claimedAbsent while outstanding[1]=TRUE. NoFalseNoWrite is false before any commit; this first trace does not demonstrate the separate committed-but-lost-ack branch.

## Measurement selfcheck and limits

`measurement-selfcheck.json` records 9 parser checks: correct named counterexample and completed positive are accepted; wrong assertion, parser error, missing trace, wrong exit and missing positive completion are rejected; semantic errors cannot count as SANY success even with exit 0. These are measurement-parser checks, separate from model semantics. The actual 15 control traces were additionally read by this executor and matched to the state/transition changes recorded in `trace-inspections.json`; no expected-error output was discarded.

Finite results do not establish actual StopOld isolation, old process/file/socket termination, cross-process locking, real crash/IO recovery, unknown opened request behavior, correct production Run-end recognition, valid authorization/full-prefix acquisition, lossless payload encoding, full-batch implementation atomicity, dense real positions, tenant initialization zero-write, complete failure priority, or infinite contention progress. Stable identities, batch atomicity and stopped-writer transitions are model abstraction premises. Those remain implementation/provider/runtime/reply/assembly obligations, exactly as the candidate formal README states. No refinement proof from model to implementation was performed.

The first unsafe-recovery trace demonstrates a still-pending writer; committed-with-lost-ack exists in model transitions but was not separately captured by this first counterexample. Reach-Late shows direct late settlement after the boundary, not a first conflict then retry trace. Reach-Duplicate’s first trace only shows actor 1 winning. These narrower observations are preserved rather than expanded to claims about every branch.

The candidate remains unaccepted. This result is passed to the root dispatcher for independent review and scoped disposition, without changing candidate registry, frozen inputs, bindings or verification navigation.
