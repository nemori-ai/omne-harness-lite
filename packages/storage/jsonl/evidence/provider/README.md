# JSONL provider verification record

This record covers the final provider source at
`7152a7192c84fa49c27255bfdb4f9b0e86ad8eb5` and its integration in the HUB at
`e845c9729c7c6a835aba4876c97d425326b35acc`. The implementation descends from the fixed task start
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
- Composition observations against `5b13983` rejected uppercase JSONL success codes, and the later
  failure probe found the dynamic `EIO`/uppercase fallback path. The provider now uses fixed
  lowercase D1 semantic codes; tests record `writer_acquired`, `commit_durable`, and
  `journal_durability_unknown`, including a diagnostics throw during the original storage failure,
  and check the D1 code grammar.
- The write-before-progress and same-operation pending replay cases in `2e1c31d` were conformance
  checks over existing behavior. They were not forced to fail: a write-call error remains unknown
  until recovery proves `not_committed`, and duplicate submission returns the same pending object.
- Before `7152a71`, an acquisition cleanup whose flock unlock and `FileHandle.close()` both failed
  reported `lock: unknown`, but a retry interpreted the wrapper's idempotent close return as
  `released` while a separate process still observed the real flock as `busy`. The corrected
  resource set tracks the lock handle's close state separately, retains the same unknown handle and
  cleanup ID, and does not rewrite the lock observation. The focused outputs are preserved in
  [red-lock-close-unknown.log](red-lock-close-unknown.log) and
  [green-lock-close-unknown.log](green-lock-close-unknown.log).

## Final HUB package verification

The root integrator ran the following commands against HUB revision `e845c972` after integrating
the complete `7152a71` source and its regression test:

```text
pnpm --filter @omne-harness-lite/jsonl... run build
pnpm --filter @omne-harness-lite/jsonl typecheck
pnpm --filter @omne-harness-lite/jsonl test
```

The preserved command/result manifest is [hub-final-checks.json](hub-final-checks.json), and the
unaltered combined stdout is [hub-final-checks.log](hub-final-checks.log). The copied files have
these SHA-256 digests, equal to their original files under the root integrator's historical
`tmp/p1-hub/jsonl-lock-unknown` observation directory:

| Long-lived copy                | SHA-256                                                            | Subject and scope                                                               |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `hub-final-checks.json`        | `8dc89890b75804064818ab9e8dd706a61a12159abe70a6c0e9b59ed800186a21` | Exact HUB `e845c972` command/result manifest                                    |
| `hub-final-checks.log`         | `f83d10b131b987c1f2eec664f8f04f6c36d9b55879c5d2aa8f2464dd18560898` | Exact HUB `e845c972` combined build/typecheck/test stdout                       |
| `red-lock-close-unknown.log`   | `08529b3b097b88c5e0b784480fecf4ec9ba2a5735ca729d7c8481a9395afa903` | Focused pre-`7152a71` failing assertion and real child result                   |
| `green-lock-close-unknown.log` | `fe8a84ff05b08fad8cb2f8085fcfd40f612bb1916b626a49ff478cd6046785e2` | Focused `7152a71` target-test result                                            |
| `consumer-039b158.stdout.log`  | `3d174252c6d03793f25edf924cd9c29d86fcec0a8616d17f8fa73c896de2a8d3` | Exact earlier consumer resolution and execution stdout; scope remains `039b158` |

The final test result was 4 files and 27 tests passed. Coverage includes the fixed epoch golden line,
same-input pending/result replay, different-input and revision conflicts, canonical multi-stream
positions, strict recovery, short and partial writes, write-before-progress, sync-before/after
uncertainty, file and directory sync failures, no writes beyond a durability gap, retained cleanup,
close draining, retained unknown lock-handle state, real two-process flock competition, SIGSTOP,
SIGKILL, and receipt-boundary death. Diagnostic logging throws in the partial-write and file-sync
failure cases without changing the original unknown result or allowing a later write.

## Earlier packed consumer scope

The packed consumer was run against the provider artifact built at
`039b1589402f9bc699297244506541add9d7218e`, before the test/docs-only commits `2e1c31d`,
`ca30c2e`, and `e87ed92`, and before `a8a37c8` fixed the dynamic failure diagnostic code and
`7152a71` fixed unknown lock-close state. It proves the default public factory, four tarball
dependency resolutions, native flock load, and the happy path through recovery for that earlier
provider artifact. It does **not** verify the final tarball contents or the final failure diagnostic
projection. A separate package installed that tarball plus the accepted diagnostics, records, and
work-data tarballs with scripts disabled. Its allowlisted native step was:

```text
CC=<isolated-gcc-10> CXX=<isolated-g++-10> GCC_EXEC_PREFIX=<isolated-gcc-prefix> \
  pnpm rebuild fs-ext --pending --ignore-workspace
```

With `NODE_OPTIONS=--no-global-search-paths`, ESM resolution placed all four imports inside the
consumer's tarball dependency tree, strict TypeScript compilation passed, and actual execution
reported the following. The exact two stdout records, including their historical observation
paths, are retained in [consumer-039b158.stdout.log](consumer-039b158.stdout.log).

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
consumer evidence for `039b158`. The final `7152a71` package checks are the HUB observations above.
Independent JSONL/admission/diagnostics composition and final P1 acceptance remain with their
assigned verification and integration owners.
