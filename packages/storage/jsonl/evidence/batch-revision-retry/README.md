# JSONL revision catch-up and recovery-value follow-up

This record covers test source
`84ce95c1faf6ace1059662e55d388291aadba934`, which descends from the fixed
batch-revision evidence tip `2fde35a132026fc3b87468334bcc61b62f81ed0e`.
The provider implementation remains product commit
`76c7bdb35ad5f3aa2f8456aa680bc7c95b31f3da`; no product code, specification,
dependency, or lockfile changed in this follow-up.

Independent review found two assertions missing from the earlier fixture:

1. Its stored revision conflict expected revision 3. Under the corrected
   per-batch rule, the later two-record batch advances the business stream
   from 1 to 2, so the precondition never caught up and the retry did not
   demonstrate original-operation recognition after the revision matched.
2. Its recovery checks sampled positions, revisions, and epoch, but did not
   compare the complete recovered Receipt, business result, or ordered records.

The first focused scenario now stores `expectedRevision=2`, advances the
stream from 1 to 2 with one two-record batch, reads and explicitly compares
the current revision to that original expected value, and only then resubmits
the original operation. The resubmission returns the original durable
revision-conflict result rather than applying its old proposal. This closes
the affected R3/R6 branch.

The R4 fixture now compares recovered operation receipts with the complete
live receipts, including position, operation, input digest, outcome/result,
and every stream revision. It reads the recovered range and compares the
ordered two-record and one-record appends and their complete business results.
The multi-stream recovery similarly compares the complete applied and
conflict receipts, then compares the two-record approval append followed by
the three-record session append and the full committed result. The complete
unacknowledged-batch recovery compares the full decoded envelope and receipt
fields against the bytes appended before reopening.

The following commands were run with that final test tree:

```text
pnpm --filter @omne-harness-lite/jsonl run typecheck
pnpm --filter @omne-harness-lite/jsonl exec vitest run tests/provider.spec.ts -t 'keeps the first accepted result for equal input and durably records revision conflicts'
pnpm --filter @omne-harness-lite/jsonl exec vitest run tests/batch-revision.spec.ts
pnpm --filter @omne-harness-lite/jsonl test
```

The preserved outputs record strict typecheck success, the revision catch-up
scenario at 1/1, all four R1–R6 batch-revision tests, and the complete package
at 5 files and 31 tests. [checks.json](checks.json) binds their exact commands,
source, and SHA-256 digests. These are package tests over the real JSONL
provider and filesystem; HUB and governance-owner composition acceptance
remain with their assigned integrator and verifier.
