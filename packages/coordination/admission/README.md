# `@omne-harness-lite/admission`

Project-owned synchronous admission coordination, ordered logical/durable publication, and exact
runtime-use ownership for `composition.core-work-coordination` v1.

The default public entry is `@omne-harness-lite/admission`. It consumes only the public records,
work-data, and diagnostics entries. The package is a trusted factory and does not add a Cordis
service, global registry, business authorization policy, or storage implementation.

Build with `pnpm run build`, then run `pnpm run typecheck` and `pnpm test` from this leaf. Package
tests use a constraint-preserving writer double; the final JSONL/admission composition and packed
consumer are separate integration obligations.
