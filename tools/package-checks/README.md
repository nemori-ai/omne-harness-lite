# Product package checks

This private development workspace member validates product packages against the
[workspace rules](../../docs/maintenance/workspace.md). It is not a runtime dependency.

`pnpm check` at the repository root builds and tests members, then runs this checker.
After building, `pnpm --filter @omne-harness-lite/package-checks check` runs it alone.
From another directory, invoke `node src/check.mjs --root <repository>` with this
member's installed dependencies.
`pnpm --filter @omne-harness-lite/package-checks test` exercises negative boundary cases.

The checker discovers both `packages/<family>/<leaf>` and existing `apps/<app>`
members by their `package.json`. Design-only package/application directories are not
workspace members; a directory with `src`, `tests`, or `dist` but no manifest is rejected
rather than silently skipped. A DSH-derived member keeps its upstream snapshots, original license and
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
Consumers live under the operating system temporary directory. The checker resolves
both the repository and scratch directory to their real paths and rejects a temporary
directory inside the repository. It also rejects a scratch whose real-path ancestors
already contain a `node_modules` directory or symbolic link, including a sibling
worktree scratch below a shared main checkout. Rejected scratch directories are removed;
the existing ancestor is left untouched.

Type compilation and artifact runtime processes remove `NODE_PATH`, replace inherited
`NODE_OPTIONS` with `--no-global-search-paths`, and direct Node invocations also pass that
Node 24 flag explicitly. The scratch check covers the documented
[`node_modules` ancestor search](https://nodejs.org/download/release/v24.18.0/docs/api/modules.html#loading-from-node_modules-folders);
the child environment removes ambient preloads and disables the documented
[global folders](https://nodejs.org/download/release/v24.18.0/docs/api/modules.html#loading-from-the-global-folders).
Node documents the flag in its
[command-line API](https://nodejs.org/download/release/v24.18.0/docs/api/cli.html#--no-global-search-paths).
Other inherited environment, including explicit `CC`, `CXX`, and `GCC_EXEC_PREFIX`, remains
available.

All isolated installs start with `--ignore-scripts --ignore-workspace`. The only
selective native build currently accepted is an exact `fs-ext@2.1.1` product edge,
listed as `fs-ext` in the root `pnpm.onlyBuiltDependencies` and present at that exact
version in the lock with `nan@2.28.0`. A consumer whose selected closure needs it pins
that same `nan` closure and carries its own `onlyBuiltDependencies: ["fs-ext"]`, then runs only
`pnpm rebuild fs-ext --pending --ignore-workspace --store-dir ...`, inheriting explicit
`CC`, `CXX`, and `GCC_EXEC_PREFIX` while retaining the Node resolution isolation above.
After rebuild, a fresh Node process resolves from the installed real path of the product
package that declares `fs-ext`, loads the addon, checks `flock`, and verifies both native
dependency versions. Its PASS evidence includes the loaded `.node` real path and SHA-256;
rebuild exit 0 alone is only an intermediate observation. Consumers whose closure does not
contain `fs-ext` receive no native allowlist and run no rebuild or native probe. The checker
rejects missing compiler variables, other native build names and version ranges. No compiler
path is embedded here.

Application discovery is independent of the root command fan-out. When an app exists,
`pnpm-workspace.yaml` must include `apps/*`, and the root owner must extend build,
typecheck and test aggregation to apps before treating the root check as complete.

The fixed official archive comparison remains in the
[source audit](../../docs/proposals/core-capabilities/fork/evidence/check-sources.py).
