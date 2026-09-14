# Product package checks

This private development workspace member validates product packages against the
[workspace rules](../../docs/maintenance/workspace.md). It is not a runtime dependency.

`pnpm check` at the repository root builds and tests members, then runs this checker.
After building, `pnpm --filter @omne-harness-lite/package-checks check` runs it alone.
`pnpm --filter @omne-harness-lite/package-checks test` exercises negative boundary cases.

The checker discovers `packages/<family>/<leaf>`, validates source provenance and
public dependency edges (including declarations and type imports), rejects cycles,
packs every leaf, and installs each package with only its declared transitive product
artifacts in a separate directory outside the repository. Offline installation uses
the store prepared by the locked workspace install. Strict TypeScript compilation and
Node imports validate each leaf's public entry; shared fixtures additionally exercise
scope identity, ownership/disposal, Session/stream/file composition, native tools and
public declaration merging. Failure directories are retained and printed; successful
temporary consumers are removed. These checks do not establish target product conformance.

The fixed official archive comparison remains in the
[source audit](../../docs/proposals/core-capabilities/fork/evidence/check-sources.py).
