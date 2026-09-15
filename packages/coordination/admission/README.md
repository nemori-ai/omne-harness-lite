# `@omne-harness-lite/admission`

Project-owned synchronous admission coordination, ordered logical/durable publication, exact
runtime-use ownership, and the LC-06 committed broadcast for `composition.core-work-coordination`
v2 (v1 clauses unchanged apart from the CC-01 composition declaration rule).

The default public entry is `@omne-harness-lite/admission`. It consumes only the public records,
work-data, and diagnostics entries. The package is a trusted factory and does not add a Cordis
service, global registry, business authorization policy, or storage implementation.

Build with `pnpm run build`, then run `pnpm run typecheck` and `pnpm test` from this leaf. Package
tests use a constraint-preserving writer double. The real JSONL/admission/D1 composition and final
five-package consumer were separately accepted at the fixed HUB revision
`31197742905a3c66fc3e650c153d65d014372c21`; their scope and original results are in
[application evidence](../../../apps/local-harness/evidence/storage-admission/README.md).

The fixed provider verification, earlier leaf packed-consumer result, artifact hash, covered
invariants, and limits are recorded in [evidence/provider](evidence/provider/README.md). Current public
signatures and the provider mapping are in [source](src/index.ts) and [design](design.md).
The accepted P1 composition does not deliver real governance decisions or the complete
Agent/Session/tool runtime.
