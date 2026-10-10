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
All four configurations disable TLC's deadlock check because the model permits normal termination.
The declared safety invariants remain enabled. This model does not check deadlock freedom.
Use the original ACK/recovery models and actual SQLite/JSONL tests for those declared obligations.
Single-run output belongs in the worktree's `tmp/`.

## Provider borrow model

`provider-borrow/ProviderBorrow.tla` checks two callers: acquisition, withdrawal, late
completion, provider stop, actual consumer stopping, source release and borrow return.
Run `ProviderBorrow.cfg`; all invariants must hold. The `early-return` and
`failed-release` configurations must violate `ConsumerCustody` and `SourceCustody`,
respectively. Provider stop requests cleanup independently of caller withdrawal.

The model treats each cleanup request as one atomic abstract step. JavaScript scheduling,
effect installation, actual fiber cleanup, authorization, IO, setup prefixes and resource
release exceptions need the real tests. This finite safety model disables deadlock checks;
it does not prove progress, fairness, GC or failure recovery. A source release that fails
normally leaves the borrow held; the negative control deliberately removes that protection.
