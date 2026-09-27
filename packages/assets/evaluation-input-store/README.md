# evaluation-input-store

This package implements the locally published input reader used by model requests. Its
accepted contracts and provider design are in [the realization node](../../../.meta_harness/design/realization/packages/assets/evaluation-input-store/README.md).

The root exports `createEvaluationInputReader`, the SQL migration fragments and a Cordis
plugin factory. Supply the same `AtomicStorage` instance used by real organization governance,
the session tenancy reader, an explicit store key, trusted deployment entries
`{ capability, meta }`, diagnostic/failure callbacks and a monotonic measurement clock.
`reader.read(session, tenant)` returns an owned input or a classified failure. The plugin
publishes only `currentEvaluationInputs.read`; the public closure also has `close()`.

Import `publishLocalInputs`, `captureSessionRecipe` and `readPublicationRevision` from
`@omne-harness-lite/evaluation-input-store/publication` in the trusted application bootstrap.
Publish immutable definitions and explicit factory/organization/tenant scope collections
with `expectedRevision`; an empty scope collection and a missing scope row differ. Establish
the real session tenancy mapping before capturing its recipe. A later publication changes
what subsequent reads see. Do not automatically retry a publication whose commit result is
unknown; read its revision and actual data first.

The restricted `./registry-inputs` entry provides the separate fixed-root reader and its
types. Repository consumers are limited by the structural checker. Its trusted caller must
first verify the same-session original complete fill; this component does not recover that
origin. `rootSourceMismatch` carries the actual C16 refusal and selected source so the
registry can preserve the existing tables. Runtime uses the ordinary root reader.

Compose these migrations with account, governance, clock and session tenancy migrations
before admission. Old bare deployment manifests are refused until an explicit trusted
republish; no meta value is inferred. Mounted workspace and unresolved shared sources
remain unavailable. The application owns the storage and governance services: close input
readers, drain publication calls, then close those dependencies.

Run `pnpm --filter @omne-harness-lite/evaluation-input-store build`, `typecheck` and `test`.
Tests use real file-backed SQLite, real account/login/governance plugins, controlled races
and child-process termination. They cover this component; they do not certify the model
runtime, recover registry fill origins or establish power-loss durability.
