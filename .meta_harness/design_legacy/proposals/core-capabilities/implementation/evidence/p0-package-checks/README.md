# P0 package-checks verification evidence

This evidence records verification-developer results for A30 and the applicable
P0 portion of A31. It is implementation and verification evidence, not independent
review or final acceptance.

## Inputs and implementation

- Baseline: `e11cc6990c1354e7baf138cc2f501effc7b413f6`
- Implementation commit: `2000c27` (`test: classify package sources and public artifacts`)
- Branch/worktree: `impl/dsh-p0-package-checks` in `.worktrees/dsh-p0-package-checks`
- Scope hash: `95c54a993dab0f750d8c61321e0956353b1bd588b21e1ddc3f8d9a76ec799ddd`
- Acceptance hash: `adea462b2ae0de92c3b36831bb7044c27a894cd9b440d2e97b0c150b371e77ff`
- Implementation-spec hash: `84907b907c7a6460cc39bcba6cecf2399ec21f401f89054a75034eedaa32ab6d`
- Plan hash: `7e4aaae60b3f94ae8e5b8b303e0bfe28eb0276492ec336df80d3f523af44de49`
- Environment: Linux `5.15.0-1084-aws` x86_64, Node `v24.18.0`, pnpm `10.28.1`
- Preparation: `pnpm install --frozen-lockfile --ignore-scripts` in the spoke

The checker now discovers `packages/<family>/<leaf>` and real `apps/<app>`.
Existing DSH-derived members retain repository/commit/snapshot/license evidence;
project-owned members reuse provenance format 1 with empty `files`, explicit
`project_files`, no invented upstream identity, and a default export. Project-owned
members may use `license: "UNLICENSED"` without copying DeepSeek's license. Declared
licenses and DSH-derived packages must carry their actual `LICENSE`; DSH-derived
packages must also carry `UPSTREAM.md`.

Every discovered member is packed. Each member is installed with only its product
dependency closure and tarball overrides; a final consumer selects all members.
Generated imports cover every declared default/baseline entry. Existing behavior
composition fixtures run while their explicit baseline entries exist. No new member
is excluded from source, dependency, artifact, declaration, or runtime checks.

## RED observations

The inherited suite first passed unchanged:

```text
$ pnpm --filter @omne-harness-lite/package-checks test
tests 4; pass 4; fail 0; exit 0
```

Key behavior-first failures were observed before the corresponding implementation:

```text
RED member discovery, exit 1
Expected app/local-harness plus package/core/work-data.
Actual result contained only work-data and no member kind.

RED public entry classification, exit 1
TypeError: boundaryChecks.validateManifest is not a function

RED provenance classification, exit 1
TypeError: boundaryChecks.validateProvenance is not a function

RED packed declarations/default specifier, exit 1
TypeError: boundaryChecks.validatePackedArtifact is not a function

RED repository endpoint, exit 1
`check.mjs --root <fixture>` ignored --root and attempted to read the spoke's
packages/core/agent/dist instead of the two-member fixture.

RED license/source distinction, exit 1
The checker failed a valid UNLICENSED project-owned artifact for missing LICENSE,
and failed to reject a declared MIT package whose files omitted LICENSE.

RED selective native plan, exit 1
TypeError: boundaryChecks.nativeBuildPlan is not a function

RED actual pnpm lock spelling, exit 1
The first lock matcher accepted `fs-ext@2.1.1:` but rejected pnpm's quoted
`'fs-ext@2.1.1':` spelling.
```

The first strict DSH provenance implementation also found that the project
`upstream-baseline.json` is a selected source baseline rather than a complete archive
inventory: a valid agent-loop snapshot path is absent there. The checker therefore
cross-checks hashes for paths present in that baseline and leaves the fixed full
archive comparison with `fork/evidence/check-sources.py`, as the tool README already
specifies. It still rejects snapshot hash changes, false known-path mappings, missing
source targets, unmapped active sources, invented upstream identity on project-owned
packages, wrong DSH commit, and lost DSH license mapping.

Existing undeclared dependency and cross-package relative-import guards passed on
the first project-owned/default-export compliance test. This was recorded as reused
behavior evidence rather than manufacturing a false RED.

## GREEN results

Final checker tests, after the last source edit:

```text
$ pnpm --filter @omne-harness-lite/package-checks test
tests 11
pass 11
fail 0
duration_ms 13804.413895
exit 0
```

The integration test creates a real two-member pnpm workspace containing a
project-owned package and application, packs both, installs each closure outside
workspace resolution with scripts disabled, compiles declarations strictly, executes
the ESM entries, and consumes both together. Its measured subtest duration was
`13372.02485ms` in the final run.

Existing package source/provenance validation without writing product output:

```text
$ node --input-type=module -e '<validate all discovered manifests/provenance>'
PASS current manifests and provenance 14
exit 0
```

Syntax and patch checks:

```text
$ node --check tools/package-checks/src/boundaries.mjs
$ node --check tools/package-checks/src/check.mjs
$ node --check tools/package-checks/tests/boundaries.test.mjs
$ git diff --check
exit 0
```

Documentation checks using this task's fixed baseline:

```text
$ make docs-check BASELINE=e11cc6990c1354e7baf138cc2f501effc7b413f6
PASS: 393 Markdown files; requirement identities/dimensions, decision provenance,
skill mirrors, frozen versions and archive hashes.
NOTE: structural evidence checks do not establish the sufficiency of causal reasoning.
exit 0
```

## Existing 14-package tarball run

Product `dist/` output was not generated in unowned product paths. Instead, the
baseline packages, apps directory, lock/workspace inputs, selected DSH baseline and
implementation-commit checker were copied byte-for-byte into
`tmp/p0-package-checks/real-repo-rgUGEOAW`. All generated files remained in that
authorized ignored fixture.

```text
$ pnpm install --frozen-lockfile --ignore-scripts
Scope: all 16 workspace projects
Lockfile is up to date
Done in 694ms
exit 0

$ pnpm run build
Scope: 14 of 16 workspace projects
all 14 package builds: Done
exit 0

$ node tools/package-checks/src/check.mjs --root .
PASS: 14 product members, dependency boundaries, 94 upstream source records
PASS: isolated agent, 2 declared product artifact(s), strict declarations + runtime
PASS: isolated agent-loop, 7 declared product artifact(s), strict declarations + runtime
PASS: isolated brand, 1 declared product artifact(s), strict declarations + runtime
PASS: isolated jsonl, 1 declared product artifact(s), strict declarations + runtime
PASS: isolated llm, 4 declared product artifact(s), strict declarations + runtime
PASS: isolated media-content, 2 declared product artifact(s), strict declarations + runtime
PASS: isolated scope, 1 declared product artifact(s), strict declarations + runtime
PASS: isolated session, 6 declared product artifact(s), strict declarations + runtime
PASS: isolated session-persistence, 7 declared product artifact(s), strict declarations + runtime
PASS: isolated session-projection, 7 declared product artifact(s), strict declarations + runtime
PASS: isolated system-prompt, 6 declared product artifact(s), strict declarations + runtime
PASS: isolated timeout, 1 declared product artifact(s), strict declarations + runtime
PASS: isolated tools, 6 declared product artifact(s), strict declarations + runtime
PASS: isolated values, 1 declared product artifact(s), strict declarations + runtime
PASS: built source helpers, shared agent scope routing and owned store teardown
PASS: artifact LLM/Session/Loop/storage helpers and actual file I/O composition
PASS: artifact prompt/tool contribution, native call and withdrawal
PASS: isolated tarball consumer, ownership, dependency removal, factory removal and initiator
PASS: public Session/projection declaration merging, real fold and owner withdrawal
PASS: isolated composition, 14 declared product artifact(s), strict declarations + runtime
exit 0
```

## Selective native build boundary

The checker reads the standard root `pnpm.onlyBuiltDependencies` list and accepts
only `fs-ext`. A product edge must be exactly `fs-ext: "2.1.1"`, and the lock must
contain the exact release. Isolated consumers always install with
`--ignore-scripts --ignore-workspace`; only a selected closure containing that edge
runs:

```text
pnpm rebuild fs-ext --pending --ignore-workspace --store-dir <same-store>
```

That command inherits explicitly supplied `CC` and `CXX`; missing compiler variables,
other build names and version ranges fail before artifact work. This branch did not
contain fs-ext or its lock update, so the unit test verifies selection/rejection logic
only. The infrastructure probe owns the real Node 24/Linux compiler and load evidence;
the integrated root must rerun this checker with its accepted compiler environment.

## Coverage and integration requirements

- A30: verified member/app discovery, public-only imports, undeclared dependency and
  cross-source rejection, declared closure and cycle detection, source/license mapping,
  default and baseline export classification, complete packed declarations, all-member
  selection, isolated strict compilation, runtime import, and the existing 14-package
  composition fixtures.
- A31 P0: recorded behavior-first RED/GREEN for changed behavior, preserved a first-pass
  compliance result for reused import guards, and ran a final fixture plus existing
  artifact composition. No product or formal-spec behavior changed, so no TLA+/Alloy
  task was selected for this checker-only patch.
- The baseline has no real app. App discovery and tarball consumption were verified in
  the real temporary pnpm workspace; the future local-harness app still needs integrated
  root evidence.
- The root owner must add `apps/*` to `pnpm-workspace.yaml` when the first app lands and
  extend root build/typecheck/test fan-out beyond its current packages-only filter.
- The root owner must land the exact fs-ext declaration/lock and
  `pnpm.onlyBuiltDependencies: ["fs-ext"]`, then run install and this checker with the
  probe-approved explicit compiler environment. No GCC path is encoded in the tool.
- Fixed official archive download/comparison and real native fs-ext loading are separate
  evidence surfaces and are not claimed by this result.

## Post-review F1-F3 correction

Independent review of `effd764` found three A30 blockers. Commit `0587fa2`
(`fix: isolate package artifact consumers`) addresses all three without changing the
accepted manifest/provenance format or the native-support claim.

| Finding | RED observation | Correction and GREEN |
|---|---|---|
| F1: multiple exports reused one generated TypeScript binding | A real project-owned package was changed to publish `.` and `./baseline`; strict tsc reported `TS2300: Duplicate identifier 'm0'` on consumer lines 1 and 2. | The generator now increments one binding index per public entry. The same pack/install/tsc/runtime endpoint passed. |
| F2: repo-local scratch could borrow ancestor workspace dependencies | A fake `ancestor-only` package was loadable from the fixture repository. The original correction proved default `os.tmpdir()` isolation but did not cover an environment override that put `TMPDIR` inside the checked repository. | `createArtifactScratch(repo)` resolves both paths and rejects a scratch directory contained by the repository. The default external sandbox still rejects the undeclared import with `ERR_MODULE_NOT_FOUND`; `TMPDIR=<repo>/tmp` now fails with an explicit isolation diagnostic. |
| F3: DSH license metadata could disagree with the checked original | A DSH-identified derived manifest changed from MIT to Apache-2.0 and `validateManifest` did not reject it. | Manifests whose provenance repository is the fixed DeepSeek Harness source must declare MIT. The mismatch now fails while project-owned `UNLICENSED` and separately substantiated non-DSH licensing remain unaffected. |

Raw and source-linked evidence:

- `multi-export-red.log.gz` / `multi-export-green.log.gz`: F1 endpoint output.
- `f2-f3-red.log.gz`, `f3-dsh-license-red.log.gz`, and `f2-f3-green.log.gz`: F2/F3
  failure and correction output. The dedicated F3 log contains the final DSH repository
  identity in the fixture.
- `review-blockers-final-red.patch.gz`: final test-only F1-F3 change against reviewed
  commit `effd764`.
- `0001-fix-isolate-package-artifact-consumers.patch.gz`: `git format-patch` output for
  implementation commit `0587fa2`, including source, test and tool documentation.
- `review-blockers-full-green.log.gz`: complete 12-test result after the final source edit.
- `review-old14-prep.log.gz` / `review-old14-green.log.gz`: locked install, 14-package build,
  all 14 individual artifact consumers and the full existing composition after F1-F3.

The SHA-256 values below apply to the exact decompressed contents. The implementation
patch SHA-256 is
`1d75fe469fb2cae208c36ea78b7f80960779f3221885f94f103e63a17ca9c3f9`.
The full-suite log SHA-256 is
`ee7a6ed28fc04ddaff1b320c0b124249830641cdb2b56682b6a93e0606ab0f97`;
the current 14-package endpoint log SHA-256 is
`ddc6ea883fb9c91b0b16edeaf405a6b28fd5c8d88bad64420dd6ae9612bc1709`.

The earlier repo-local mirror run remains evidence for package behavior at `effd764`,
but it did not prove ancestor module isolation. The post-review run copied the source
and locked workspace to `/tmp/omne-package-check-real-61ITorls`; the checker then used
separate `/tmp/omne-package-artifacts-*` consumers. The default-path F2 control proved
that repository-only dependencies cannot resolve there. The follow-up below covers a
repository-local `TMPDIR` override. The fixture directory is rebuildable and is removed
after the tracked raw evidence is preserved.

### F2 `TMPDIR` containment follow-up

Independent follow-up review identified that `os.tmpdir()` follows `TMPDIR`; source
commit `0587fa2` therefore still created a consumer below the checked repository when
the environment set `TMPDIR=<repo>/tmp`. The test-only patch was applied on evidence
head `f0defde5b300763373529934897530508f79fd28`, whose checker source was unchanged from
`0587fa2`. Its real positive control loaded a repository-only `ancestor-only` module,
the default external scratch failed that import with `ERR_MODULE_NOT_FOUND`, and the
repository-local scratch incorrectly loaded it. The RED consequently failed with
`repo-internal TMPDIR allowed undeclared ancestor-only dependency to resolve`; it did
not fail because an API was absent.

Implementation commit `a41e9b3` (`fix: reject repository-local artifact scratch`)
passes the checked repository into the existing scratch constructor. After creation,
the constructor resolves both paths through `realpath`, removes the scratch and fails
with `artifact scratch must be outside repository` when the scratch is contained by
the repository. The default external positive/negative controls and the poisoned
`TMPDIR` rejection pass in the same test. All 12 package-check tests pass. Per the
follow-up review scope, the unchanged old-14 artifact endpoint was not rerun here and
remains for root integration acceptance.

Source-linked evidence added for this correction:

- `f2-tmpdir-red.patch.gz`: exact test-only diff against `f0defde`; decompressed
  SHA-256 `9a13f0918d6e56e213fc6258b0c889e93c3f26ca4fb94885b0f9bf4797d520f6`.
- `f2-tmpdir-red.log.gz`: targeted behavioral RED; decompressed SHA-256
  `4c946ffc821f88633009fe162279717b047385d7d2b811af1bb3c7110256f353`.
- `f2-tmpdir-green.log.gz`: targeted GREEN; decompressed SHA-256
  `d9528b0eb4a44fc42237a6f26ff832d909b91894bc73d3df512e8c97efb44513`.
- `f2-tmpdir-full-green.log.gz`: complete 12-test GREEN; decompressed SHA-256
  `38607d5e23e775ac54936709fc3960e6a3b2ecad8e1a552b5da109d8ed9e0c10`.
- `f2-tmpdir-static-green.log.gz`: syntax checks, 393-file documentation check and
  baseline diff check; decompressed SHA-256
  `ff651217bdedcde398e6feea423c9f575f8b147f12f44000f58c067012d9892b`.
- `0001-fix-reject-repository-local-artifact-scratch.patch.gz`: exact
  `git format-patch` for `a41e9b3`; decompressed SHA-256
  `1e5b2ba96203bffa920373cf95068cbb755e5b1fa93b736fd3d76a4b5db74999`.

Real native fs-ext loading remains outside this correction: no accepted product member
or lock in this branch contains fs-ext. The selective-build guard is unchanged, and the
integrated P1 root must supply the exact dependency, lock and explicit compiler environment
before that path can be reported as executed.

### F2 finite ambient-resolution closure

A final follow-up review identified a worktree-shaped case outside the repository
containment fixed by `a41e9b3`: `TMPDIR=<main-checkout>/tmp` is outside a checked spoke,
but Node can still walk from that scratch to the common main ancestor's `node_modules`.
The test-only matrix is based on evidence head `8842f63` and source commit `a41e9b3`.
Its synthetic main checkout contained `node_modules/ancestor-only` as a symbolic link;
the old scratch entry created a sibling consumer that loaded the linked package, and
the behavioral RED failed only after that import succeeded. A second real endpoint RED
showed an installed tarball runtime borrowing `global-only` from a controlled `NODE_PATH`.

Implementation commit `0d8c3b7` (`fix: close ambient artifact resolution paths`) applies
the finite boundary accepted by review:

| Matrix case | Observable result at `0d8c3b7` |
|---|---|
| Clean repository-external consumer with declared product edges | The real project-owned package/app tarball endpoint installs, compiles and runs each member and their composition. |
| Repository-local `TMPDIR`, direct and through a symbolic link | Both real paths are rejected, the newly-created scratch is removed, and the repository target remains untouched. |
| Sibling spoke scratch below a polluted common ancestor | Every real-path ancestor is checked for a directory or symbolic-link `node_modules`; the synthetic main checkout is rejected and the scratch is removed without changing the ancestor. |
| Clean external consumer missing an ESM, `createRequire`, or declaration dependency | Direct ESM and `createRequire` probes fail module resolution, and strict NodeNext declaration compilation reports `TS2307`. |
| Inherited Node resolution environment | A raw control loads through `NODE_PATH` and a preload control runs. Artifact type compilation and runtime remove `NODE_PATH`, replace inherited `NODE_OPTIONS` with `--no-global-search-paths`, and direct Node processes also pass the flag. Runtime `globalPaths` is empty; the corrected actual-process marker described below is absent. Explicit `CC` and `CXX` survive. |

The Node 24.18.0 command-line documentation defines
[`--no-global-search-paths`](https://nodejs.org/download/release/v24.18.0/docs/api/cli.html#--no-global-search-paths),
and the module documentation records both the
[`node_modules` ancestor walk](https://nodejs.org/download/release/v24.18.0/docs/api/modules.html#loading-from-node_modules-folders)
and [global folders](https://nodejs.org/download/release/v24.18.0/docs/api/modules.html#loading-from-the-global-folders).
This result covers the current direct Node and NodeNext/tsc artifact chain. It does not
claim containment against hostile loaders or a hostile host. The unchanged old-14
artifact endpoint and real native fs-ext loading were not rerun in this follow-up and
remain root integration work.

Source-linked evidence for the finite closure:

- `f2-ancestor-red.log.gz`: sibling worktree/common-ancestor behavioral RED;
  decompressed SHA-256
  `11033a7bb5d00a25b8377d9d0d138d1065fe112ba89bdb43f0e4790771fd80c5`.
- `f2-node-env-red.log.gz`: real tarball runtime `NODE_PATH` RED; decompressed
  SHA-256 `bbcd8010983415de3d59d4c5d8efa7d20de5cfe4f13dbde61125a6231d27be31`.
- `f2-isolation-matrix-red.patch.gz`: exact test-only matrix against `8842f63`;
  decompressed SHA-256
  `e4dbb4285b75df30114021e51473166436065bb118efe7d2e77e684e50b20c2d`.
- `f2-isolation-matrix-green.log.gz`: the three affected scenarios at `0d8c3b7`;
  decompressed SHA-256
  `5bd6eb39efbf7946a818f97405373aef0199e92dc3da0d2fddd2c995cc7febf3`.
- `f2-isolation-full-green.log.gz`: complete 13-test package-check suite;
  decompressed SHA-256
  `dd132aa6f6cd8d0aaa2a921170913fac8a1cb8856045c6a421443c672c4f779c`.
- `f2-isolation-static-green.log.gz`: syntax, 393-file documentation and baseline
  diff checks; decompressed SHA-256
  `ff651217bdedcde398e6feea423c9f575f8b147f12f44000f58c067012d9892b`.
- `0001-fix-close-ambient-artifact-resolution-paths.patch.gz`: exact
  `git format-patch` for `0d8c3b7`; decompressed SHA-256
  `c522ef44e365f53d41d757cb680e81eaa29e0e089b9d5034d4a25d75f8e76957`.

### Type-compiler preload measurement correction

Narrow review of `ca559ee` found that the preload fixture gated marker writes on
`cwd.includes('artifact-consumer-')`. That string is the generated package name, while
the actual consumer working directories are `local-harness`, `work-data`, and
`composition`. The production isolation in `0d8c3b7` was unchanged and review found no
production defect, but the earlier absence of a type-compiler marker did not establish
that inherited preloads were removed from actual `tsc` processes.

Fixture commit `703e547` (`test: target actual artifact preload processes`) identifies
the existing `pnpm exec tsc`, TypeScript binary, and artifact runtime arguments directly.
It also reports marker contents on failure. With the single production mutation that
removes `isolateModules` from the existing `tsc` run, the real tarball endpoint completed
and then failed on marker contents from all six relevant compiler processes: the pnpm
and TypeScript processes for `local-harness`, `work-data`, and `composition`. Restoring
the unchanged `0d8c3b7` production line removes the marker; the targeted endpoint and
complete 13-test suite pass. F1, F3, old-14 artifacts and native loading were not rerun.

Evidence for this measurement correction:

- `f2-tsc-preload-mutation.patch.gz`: exact one-line production mutation against
  `0d8c3b7`; decompressed SHA-256
  `cb5479639843716e8829121498df8d87d00740d2bcceae528394e408f1be0012`.
- `f2-tsc-preload-red.log.gz`: actual mutation RED with all six compiler process
  invocations; decompressed SHA-256
  `317985366923f6fa269513de65d453afbe7b0c92d448680d07869df22197099f`.
- `f2-tsc-preload-green.log.gz`: targeted restored-production GREEN; decompressed
  SHA-256 `189a2d8149c2ec335bc1c3df1e352b90d0a683a2402b838f6d4930246c3c63c1`.
- `f2-tsc-preload-full-green.log.gz`: complete 13-test GREEN; decompressed SHA-256
  `83aafa1dccc21d8f8123f494c0008665017bb85da14e54a801b4d5d27aace9bb`.
- `f2-tsc-preload-fixture.patch.gz`: exact measurement-only diff against `ca559ee`;
  decompressed SHA-256
  `64918d76ef7f3743579d167a6456b2dc3eac4fcb9ff4833ebf7a8721bd2a0220`.
