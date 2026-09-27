# W1 foundation handoff

Source commit: `efe73eb5144d44c7f2d40b8908ffa469beb156aa`; baseline `0bf83cd7`.

Only seven identity-values files changed. Offer-expiry has no new package-local coverage gap; unchanged behavior was rechecked. No specs, frozen resources, tooling, root config, realization node text or non-core source changed.

## Public handoff

- `OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS: readonly number[]`: the one frozen 26-point array used by `parseOpaqueIdentifier`, available through package exports for asset-model and slash consumers.
- `IDENTITY_BRAND_NAMES`: frozen tuple `AccountId`, `OrganizationId`, `LoginStateId`; those actual aliases derive their brand from the tuple.
- `IDENTITY_TYPE_NAMES`: frozen tuple above plus existing structural identities `TenantId`, `ScopeLayerIdentity`. LoginIdentifier and HandoffWarrant are not identity names.
- checks owner should import the public identity list; HUB owns any required workspace dependency/lock integration.

## Evidence

`verification.log` records actual commands and exit codes. Identity-values 259 tests passed (211 inherited, 48 additions including 43 Alloy-comparison cases), no type errors; offer-expiry 31 passed. Both build/typecheck passed. Local formatting and diff checks passed; schema copies are byte-identical. Independent consumer runtime and strict tsc passed through package `exports`/built `dist` with no paths aliases or sibling src imports.

Consumer is in `consumer/`, with package symlinks under its node_modules targeting this checkout's built package directories. Its initial tsc lacked Node ambient types; local @types was then linked from this checkout's identity package and `--types node` was made explicit. Product sources/configs did not change for that environment fix.

S-31 regression derives expected points from the accepted contract's explicit table, verifies edge rejection and interior preservation with parser/Schema, and attempts runtime array mutation. Existing negative brand-type checks remain green.

S-14/S-15 comparison uses the adopted Affiliation.als unchanged plus the local query suffix in `affiliation-query-suffix.als`. `alloy-fixture/receipt.json` and `coreCorrespondenceFixture-solution-0.json` are the actual SAT4J run results. Six organizations form a 3-level team chain, a second team root, and two personal roots. Tests compare six ancestor sets and 36 ordered shareAncestor pairs to the actual result relations, not a duplicate graph algorithm. Alloy represents the closure as a set; existing near-to-far unit case separately tests ancestorChain sequence order. This finite fixture is not an exhaustive proof.

For reproduction concatenate current adopted model bytes and query suffix into a temporary .als, then run `alloy exec -q -c coreCorrespondenceFixture -t json -o <fresh-output-dir> <temporary-model>`. The receipt records solver/scope. Original model hash and raw solution hash are also retained in tracked fixture provenance and evidence-index.json. `alloy-original/` is an earlier single non-trivial-tree witness, not a fresh whole-model verification run.

## Remaining boundaries and handoff

SC-1/SC-2/SC-9 rules and SC-OE-3 new-Date/performance negative cases are owned by checks. Parent owns realization/evidence navigation updates (no node writes authorized here). Consumer isolation/storage/clock/shared-source/uniqueness and every non-core real-operation obligation remain external. No real backend or OpenRouter action occurred.

All unique task assets are under this tmp/foundation directory. No process remains running from this task, and this agent releases the tree after handing it back. Preserve these assets before retiring the spoke; node_modules and dist are rebuildable.
