# Result delivery protocol model

This finite model checks the safety obligations in the Model contract's [result storage and cleanup rules](../../SPEC.md#结果推送与保存). It separates durable facts from the caller's knowledge. The model keeps the original operation when a reply is lost.

The normal model explores one result key and two interleaved result keys. Each key has two late account revisions. The complete graphs contain 348 states with 4,031 transitions and 40,368 states with 908,280 transitions. Seven directed scenarios, 78 knowledge regressions, and 37 named negative controls supplement the graphs. Six subprocess checks reject resource limits, depth truncation, and an injected knowledge defect.

The scripts have separate responsibilities.

| Script | Responsibility |
| --- | --- |
| model.mjs | State, transitions, safety properties, and breadth-first exploration |
| self-test.mjs | Seven directed recovery, custody, ACK, cleanup, and late-account scenarios |
| knowledge-test.mjs | Seventy-eight queries and knowledge-change regressions |
| boundary-test.mjs | Direct and aggregate rejection of three incomplete or defective runs |
| run.mjs | Complete execution and per-run evidence manifest |

## Run the complete model

Run the maintained test from the repository root.

```sh
pnpm --filter @omne-harness/model-contract exec vitest run tests/protocol-model.spec.ts tests/protocol-model-runner.spec.ts --mode slow --typecheck.enabled=false
```

Both files belong to the slow tier because they start subprocesses and explore the finite graph. The normal member test includes both tiers. Fast tests do not execute this model.

The test copies the five scripts into a unique directory under repository `tmp/model-contract-protocol/`. It runs the copies and checks their evidence. The source directory stays unchanged. A successful test removes its temporary directory. A failed test retains evidence and reports its path.

The private supervisor uses POSIX process groups. It stops the model group when the test process disconnects, the deadline expires, output exceeds its limit, or the root process exits. It rejects unsupported Windows execution. Its 90-second deadline precedes the slow tier's 120-second deadline. External destruction of the supervisor itself requires the surrounding job manager to clean up the job.

The lifecycle tests cover ten wrapper failures and four parent-death scenarios. They check missing or partial evidence, signals, deadlines, excessive output, orphaned descendants, and parent disconnection. The parent-death cases include a real controller SIGKILL, early supervisor exit, missing source files, and missing readiness evidence. They require each recorded PID and owned process group to disappear. Outer cleanup cannot turn a failed case into a successful observation.

Parent-death tests have a 25-second test limit. Independent deadlines bound readiness, process closure, report arrival, and cleanup before that limit. The tests print their evidence summary before removing successful temporary directories. A supervisor failure remains a failure in that summary even when the test correctly detects it.

Run the supervisor directly only when you need retained evidence. Create a unique parent directory first. Pass the formal source directory and a nonexistent target directory. Do not invoke run.mjs in this source directory, because that script writes evidence beside itself.

A successful process exit alone is insufficient. The supervisor requires the complete manifest, both closed graphs, every named negative control, and all scenario and boundary results. Resource-limited or depth-truncated exploration is incomplete even when a direct entry exits with code zero.

## Assumptions and limits

The model assumes that committed material is complete and durable. The Journal commit establishes the original association, responsibility, deduplication, and protection together. Stable operations and recovery records remain available. An authoritative absent result excludes the original write and its delayed commit. The owning providers enforce qualification and content binding. A late-account fact and its pending delivery record become durable together.

The model checks whether queries correctly report and preserve these facts. It does not assume that every query response is truthful. The named negative controls test false results and changes to another key, operation, or domain.

The crash-and-recover action preserves the abstract durable state. It does not simulate a real process restart or disk failure. This model does not prove physical durability, cross-storage atomicity, live authorization, EvidenceAdapter behavior, capacity accounting, or conformance of a production provider. It does not prove unbounded scale, fairness, or eventual completion.

The query checks reject changes to another key, operation, or domain. They also reject false absent and false committed results. Changes to this model require review of the transition graph and the named negative controls. Model verification does not grant product acceptance.
