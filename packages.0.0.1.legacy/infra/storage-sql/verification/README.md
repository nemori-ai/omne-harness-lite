# SQL provider verification

Run `pnpm --filter @omne-harness-lite/storage-sql build`, `typecheck`, and `test`.
The public protocol and common conformance suite belong to [storage](../../../core/storage/verification/README.md).
This page owns the provider methods for [SQL behavior](../SPEC.md), not a record of past runs.

| Obligation | Real input and method | Limit |
| --- | --- | --- |
| Same commit, rollback, and formal Service | conformance.sqlite, atomic.sqlite, service-conformance, atomic-completion, atomic-notifications tests | Use real files, separate instances and connections, and await interleaving. These do not prove application foreign keys or power-loss durability. |
| Named errors, initialization, capacity, FULL | constraints.sqlite, initialization.sqlite, capacity.sqlite, synchronous tests and the common suite | Include busy exhaustion with progress, original cause, READONLY as defect, read/write kinds, and initialization-prefix cleanup. Error objects alone do not prove a live PG transaction. |
| Upgrade owner and recovery | upgrade, upgrade.process, upgrade.plugin, upgrade-failure-combination tests | Check occupied without touching the database, preflight before writes, failed registry reads, committed WAL in the snapshot, absence markers, unconfirmed rollback, temporary remnants, SIGKILL stages, confirm identity and branches, and combined restore/release errors. Byte equality needs its stated clean-WAL premise. |
| Fixed maintenance source and view | maintenance-owned/source/engine/view tests | Concurrent source commits must not change the pinned copy. Test read-only input, invalid length, physical checks, owner checks, and actual cleanup. |
| Permanent protection and exclusion | maintenance-workspace/protection tests, maintenance-workspace-failure.process tests | Check private ancestors, the permanent marker, cross-process same-root exclusion, all production open paths, and initialization-prefix ownership. |
| Worker and resource lifetime | maintenance-worker/worker-lifetime/resources tests, maintenance-failure.process tests | Reject duplicate/invalid messages and nonzero exit. Observe actual exit before release. Include cancellation without quiescence, still-open close failures, and errors after actual close. |
| Packed consumer | Actual tarball root and `./cordis` imports, emitted declarations, and the fixed inspection-worker file in dist | Source imports alone do not verify the archived worker or pure loading boundary. Preserve private-path rejection. |
| PostgreSQL | conformance.postgres and upgrade.postgres tests with `OMNE_TEST_PG_URL` | A skipped suite is unverified. SQLite results do not establish PG recovery, savepoint behavior, or deployment assumptions. |

The bounded mechanism [probes](../tests/probes/README.md) use synthetic private databases.
Do not run their large measurement inputs as ordinary checks.
They do not establish production performance, disaster recovery, or physical power-loss durability.

The entry-maintenance model belongs to the governance entry owner. It covers entry publication, actual completion, isolation, and cancellation under finite assumptions. It does not model SQLite file algorithms. SQL must meet its own resource, fsync, lock, and worker obligations. Model receipts and each run's output stay in the worktree tmp directory.

Keep positive and negative controls for foreign keys, guard ownership, conditional commit, and real cleanup.
A control must fail the intended assertion. An arbitrary nonzero exit does not count.
Unknown completion cannot become rolledBack merely because a handle closed.
