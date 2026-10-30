# repo-toolchain

[中文说明](README_ZH.md)

`@omne-harness/repo-toolchain` is this repository's checker package. It is published on npm. It provides the rule engine, commit attribution, the dependency graph, declaration compatibility, contract API snapshots, structure metrics, actual architecture extraction, the review page and the clean loop. The repository pins its exact version in the catalog of `pnpm-workspace.yaml`. The root checks and the three tool members run that version from npm, not the sources in this directory. After a change here, publish a new version first, then open a PR that changes the pin. See the [development guide](../../docs/development.md#仓库工具链的版本).

Three unpublished tool members import this package through its subpaths. This package does not import them:

- [dev-flow](../dev-flow/README.md): dispatch admission, task binding, Issue and board reads, the package template.
- [product-checks](../product-checks/README.md): the product rules, acceptance coverage declarations and scenario status of this repository.
- [test-runner](../test-runner/README.md): change-set plans, member tests, timing ledgers and differential mutation testing.

## Repository roots and configuration

- The checked repository is `OMNE_SUBJECT_ROOT`. When it is not set, it is the Git root of the current directory.
- The runner repository is `OMNE_RUNNER_ROOT`. When it is not set, it is the checked repository. Dependency rules (`.dependency-cruiser.cjs`, `tsconfig.base.json`), the direction rows of `docs/architecture/constraints.json` (schema 3, see the [conformance contract](src/arch/CONFORMANCE.md#方向行) and [Dependency directions](#dependency-directions)) and configuration come only from the runner repository, so a checked tree cannot change them.
- Configuration is in [`repo-toolchain.config.json`](../../repo-toolchain.config.json) at the repository root, in the sections `loop`, `metrics`, `acceptanceLock` and `contractApi`. Each command reads only its own section. A missing file, a missing section that a command reads, or an unknown section is an error. No defaults apply. Version 0.0.10 is the first version that accepts the `contractApi` section. Earlier versions reject it.
- dependency-cruiser needs TypeScript to parse `.ts` files. With pnpm, add `typescript` to dependency-cruiser under `packageExtensions` in `pnpm-workspace.yaml`. If TypeScript is not found, the dependency check exits with an error. It does not pass with the `.ts` files left out.

## Default baseline

`resolveBaseline(root, explicitBase?, env?)` in `core/task-context` is the one default-baseline rule. It takes the first of: the explicit base (`--base`, else the `BASELINE` variable; an empty string is not given), the fixed `targetBase` of the task context, `origin/main`, `main`. A bound tree accepts an explicit base only when it equals `targetBase`, and otherwise throws `stale`. The result carries `source`: `explicit`, `task`, `origin/main` or `main`. `baselines` is unchanged and does not apply a default.

## Build and test

```sh
pnpm --filter @omne-harness/repo-toolchain build      # tsc, then prebuild the review page's third-party code into dist
pnpm --filter @omne-harness/repo-toolchain typecheck
pnpm --filter @omne-harness/repo-toolchain test
```

The build writes the React, @xyflow/react, antd and elkjs code that the review page inlines to `dist/report/flow/architecture/page-assets.json`. A run from `dist` reads that file. A run from the sources bundles at page generation. The published package therefore does not depend on these UI libraries.

## Public entries

The `exports` subpaths map to modules under `src`, for example `@omne-harness/repo-toolchain/core/task-context`. `.` exports the rule types, `collectSources`, `runRules(files, rules)` and the actual architecture API. `./architecture` exports the actual architecture API. `loop/run`, `loop/hook-measure` and `loop/sensors/*` exist for the tests of the other tool members in this repository and carry no public promise. The published manifest drops the `source` condition, which points at `src`.

The commands (`bin`) point at `dist`. Run them from the installed package:

| Command | Source entry | Purpose |
| --- | --- | --- |
| `omne-deps` | `src/deps/cli.ts` | Dependency rules, the direction rows of `constraints.json`, and cycles between members and groups |
| `omne-declarations` | `src/declarations/cli.ts` | Reads member `dist` declarations with TypeScript 6 |
| `omne-contract-api` | `src/declarations/api-cli.ts` | Contract API snapshots: write, check, and a coarse class of the change against a base |
| `omne-metrics` | `src/metrics/cli.ts` | Structure metrics and the review page |
| `omne-loop-status` | `src/loop/cli.ts` | Clean loop status |
| `omne-loop-health` | `src/loop/health-cli.ts` | Process health page |
| `omne-acceptance-lock` | `src/acceptance/cli.ts` | Acceptance lock. A `README.md` or `index.md` under `acceptance/` that still has the documentation placeholder line is a template placeholder and does not count as an acceptance change |
| `omne-architecture` | `src/arch/cli.ts` | Actual architecture JSON |

The actual architecture extraction reads only the files of one revision. A package-name `extends` (for example `@omne-harness/repo-config/tsconfig.base.json`) points at an installed module. The extraction does not apply its options and lists it under `configuration.installedExtends` as `<config file> -> <specifier>`.

`pnpm run check:design` checks current design sources, domain objects, and generated inputs. `pnpm run loop:health` reports trends, test timings, and Git history.

## Dependency directions

Version 0.0.12 is the first version in which `omne-deps` checks the direction rows of `constraints.json`. The rows and the roles come only from the runner repository. `--root` changes only the checked tree.

- A hit is a resolved import whose file matches the `paths` of a `from` role of a row (the match uses `paths` only, not the most precise role; validation already rejects a referenced role whose `paths` equal or contain the `paths` of another role) and whose resolved target file is in the member of a `to` role. Type imports, `export … from` (including `export *` and `export { x } from`), dynamic `import()`, package subpaths, tsconfig aliases and relative paths are judged by the resolved target. A target in `src/`, `dist/` or a declaration file is the same member. An unresolved import is not a hit; `no-unresolvable` reports it.
- Each hit is one `direction-rule` finding with the row id, the source file, the target file, the source role, the target role, the cited source and the import line. When a `from` role or a `to` role of a row matches no file in the checked tree, the command reports one `direction-unknown` finding that names the row, the side and the role. A renamed or moved source member or target member does not pass with zero hits.
- Any `direction-rule` or `direction-unknown` finding exits 1. The other findings and exit codes keep their meaning.
- The summary line prints the number of rows, member pairs and hits, and the number of roles without files when there are any.
- No direction rows: when the runner has no `constraints.json`, the command prints that it did not check directions, and the exit code comes from the other findings. A schema 1 or 2 file, or a schema 3 file without `directions`, prints that there are no direction rows.
- Exit 2: `constraints.json` does not parse, fails validation, fails the check of its cited sources, or `docs/architecture/constraints.json` and `.meta_harness/design/architecture/constraints.json` both exist. The command reads the file before it runs dependency-cruiser.

## Group cycle exceptions

A cycle between groups fails by default. When an owner rules that a specific chain of dependencies is correct, the runner repository records its member edges in `groupCycleExceptions` of its schema 3 `constraints.json`. Each entry has an id, a list of member edges (`from` and `to` are member paths), an https link to the ruling, and a one-line reason. An exception allows the listed edges only. The field format is in [the conformance contract](src/arch/CONFORMANCE.md#组环例外). The command reads exceptions only from the runner repository. An exception in the checked tree has no effect. Exceptions take effect from repo-toolchain 0.0.16.

- A group cycle is allowed only when every cross-group member edge in it is listed by an exception. The command then prints one `excepted` line with the groups, the exception id, the ruling link, the allowed edges and the reason, and the cycle does not fail. If one edge is not listed, the cycle fails as before. The message ends with the edges that are not listed, and the machine-readable `edges` of the finding stay the full list of edges in the cycle. A new member edge between the same groups, which no exception lists, therefore always makes the cycle fail.
- Each listed edge must appear in a group cycle, whether or not that cycle is allowed. An exception with an edge that does not appear (the edge was removed, the cycle is gone, or the edge is not in the cycle) is an `unused-group-cycle-exception` finding and exits 1. The `edges` of that finding are the edges that did not appear. This is judged only when the checked tree is the runner repository itself (both roots resolve to the same directory). When the checked tree is another tree (`OMNE_RUNNER_ROOT` points elsewhere), exceptions still allow the cycles they list, but an unused exception is not reported: the exception is recorded in the runner tree, so the cycles of the checked tree cannot show that it is out of date. `omne-deps`, `omne-loop-status` and the stop hook use the same judgement.
- Exceptions do not apply to cycles between members, to file cycles, or to other rules.
- When at least one group cycle is allowed, the last line of the summary ends with `<n> 个组环按具名例外放行` (`<n>` group cycles allowed by named exceptions).
- The hard lines of `omne-loop-status` and of the stop hook read the same exceptions. An excepted group cycle is not a hard line. The status lists it under the cycle line and keeps it in `hardLines.exceptedCycles` of `status.json`. An unused exception is a cycle hard line. When the `constraints.json` of the runner is not valid, `omne-loop-status` exits 2 as a tool error.
- `omne-metrics` and the architecture report do not read exceptions. They still list an excepted group cycle as a cycle.

## Contract API snapshots

`omne-contract-api` keeps one API snapshot file for each contract member. The contract members are the `contracts` entries of `docs/engineering/delivery-lines.json`. The behavior contract is in the [SPEC](src/declarations/SPEC.md).

- `--write` writes the snapshots from `dist`. It does not write a member that has no `dist`, incomplete declarations or compile diagnostics.
- `--check` compares each snapshot file with a snapshot that it makes from `dist` now, and reports each difference. With `--json`, it gives the SHA-256 of each snapshot file. The snapshot digest is this SHA-256 of the file bytes.
- `--diff <base>` compares the snapshot files at a base commit with the snapshot files in the working tree. It gives `none`, `additive` or `review` for each member and reports which side a change breaks. It reads only the snapshot files, not `dist`, so run `--check` first. The member list is the union of the contract lists at the base and now. A member without a snapshot at the base counts as `additive`. To decide whether a change is additive, give the milestone baseline commit.
- `--baseline-write <commit> [--milestone <name>] [--member <member>]...` makes the machine-readable block of a milestone baseline registration. The block is a `json omne-contract-baseline:v1` fence. For each member it records `path`, `commit`, the snapshot `sha256` and `apiTree` (the tree ID of `<commit>:<member>/api`). With `--member`, it writes only the given members. The baseline file is not committed. The block goes into the registration comment.
- `--baseline <file>` reads a block (a JSON object, or a text with exactly one block) and compares each member from its own `commit` to the working tree snapshot. The rules are the rules of `--diff`. A member added after the baseline counts as a whole addition. The command cannot judge two kinds of member, and then it exits 1 even with `breakingCards`: a registered member that is not a contract member or has no snapshot at its `commit`, and an unregistered member that was a contract member at the base point (the common ancestor of all registered commits). Otherwise a `review` result without `breakingCards` exits 1. A registered `sha256` or `apiTree` that differs from its commit is only reported.
- `--check` and `--diff` only report and exit 0. `--write` exits 1 when it cannot write a member. Errors exit 2.

A snapshot has two parts: the names that each entry exports, and every declaration file of the member's `dist`, normalized by the TypeScript printer. The declaration files keep their imports, exports and module augmentations, so a snapshot can be restored to declarations that compile.

The class is a whitelist gate. Differences fall into two buckets. Any difference in global scope makes the whole member `review` without running the checker: a `declare global` block or a `declare module` block for an external module that is added, removed or changed; a script file (a `.d.ts` without imports or exports) that is added, removed, changed or switched to a module; any triple-slash directive difference; an added or removed import or `export … from` edge (bound, type-only, empty and side-effect imports all count); an added, removed or renamed `export as namespace`. A consumer's program has one global scope, so the checker cannot prove that such a change leaves existing exports untouched. In module scope a change is `additive` only with two pieces of positive evidence. First, every difference is in the whitelist. The whitelist has two kinds of change: a new export that introduces a name the old side does not know (a declaration that merges with an existing one, such as a new overload, does not count; nor does a name that an entry already exports or that resolves to an existing symbol in the file's scope, such as a local `Error` shadowing the lib's), and a new optional property (property syntax) in a module-scope interface or type literal (a change inside an augmentation of the member's own module does not count). Second, the TypeScript checker proves assignability in two directions for each export that the change touches. New to old shows that existing readers still accept the new value. Old to new shows that existing writers (providers, doubles and implementers) still produce an accepted value. Everything else is `review`, and the report names the rule: a global-scope change, a change outside the whitelist, no comparison covers the export, a direction fails, the checker did not finish, too many instance combinations, or compile diagnostics. The tool uses `@typescript/typescript6`, which repo-toolchain already depends on. It adds no new dependency.

The tool does not use API Extractor, because API Extractor does not analyze ambient declarations. It drops every `declare module` and `declare global` augmentation, and the public surface of 8 of the 27 contract members contains such augmentations.

The `contractApi` configuration section has two keys. `members` is the path of the line table. `snapshot` is the snapshot path template. It ends with `.md` and contains `{member}` or `{package}`. Any other key, a missing key or a bad value is an error.

`review` means that a person must decide. It includes changes that break the writer, the reader or both. It also includes changes that the additive-change table allows but that are outside the whitelist. Examples are a new member of a union that the contract declares open, and a new default for a type parameter. `review` is not a level for the "契约变化" section of a PR. A person decides that level (none, additive or breaking) from the additive-change table in `docs/engineering/integration.md`.

The tool reads only the shape of the declarations. It does not read behavior, documentation or runtime validation. It reports which side breaks, but it does not decide whether that break is acceptable. The gate fails closed: when the evidence is not complete, the result is `review`. So `review` results are more frequent than with the checker alone. This is a deliberate trade-off for the report-only stage. A snapshot that matches `dist` shows only that the snapshot is current. It does not show that a change is additive. See the SPEC for the known limits, including the recursion heuristic that puts additive changes to types like `ToolBindings` into `review`.

A card that changes the public surface of a contract member runs `--write` in the same PR. When the snapshot format version changes, all snapshots must be made again. See the Chinese README section "契约 API 快照" for the operating rules.

## Stop-hook revision reads

The Stop hook recalculates its baseline on each invocation. With a task context it uses `taskBase`. Without one it uses the nearest merge base among `primaryBranch` and the active tracks in `integration-policy.json`. See the Chinese README section "收工钩子" for the exact rules.
The global architecture reader resolves that base to a fixed commit and batches its selected source and intent blobs.
They use byte lengths for UTF-8 content and preserve literal paths, empty files and read failures.
No measurements persist across commits. Source ownership uses the longest member prefix and one inventory traversal.

Synchronizing the primary branch can remove delivered changes from the current difference.
For a task-wide report, run `pnpm run loop:status --base <task-start-commit>` with a fixed task anchor.
That explicit base does not change the automatic hook's base. The internal 40-second limit and host error protocol remain unchanged.

## Actual assembly observations

The clean loop reads complete current and BASE sources through `sensors.architecture`.
Global expectations belong to `docs/architecture/constraints.json`.
Each version discovers its own current or historical input. Duplicate owners and invalid source references fail.
Schema 2 and 3 source paths start at repository root. Referenced files and Markdown anchors are read at the same version.
IC-1 and IC-5 use adopted roles and actual public exports. Directory names grant no exception.
A missing current or BASE input remains unknown or no-data. Current deletion still reports its semantic change.
Changes to cited Markdown also trigger the hook. See the [conformance contract](src/arch/CONFORMANCE.md).
The conformance report has [direction rows](src/arch/CONFORMANCE.md#方向行). The rows and the roles come from the runner repository's `constraints.json`, the same file that `omne-deps` reads. The dependency facts come from the dependency graph of the reported version. When no role that the direction rows reference has a file in that version, the report does not take the graph, and each row is unknown with the same text as with the graph. The [conformance contract](src/arch/CONFORMANCE.md#方向行) gives the rule. When the graph is taken but is not available, the rows are unknown. When the graph of the baseline is not available, the report does not mark deviations as new or stock, and each row gives the reason. A direction deviation is reported in the loop. It is not a hard line.
It reports static conformance separately from added, removed and changed assembly facts.
Fact counts are neutral. They have no thresholds or trend comparison.

Identity excludes source positions and uses JSON tuples, so delimiter names do not collide.
Metadata changes retain contract, owner and shape values before and after the change.
A dynamic injection remains unknown. A static fact that disappears does not prove runtime release.
A missing current expectation produces no-data and fails the enabled strict sensor.
No BASE means no difference reading. Neither case becomes zero.

The extractor does not prove lifecycle, authorization, isolation or shared commits.
Public services, member SPEC files and behavior verification own those obligations.
Tests cover source moves, injection additions, metadata changes, collisions, unknowns and missing inputs.
See [the full configuration and output description](README_ZH.md#实际装配与全局架构约束).


## Exact historical acceptance approvals

The acceptance lock preserves original role violations in `LockReport.violations` and `commits[].allowed`.
`approvedExceptions` lists approved historical changes with their complete commit, parent, path, old and new blobs, diff SHA-256, and decision URL.
`unresolvedViolations` lists the remaining findings. The acceptance CLI returns 1 for these findings and 2 for tool errors.
Loop keeps each full report in `auditRanges[].acceptance`. Its acceptance hard line contains only unresolved findings.
Both text reports show original violations and approvals. Other Loop hard lines still apply.

The artifact contains a read-only list of fixed decisions in `src/acceptance/historical-approvals.data.ts`. The checker in `src/acceptance/historical-approvals.ts` reads only this list.
Each entry covers one commit and one protected path. A commit with more protected paths has one entry for each path.
The [D010 decision](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357) covers commit `48ad37d292796326d65055a75e8a1fde44fe4233` and `packages/agent/agent/acceptance/README.md`.
The [#769 decision](https://github.com/nemori-ai/omne-harness-lite/issues/769#issuecomment-6411908205) covers 27 paths in commits `19f457a15`, `9f3967cc5`, `69bdedfab`, `837d333fd`, `14b0fcfcb` and `06acd53ca`.
Without a task context, the lock compares a merge commit with each parent (`-m`) and lists each path that differs from one parent. With a task context it uses `--cc`, which lists only paths that differ from all parents. A clean merge then lists no paths. The six #769 commits contain four such merges.
One `git log --name-only` call reads the paths of all commits in the range. It lists the same paths as one `git diff-tree --no-commit-id --name-only --no-renames -r` call for each commit. The call fixes `log.diffMerges=separate`, so user configuration cannot change `-m` to the first parent only. It fixes `log.showRoot=false`, so a root commit lists no paths, as `diff-tree` does without `--root`. It also adds `--no-show-signature`.
By registration convention, a merge entry names the one parent where the path changed. The tool does not check this convention. It checks only that the named parent is one of the parents of the commit.
The tool checks real Git objects, that the named parent is a parent of the commit, exact blobs, and all bytes from `git diff --no-ext-diff --no-textconv --no-color --binary -U3 --src-prefix=a/ --dst-prefix=b/ --text`.
For a path that does not exist on one side, the blob is the Git null object ID (40 zeros), as `git diff --raw` shows it. The tool then checks that the tree has no such path.
The call fixes `core.abbrev=8`, `diff.noprefix=false`, `diff.mnemonicPrefix=false`, `diff.algorithm=myers`, `diff.indentHeuristic=true`, `diff.context=3`, `diff.interHunkContext=0`, `diff.suppressBlankEmpty=false`, `diff.srcPrefix=a/`, `diff.dstPrefix=b/`, `core.attributesFile=/dev/null`, and `attr.tree` (the empty tree). It removes `GIT_DIFF_OPTS` and `GIT_ATTR_SOURCE` from its environment and sets `GIT_ATTR_NOSYSTEM=1`. Repository size and these settings do not change the bytes.
Known limits: a funcname, xfuncname or `binary` attribute in `info/attributes`, a `.gitattributes` file in the worktree on Git older than 2.43, and an object prefix collision change the bytes. The entry then does not receive approval. These cases fail as a rejection, never as a false approval.
Ordinary documents in a historical commit do not prevent approval. The protected paths that the lock lists for a commit must be exactly the paths registered for that commit. One more or one less path gives no approval for that commit.
When the path sets are equal but the fingerprint of one entry does not match, only that entry gets no approval. The other entries of the commit are approved. The path of the failed entry stays an unresolved violation, so the CLI still exits 1.
Uncommitted edits, future developer commits, and fingerprint or decision mismatches still fail.
Git read failures remain tool errors. Configuration, environment variables, arguments, and supplied URLs cannot authorize changes.
No runtime GitHub request is required. Adoption trusts the reviewed artifact and its npm integrity.
Source tests alone do not establish that consumers installed the release.

Regression tests are in `tests/acceptance-lock.spec.ts` and `tests/loop-strict.spec.ts`.
The real history cases require the Git objects of the registered commits in this repository.
