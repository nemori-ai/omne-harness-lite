# repo-toolchain

[中文说明](README_ZH.md)

`@omne-harness/repo-toolchain` is this repository's checker package. It is published on npm. It provides the rule engine, commit attribution, the dependency graph, declaration compatibility, structure metrics, actual architecture extraction, the review page and the clean loop. The repository pins its exact version in the catalog of `pnpm-workspace.yaml`. The root checks and the three tool members run that version from npm, not the sources in this directory. After a change here, publish a new version first, then open a PR that changes the pin. See the [development guide](../../docs/development.md#仓库工具链的版本).

Three unpublished tool members import this package through its subpaths. This package does not import them:

- [dev-flow](../dev-flow/README.md): dispatch admission, task binding, Issue and board reads, the package template.
- [product-checks](../product-checks/README.md): the product rules, acceptance coverage declarations and scenario status of this repository.
- [test-runner](../test-runner/README.md): change-set plans, member tests, timing ledgers and differential mutation testing.

## Repository roots and configuration

- The checked repository is `OMNE_SUBJECT_ROOT`. When it is not set, it is the Git root of the current directory.
- The runner repository is `OMNE_RUNNER_ROOT`. When it is not set, it is the checked repository. Dependency rules (`.dependency-cruiser.cjs`, `tsconfig.base.json`) and configuration come only from the runner repository, so a checked tree cannot change them.
- Configuration is in [`repo-toolchain.config.json`](../../repo-toolchain.config.json) at the repository root, in the sections `loop`, `metrics` and `acceptanceLock`. A missing file, a missing section or an unknown section is an error. No defaults apply.
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
| `omne-deps` | `src/deps/cli.ts` | Dependency rules, and cycles between members and groups |
| `omne-declarations` | `src/declarations/cli.ts` | Reads member `dist` declarations with TypeScript 6 |
| `omne-metrics` | `src/metrics/cli.ts` | Structure metrics and the review page |
| `omne-loop-status` | `src/loop/cli.ts` | Clean loop status |
| `omne-loop-health` | `src/loop/health-cli.ts` | Process health page |
| `omne-acceptance-lock` | `src/acceptance/cli.ts` | Acceptance lock. A `README.md` or `index.md` under `acceptance/` that still has the documentation placeholder line is a template placeholder and does not count as an acceptance change |
| `omne-architecture` | `src/arch/cli.ts` | Actual architecture JSON |

The actual architecture extraction reads only the files of one revision. A package-name `extends` (for example `@omne-harness/repo-config/tsconfig.base.json`) points at an installed module. The extraction does not apply its options and lists it under `configuration.installedExtends` as `<config file> -> <specifier>`.

`pnpm run check:design` checks current design sources, domain objects, and generated inputs. `pnpm run loop:health` reports trends, test timings, and Git history.

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
Schema 2 source paths start at repository root. Referenced files and Markdown anchors are read at the same version.
IC-1 and IC-5 use adopted roles and actual public exports. Directory names grant no exception.
A missing current or BASE input remains unknown or no-data. Current deletion still reports its semantic change.
Changes to cited Markdown also trigger the hook. See the [conformance contract](src/arch/CONFORMANCE.md).
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

The artifact contains only the fixed [D010 decision](https://github.com/nemori-ai/omne-harness-lite/issues/638#issuecomment-6367449357).
It covers commit `48ad37d292796326d65055a75e8a1fde44fe4233` and `packages/agent/agent/acceptance/README.md`.
The tool checks real Git objects, one parent, exact blobs, and all bytes from `git diff --no-ext-diff --no-textconv --no-color --binary -U3 --src-prefix=a/ --dst-prefix=b/ --text`.
The call fixes `core.abbrev=8`, `diff.noprefix=false`, `diff.mnemonicPrefix=false`, `diff.algorithm=myers`, `diff.indentHeuristic=true`, `diff.context=3`, `diff.interHunkContext=0`, `diff.suppressBlankEmpty=false`, `diff.srcPrefix=a/`, `diff.dstPrefix=b/`, and `core.attributesFile=/dev/null`, and removes `GIT_DIFF_OPTS` from its environment. Repository size and these settings do not change the bytes.
Known limits: a diff driver or `binary` attribute in `info/attributes` or in a tracked `.gitattributes`, and an object prefix collision, change the bytes. D010 then does not receive approval. These cases fail as a rejection, never as a false approval.
Ordinary documents in that historical commit do not prevent approval. An additional protected path cannot receive this approval.
Uncommitted edits, future developer commits, and fingerprint or decision mismatches still fail.
Git read failures remain tool errors. Configuration, environment variables, arguments, and supplied URLs cannot authorize changes.
No runtime GitHub request is required. Adoption trusts the reviewed artifact and its npm integrity.
Source tests alone do not establish that consumers installed the release.

Regression tests are in `tests/acceptance-lock.spec.ts` and `tests/loop-strict.spec.ts`.
The real history cases require this repository's D010 Git objects.
