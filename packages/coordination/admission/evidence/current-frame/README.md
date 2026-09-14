# Current-frame K repair checkpoint

Status: RED instrumentation only; no product implementation is present in this checkpoint.

## Fixed inputs and checkout

- branch: `fix/dsh-admission-current-frame`
- baseline and starting `HEAD`: `d84de2dc4891cd3abb22c76d6dbaba31036848f4`
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

## Calibrated measurements

The unchanged baseline source built after its records/work-data/diagnostics dependencies, then its
existing strict typecheck and all 34 tests passed. The new tests were added before product code.

[Query RED](query-red.log) ran seven F1-F7 tests against the unchanged built artifact. All seven
failed because `AdmissionCoordinator.isCurrentFrame` does not exist; callback tests that call the
missing query consequently block their ticket. SHA-256:
`1b8aa47b49e51aec4ccb34ce078bdb296957eff13c82812937eb3a54593128ab`. The executed test source
SHA-256 is `03b6cea0909ea2114841876c53d97dae7cccdcec59ed6afe104b992bbff6ed75`.

[Real-composition RED](real-red.log) ran nine F9-F13 tests through real JSONL files, native lock and
D1 diagnostics. Six failed for the expected K defect:

- F9 returned `committed/ready` after A caught reentry, so B durable publication was reachable.
- F10 returned the faulting ticket ready after its callback called `close()`; the in-flight
  successor remained capable of crossing that missing fault boundary.
- Both F11 close variants invoked the second `retainAt` after the first callback caught reentry.
- Both F12 close variants invoked B.logical after A caught reentry.

The three F13 retain/logical/durable late-rejection cases already passed on the baseline. This is a
regression constraint: the implementation must keep installing the rejection observer even after
the monotonic fault is known. The raw log SHA-256 is
`be7ea431ca2e44f48b1a8de6da8d2ff7b3af25820f8b513c6a43b41d2c0ff20c`; the executed test source
SHA-256 is `71994193eeaaf281a92e6eb9e5d6fa5fba808cf23469bd230e106dc9b60e115c`.

## Resume state

The intended minimal implementation is still unmodified:

1. publish `isCurrentFrame(frame: GateFrame): boolean` using only exact object equality and the
   existing active flag; reuse it for internal frame checks;
2. use the existing monotonic `writerQuarantined` fact to guard before and after each retain,
   logical, and durable callback, while still capturing a returned thenable before raising the
   known fault;
3. guard logical/durable success marks and watermarks, recompute committed publication blocking
   from the monotonic fact after callbacks, and preserve writer receipts/unknown outcomes and all
   claimed uses.

No new public health state, registry, rollback, release, retry, or fake writer conclusion is
needed. After implementation, rerun the targeted tests, full leaf format/build/typecheck/tests,
real packed/default-entry consumer, and applicable docs checks; replace this checkpoint with final
source-bound GREEN evidence.

F13 cannot currently expose the callback owner through real D1: admission's private diagnostic
draft retains it, but the public D1 `DiagnosticPoint` has no owner field and exact projection rejects
extra fields. Root confirmed that encoding owner into `code` or `phase` is not accepted. The current
K scope can verify rejection takeover plus original operation, position, and phase; explicit owner
projection remains unaccepted and belongs to a separately designed D1/admission mapping.
