# Structural-model history

`AuthorizationNoninterference.tla` and `SnapshotReducer.tla` began against the
pre-contract structural design. The initial snapshot model allowed a captured
`closing@p1` snapshot to overwrite an already installed `terminal@p2` changes
batch. TLC found that regression; the model now requires the current
replacement token and visibility version and `snapshotAsOf >= clientCursor`.
The original counterexample remains in the E formal evidence package.

The E round-1 text lacked a complete client encoding for state-only updates
and hidden-only coverage, and allowed a response's global projection watermark
to overstate a concrete requested `to`. Those were contract gaps, so round-1
runs were diagnostics only. E round-2 added the `changes` response boundary,
and round-3 clarified the `resync:none` versus `resync:full` entry gate.
Current resource coverage and limits are in [README.md](README.md); finite TLC
runs against the exact candidate must be read from the task's versioned
evidence package, not inferred from this history.
