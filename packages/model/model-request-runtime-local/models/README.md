# Execution-source model

`execution-source/ExecutionSource.tla` checks two physical generations and two recovery captures for one logical call.
It models accepted insertion, a failed public result, actual stop, ACK sealing, capture release, private-copy erasure, durable release, and overall source release.

Run TLC with `ExecutionSource.cfg`. All declared invariants must hold.
The three separate negative configurations must produce invariant violations:

| Configuration                        | Broken mechanism                                    |
| ------------------------------------ | --------------------------------------------------- |
| `ExecutionSource-erase-pinned.cfg`   | Erase before an existing capture releases           |
| `ExecutionSource-publish-early.cfg`  | Publish durable release before private-copy erasure |
| `ExecutionSource-release-pinned.cfg` | Release the source with an active capture           |

This is a finite safety model. It does not prove GC, IO, tenant authorization, scheduler fairness, crash atomicity, or progress.
Use the original ACK/recovery models and actual SQLite/JSONL tests for those declared obligations.
Single-run output belongs in the worktree's `tmp/`.
