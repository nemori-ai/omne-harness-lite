# Product package checks

This private development workspace member validates product packages against the
[workspace rules](../../docs/maintenance/workspace.md). It is not a runtime dependency.

`pnpm check` at the repository root builds and tests members, then runs this checker.
After building, `pnpm --filter @omne-harness-lite/package-checks check` runs it alone.
From another directory, invoke `node src/check.mjs --root <repository>` with this
member's installed dependencies.
`pnpm --filter @omne-harness-lite/package-checks test` exercises negative boundary cases.

The checker discovers both `packages/<family>/<leaf>` and existing `apps/<app>`
members. A DSH-derived member keeps its upstream snapshots, original license and
`UPSTREAM.md`; it may expose `./baseline`, a default target entry, or both. A new
project-owned member reuses provenance format 1 with `files: []` and `project_files`
covering every active source, omits invented upstream identity, uses a default public
entry, and may remain `UNLICENSED` without copying a DSH license. Declaring another
license requires distributing its actual `LICENSE` file.

The checker validates provenance and public dependency edges (including declarations
and type imports), rejects cycles, packs every discovered member, and installs each
one with only its declared transitive product artifacts in an isolated consumer.
Every declared export must provide strict TypeScript declarations and a runnable ESM
entry in the tarball. A final consumer imports every selected member, including new
packages and applications; source-baseline behavior fixtures run only while all of
their explicit `./baseline` inputs remain published. Shared fixtures additionally exercise
scope identity, ownership/disposal, Session/stream/file composition, native tools and
public declaration merging. Failure directories are retained and printed; successful
temporary consumers are removed. These checks do not establish target product conformance.
Consumers live under the operating system temporary directory, outside the repository,
so Node and TypeScript cannot satisfy undeclared imports from an ancestor workspace
`node_modules` directory.

All isolated installs start with `--ignore-scripts --ignore-workspace`. The only
selective native build currently accepted is an exact `fs-ext@2.1.1` product edge,
listed as `fs-ext` in the root `pnpm.onlyBuiltDependencies` and present at that exact
version in the lock. A consumer whose selected closure needs it runs only
`pnpm rebuild fs-ext --pending --ignore-workspace --store-dir ...`, inheriting explicit
`CC` and `CXX`; the checker rejects missing compiler variables, other native build
names and version ranges. No compiler path is embedded here.

Application discovery is independent of the root command fan-out. When an app exists,
`pnpm-workspace.yaml` must include `apps/*`, and the root owner must extend build,
typecheck and test aggregation to apps before treating the root check as complete.

The fixed official archive comparison remains in the
[source audit](../../docs/proposals/core-capabilities/fork/evidence/check-sources.py).
