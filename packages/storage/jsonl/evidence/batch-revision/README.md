# JSONL batch revision verification

This record covers the stream-revision correction in product commit
`76c7bdb35ad5f3aa2f8456aa680bc7c95b31f3da`, based on
`eb69199e1be4e61928559054852a277008af5bc6`. The adopted input is section I,
R1–R6 of candidate
`c6b3a2924b63359bbb8ea79a570bba4e49b3b2ef061ee35e54ccbecd6483e208`;
the independent review found no blocker for section I, and the root adoption
accepted that section. The shared rule was already present in the accepted
records source at commit `8f4cfa9c38092a9bfa1a9848a0fb506b35d779c5`.

The executable fixture now in `tests/batch-revision.spec.ts` was first run
against the base implementation. [red.log](red.log) preserves all four
failures: the first two-record append advanced to revision 2 and made the next
`expectedRevision=1` conflict; a two-stream append produced revisions 2 and 3;
a complete unacknowledged two-record append recovered as revision 2; and a
complete predecessor chain using the old `+N` interpretation was accepted.
The warnings in that RED output came from assertions aborting before fixture
writers reached their explicit closes; the same fixture completes without
warnings on the corrected implementation.

The correction makes the existing `revisionsAfter` function add exactly one
for every append. This one function is consumed by logical assignment,
durable advancement and receipts, `rememberRecovered`, journal scanning, and
writer-epoch construction. It leaves envelope sequence, writer epoch, record
ordering, original-operation identity, and the existing durability and lock
lifecycle unchanged.

The focused GREEN in [focused-green.log](focused-green.log) records 4/4 tests:

- R1/R2: a two-record first batch receives revision 1; a synchronously queued
  `expectedRevision=1` batch is assigned sequence 3, while `readHead` remains
  at the durable sequence 1/revision 0 until completions; receipts become 1
  and 2 in order.
- R3: a two-record stream and a three-record stream each become revision 1.
  One mismatched precondition keeps both business heads at 1 and durably
  advances only the provider conflict-result stream once.
- R4: close/reopen recognizes the operations at their expected positions and
  revisions, recognizes the original conflict outcome, and preserves revision
  heads while the writer epoch advances. A separately appended, complete but
  unacknowledged multi-record batch is recognized at revision 1. This fixed
  source sampled those fields; complete Receipt, business-result, and ordered
  record comparisons are preserved in the later
  [recovery-value follow-up](../batch-revision-retry/README.md).
- R5: a complete multi-record batch followed by an `expectedRevision=2`
  successor is rejected during acquisition, returns released cleanup, and its
  exact journal bytes remain unchanged.
- R6: same-operation/same-input retries with different proposed appends return
  the original pending object and then the original committed result, without
  another revision increase. Existing tests retain the different-input
  conflict rule. The later-revision-matches-original-precondition branch is
  covered by the [revision catch-up follow-up](../batch-revision-retry/README.md).

## Product checks at the fixed source

The following commands were run from the repository worktree at exact product
revision `76c7bdb35ad5f3aa2f8456aa680bc7c95b31f3da`:

```text
pnpm --filter @omne-harness-lite/jsonl... run build
pnpm --filter @omne-harness-lite/jsonl run typecheck
pnpm --filter @omne-harness-lite/jsonl test
make docs-check
```

The preserved outputs are [final-build.log](final-build.log),
[final-typecheck.log](final-typecheck.log), [final-test.log](final-test.log),
and [final-docs-check.log](final-docs-check.log). They record a successful
four-package build, strict test-project typecheck, 5 files and 31 tests passed,
and 503 Markdown files checked. [checks.json](checks.json) binds the commands,
source and SHA-256 digests.

The measured environment was Node 24.18.0, pnpm 10.28.1, Linux
5.15.0-1084-aws x86-64, and a local filesystem reported as `ext2/ext3`.
`fs-ext@2.1.1` was rebuilt through the allowlisted native path with isolated
GCC 10.5.0 before the tests. No dependency or lockfile changed. This evidence
is package-level JSONL verification; HUB integration and cross-package TG/BG
consumers remain with the root integrator and their assigned verification.
