# Admission provider verification

This evidence fixes the provider implementation at
`025793abbb7298b1eb86a4ca403e581a0e7a5d7b`. It verifies the default public entry and the
admission-owned portions of `composition.core-work-coordination` v1 against the accepted provider
design. It does not upgrade the contract, accept the implementation, or replace the real
JSONL/admission composition owned by the repository integration task.

## Results and artifact

The final leaf run used Node `v24.18.0` and pnpm `10.28.1`:

- build: pass;
- strict test typecheck: pass;
- Vitest: 3 suites and 34 tests pass;
- tracked worktree after the run: clean.

The original output is preserved in [leaf-verification.log](leaf-verification.log). The historical
absolute worktree path in that raw output identifies where the command ran and is not a runtime or
reproduction dependency.

`pnpm pack` produced `omne-harness-lite-admission-0.0.0.tgz` with SHA-256
`7b0d8d2f4918429593c8d507514f9dc2899222a71a80a842b42ebd709f0e73e5`. The artifact contained
the compiled default entry and declaration, package metadata, README, and provenance. The fixed
file list and hash are in [artifact.txt](artifact.txt). These verification records are maintained
in the source repository. The current distribution follows the existing product artifact boundary
and contains compiled entries, package metadata, README, and provenance; it excludes verification
sources and logs. The temporary evidence-inclusive artifact at `deabdb1` had a different hash and
is not the final distribution accepted by the repository checker.

An isolated consumer installed the admission, diagnostics, records, and work-data tarballs at
version `0.0.0` with lifecycle scripts disabled. Its strict TypeScript check passed, then its
runtime loaded `@omne-harness-lite/admission` through the default export map and exercised a
synchronous gate, guarded fresh-use release, and coordinator close. The exact consumer sources are
[public-consumer.ts](public-consumer.ts) and [runtime-consumer.mjs](runtime-consumer.mjs); original
command output is in [consumer-verification.log](consumer-verification.log). The install reused 34
cached packages and downloaded the missing exact `nan@2.29.0` tarball required transitively by
diagnostics `fs-ext`; no lifecycle scripts ran.

## Covered admission properties

The tests cover these admission-owned properties:

- one injected writer path, real active frame identity, frame expiry, reentry failure, thenable
  rejection, preparation outside the gate, writer pump starting only after the submission stack,
  and diagnostics or release work after frame invalidation;
- exact publication-owner sets, exact issued-use tuples and record owners, accessor rejection,
  stable copies of arrays and metadata, stable callback references, and pre-ranking rejection;
- private issuer binding and one-way ExactUse states, same-ticket recognition, cross-operation
  rejection, cleanup of only a duplicate fresh pin, one owner release per in-flight cleanup,
  retained/released terminal guards, and no unknown release without owner verification;
- strict `undefined` from `retainAt`, `publishLogical`, and `publishDurable`, including throw,
  non-synchronous thenable, late rejection, and late resolve that cannot restore readiness;
- same-stack logical publication, sequential durable publication before the coordinator's own
  completion, no business publication or retain for `record_conflict`, and stable conflict results;
- permanent publication-gap closure. The reproduced sequence was two ranked apply tickets, the
  first durable publication throwing, close changing the lifecycle phase, and the second writer
  result committing. Before `4434eb15ca6607702f76a0d8e07685b3fa1d73f0`, the second ticket
  incorrectly became ready and advanced the admission durable watermark; after the fix it remains
  blocked and cannot publish across the first gap;
- close first shutting new admission, waiting for coordinator publication completions, calling the
  writer close once, and preserving a blocked close result;
- diagnostic double failure without losing the commit or ExactUse responsibility, plus prepared
  tenant, principal, operation, causality, and position correlation. The real D1 composition
  separately observed the late-rejection projection become valid after
  `025793abbb7298b1eb86a4ca403e581a0e7a5d7b`.

The business examples are contract-constrained owner substitutes. They measure call n before
revoke n+1, pending grants not enabling new admission, and budget/decision consumption only once;
the coordinator contains no authorization, grant, budget, or decision policy.

## Limits and remaining verification

The leaf RecordWriter is an in-memory constraint double. It preserves synchronous submission,
same-operation deduplication, revision conflict, ordered delayed completion, quarantine, and close,
but it does not establish filesystem append, fsync, truncation, lock, or crash-recovery behavior.
Those properties, real close interleavings, and the final application-visible composition remain
with the JSONL/admission verification owner.

The isolated runtime consumer checks package loading and the narrow factory lifecycle; it does not
replace the real diagnostics or JSONL composition. TypeScript also cannot forbid an async callback
through the accepted generic `enter<T>` signature. Runtime tests therefore verify thenable
rejection, rejection-channel takeover, frame invalidation, and writer quarantine.

Crash replay and owner durable-root reconstruction, application authorization policy, HITL,
model/tool execution, and a dynamic plugin platform are outside this provider. The package creates
no Cordis service or global registry because the accepted boundary is a pure factory.
