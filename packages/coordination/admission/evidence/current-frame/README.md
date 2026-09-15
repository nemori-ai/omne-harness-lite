# Current-frame K repair evidence

Status: GREEN. The product implementation of the adopted candidate is present and the sixteen
K tests pass together with the pre-existing suites. The RED checkpoint below is kept as history.

## Fixed inputs and checkout

- branch: `impl/dsh-admission-composition-broadcast`
- parent of the implementation commit: `cfd0e351e3fb6dc58bb38436b237af8e198936cf`
  (RED tests landed at `4a3efc2`; the composition-name change at `766af9b` and the CC v2 design
  references at `cfd0e35` precede the repair)
- adopted candidate SHA-256:
  `255caf0a7748577a08482d2a6a92b5dbcae216dfab27b18c8af9d75894f6d5ec`
- Node: `v24.18.0`
- pnpm: `10.28.1`
- real composition: default `@omne-harness-lite/admission`,
  `@omne-harness-lite/jsonl`, and `@omne-harness-lite/diagnostics` public entries
- native dependency: `fs-ext` 2.1.1 built for Node ABI 137 with the campaign's fixed GCC 10
  environment

The workspace-adopted Cordis release is `@deepseek-ai/cordis` 4.0.2, with the project source
mapping fixed at official DeepSeek Harness revision
`c291e7961a515f6d7af9304e7fd1d257929aef26`. Admission remains a project-owned factory and has no
Cordis dependency or service mapping; the K repair does not change that boundary.

## Implementation bound to this evidence

`src/index.ts` SHA-256 at the time of the GREEN runs:
`ba9afa8750e3e5ef91d944abd335b24c090b14e555bee17584c1e05b9c1cdf74`. The change is the minimal
form of the adopted candidate:

1. public `isCurrentFrame(frame): boolean` on `AdmissionCoordinator`, implemented as exact object
   identity plus the existing active flag; the former private `validFrame` is replaced by it for
   `lookupPrepared`, `submit`, and `retainAt`. It does not read the input or the phase.
2. `stopAfterKnownFault` reads the existing monotonic `writerQuarantined` fact before and after
   each `retainAt`, `publishLogical`, and `publishDurable` call inside `invokeStrict`, and before
   `retainInvoked` is marked. A returned thenable is still captured for late-rejection takeover
   before the fault is raised. A callback that caught its own reentry and returned `undefined`
   therefore no longer counts as a completed callback; later callbacks of the same ticket do not
   run.
3. `finishTicket` recomputes the committed ticket's publication blocking after the durable
   callbacks from the same monotonic fact, so the coordinator durable watermark does not cross a
   publication gap and the completion is `committed/blocked` with the writer's receipt intact.
   Writer `unknown` results and all claimed uses are preserved as before.
4. `quarantine()` relabels the phase only from `open`; a closing coordinator keeps reporting
   `closing` while the fault stays in `writerQuarantined` and `status().diagnosticId`. The
   writer-close rejection branch of `close()` no longer rewrites the phase.

No public health state, registry, rollback, release, retry, or synthetic writer conclusion was
added.

## GREEN measurements

[Query GREEN](query-green.log) ran the seven F1-F7 tests through the built default entry: 7 passed.
Log SHA-256: `ee94a56bd0bccda48df46403b607f5481aa6fb842f4cfe933110f8de17ec3c9b`. The executed
test source `tests/current-frame.spec.ts` is byte-identical to the RED checkpoint, SHA-256
`03b6cea0909ea2114841876c53d97dae7cccdcec59ed6afe104b992bbff6ed75`.

[Real-composition GREEN](real-green.log) ran the nine F9-F13 tests through real JSONL files, the
native lock, and D1 diagnostics: 9 passed. Log SHA-256:
`a54c3ad8e2000633c0f87aa15f08a8f7716872137af6341524aa578930aa4450`. The executed test source
`tests/real-callback-faults.spec.ts` has SHA-256
`993aee69f90b5c8cc615c593794e0ff948d12588ecb0cde83c4aab28c4093343`; it differs from the RED
checkpoint by one type-narrowing line in F9 (`if (completion.status !== 'committed') throw`) that
the strict test typecheck required. No assertion was changed.

Observed with the real composition:

- F9: B durable publication does not run; completion is `committed/blocked` with the receipt and
  position equal to the writer's committed fact; the coordinator durable watermark stays at `0`;
  re-awaiting the same pending completion returns the same result.
- F10: `close()` inside the faulting callback leaves the phase reading `closing` but does not wash
  the fault; the in-flight successor commits and is `blocked`, its durable callback never runs,
  the writer close returns `blocked`, and the durable watermark stays at `0`.
- F11 (both close variants): the second `retainAt` and all publications do not run; the real
  JSONL queue reports `unknown`; both claimed pins refuse `not_admitted` and keep their owner
  release callbacks uncalled.
- F12 (both close variants): B logical and all durable publications do not run; A's already
  assigned local root is not rolled back; the coordinator logical watermark stays at `0`; the
  result is `unknown`.
- F13 (retain/logical/durable): the late rejection is still observed with the original tenant,
  operation, position, and phase and no unhandled rejection; later callbacks stay blocked.

[Leaf GREEN](leaf-green.log) is the full leaf `build`, strict test `typecheck`, and Vitest run at
the same source: 5 files, 52 tests passed (34 original, 3 F13, 2 composition-name tests from
`766af9b`, 7 query, 6 real). Log SHA-256:
`aa1fdb6a69ee8447f289af7f2b42ac6137996a5ef313cd66659506d2b0353465`. Absolute worktree paths in
the raw logs were replaced by `<worktree>`.

## Limits

- `evidence/provider/` (packed default-entry consumer) was not re-run for this repair; the
  provider evidence still binds the earlier `025793a` artifact.
- F13 cannot expose the callback owner through real D1: the public `DiagnosticPoint` has no owner
  field and exact projection rejects extra fields. The current K scope verifies rejection takeover
  plus original operation, position, and phase; explicit owner projection remains unaccepted and
  belongs to a separately designed D1/admission mapping.

## RED checkpoint (history)

The unchanged baseline source built after its records/work-data/diagnostics dependencies, then its
existing strict typecheck and all 34 tests passed. The new tests were added before product code at
baseline `d84de2dc4891cd3abb22c76d6dbaba31036848f4`.

[Query RED](query-red.log) ran seven F1-F7 tests against the unchanged built artifact. All seven
failed because `AdmissionCoordinator.isCurrentFrame` did not exist; callback tests that call the
missing query consequently blocked their ticket. SHA-256:
`1b8aa47b49e51aec4ccb34ce078bdb296957eff13c82812937eb3a54593128ab`. The executed test source
SHA-256 was `03b6cea0909ea2114841876c53d97dae7cccdcec59ed6afe104b992bbff6ed75`.

[Real-composition RED](real-red.log) ran nine F9-F13 tests through real JSONL files, native lock and
D1 diagnostics. Six failed for the expected K defect:

- F9 returned `committed/ready` after A caught reentry, so B durable publication was reachable.
- F10 returned the faulting ticket ready after its callback called `close()`; the in-flight
  successor remained capable of crossing that missing fault boundary.
- Both F11 close variants invoked the second `retainAt` after the first callback caught reentry.
- Both F12 close variants invoked B.logical after A caught reentry.

The three F13 retain/logical/durable late-rejection cases already passed on the baseline. This was
the regression constraint that the implementation keeps installing the rejection observer even
after the monotonic fault is known. The raw log SHA-256 is
`be7ea431ca2e44f48b1a8de6da8d2ff7b3af25820f8b513c6a43b41d2c0ff20c`; the executed test source
SHA-256 was `71994193eeaaf281a92e6eb9e5d6fa5fba808cf23469bd230e106dc9b60e115c`.
