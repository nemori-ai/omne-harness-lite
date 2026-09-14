# JSONL provider verification record

This record covers the package implementation at `039b1589402f9bc699297244506541add9d7218e`
and its additional conformance tests at `2e1c31dd710abb8ea27ce28f0457072a20b7fb27`.
The implementation descends from the fixed task start
`03e3f98a3c22b43cb261117d82d28a9eae8bdc58` and consumes the root dependency lock at
`976149b7e82276df7efdf3d344c9163aebdc0b6b`.

## Observed RED/GREEN boundaries

- The initial provider tests required a default `createJsonlProvider` implementation; the earlier
  package only exposed ordinary JSONL file operations. Commit `5b139834ddf226a0609efd1ff42f24efc20acb36`
  added the real journal, flock, epoch, deduplication, receipt, recovery, and reader path.
- Before `039b158`, a journal close failure reported `lockHeld: false` after the implementation had
  attempted unlock. The corrected implementation retains the original `FileHandle`, reports
  `lockHeld: true`, and a separate Node process observes `busy`. An uncertain recovery-evidence
  handle is held by the same `AcquisitionCleanup`; repeated release keeps the same cleanup ID and
  real flock instead of retrying an unknown descriptor.
- Before `039b158`, `localeCompare` reordered the valid canonical stream sequence `A`, `a`, so a
  revision conflict was synchronously rejected by the records codec. The corrected path preserves
  the already validated JavaScript canonical order and durably records the conflict at sequence 2.
- The first composition observation against `5b13983` rejected uppercase JSONL diagnostic codes.
  The provider now emits lowercase D1 semantic codes; its acquire and durable-commit test records
  `writer_acquired` and `commit_durable` and checks the D1 code grammar.
- The write-before-progress and same-operation pending replay cases in `2e1c31d` were conformance
  checks over existing behavior. They were not forced to fail: a write-call error remains unknown
  until recovery proves `not_committed`, and duplicate submission returns the same pending object.

## Package verification

The following commands passed from `packages/storage/jsonl` at `2e1c31d`:

```text
pnpm run build
pnpm run typecheck
pnpm run test
```

The test result was 4 files and 26 tests passed. Coverage includes the fixed epoch golden line,
same-input pending/result replay, different-input and revision conflicts, canonical multi-stream
positions, strict recovery, short and partial writes, write-before-progress, sync-before/after
uncertainty, file and directory sync failures, no writes beyond a durability gap, retained cleanup,
close draining, real two-process flock competition, SIGSTOP, SIGKILL, and receipt-boundary death.
Diagnostic logging throws in the partial-write and file-sync failure cases without changing the
original unknown result or allowing a later write.

## Packed consumer

The package was rebuilt and packed after `039b158`. A separate package installed that tarball plus
the accepted diagnostics, records, and work-data tarballs with scripts disabled. Its allowlisted
native step was:

```text
CC=<isolated-gcc-10> CXX=<isolated-g++-10> GCC_EXEC_PREFIX=<isolated-gcc-prefix> \
  pnpm rebuild fs-ext --pending --ignore-workspace
```

With `NODE_OPTIONS=--no-global-search-paths`, ESM resolution placed all four imports inside the
consumer's tarball dependency tree, strict TypeScript compilation passed, and actual execution
reported:

```json
{
  "acquisition": "acquired",
  "commit": "committed",
  "lookup": "committed",
  "recoveredEpoch": "2",
  "physicalLines": 3
}
```

The measured environment was Node 24.18.0, pnpm 10.28.1, Linux 5.15.0-1084-aws x86-64, a local
ext-family filesystem reported as `ext2/ext3`, and isolated GCC 10.5.0. This is package and packed
consumer evidence. The independent JSONL/admission/diagnostics composition and final P1 acceptance
remain with their assigned verification and integration owners.
