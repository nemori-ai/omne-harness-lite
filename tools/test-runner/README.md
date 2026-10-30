# test-runner

[中文说明](README_ZH.md)

The test runner plans member builds, type checks, tests and acceptance from the change set, runs them (member tests through turbo, acceptance member by member), and writes timing ledgers. It also runs differential mutation testing. The rules are in [`test-runs.config.json`](test-runs.config.json). This member is not published. It is removed after turbo takes over its work. `@omne-harness/repo-toolchain` defines the ledger read format in `core/test-ledger`; the clean loop and the health page read ledgers through it.

See the [Chinese guide](README_ZH.md) for the full plan rules, tiers, ledgers and mutation testing. This page lists the rules that narrow the plan, the lockfile rule and the admission tools. If this page and the Chinese guide differ, the Chinese guide is correct.

## Affected scope: rules that narrow the plan

The full rules are in the Chinese guide, section "影响面怎么算". The rules below make the plan smaller. They do not change two fixed limits:

1. A code change always runs the tests of its member and of the members that depend on it.
2. A file that no rule recognizes always makes the plan full.

The rules that narrow the plan:

- `.meta_harness/human/**` is a resident path. These pages are only Markdown for people. Only the resident check `check:docs` reads them. No member test, pytest or affected-scope rule reads them. A change to them runs only the resident checks.
- A Markdown file in a member root or in `apps/*/deploy/` (`memberDocuments`) is not a member change. turbo selects a package and all its dependents when any file in it changes. The plan removes from that selection the members that only a document change brought in. These are the member with only document changes, and its dependents that do not also depend on a member with a code change. The plan uses the turbo package graph (`turbo ls --filter=...<package>`) for this. If a member has document changes and code changes in the same change set, the plan selects it and its dependents. The plan output lists the removed members under "只改了文档、不选的成员". Before the plan removes members, it checks each member that turbo selected. That member must be a member with a code change, a member with only document changes, or a dependent of one of them. If turbo selected a member that the change set does not explain, turbo saw a change that the rules did not recognize. The plan is then full, and the reason names those members.
- A change to a member `SPEC.md` or `README.md` that no test reads runs only the resident checks.
- The reader rules in [`test-runs.config.json`](test-runs.config.json) name each document that tests read. A change to such a document selects only the members of that rule, without their dependents. If a test reads a member-root document and no reader rule names it, a change to it is not tested. Add a reader rule together with each new read of this kind.
- `tools/dev-flow/src/integration/**` is a dev-flow member file, not a global path. A change there runs the dev-flow tests. `scripts/check.sh` gets the baseline from `tools/test-runner` and does not run that code. `check:lines` imports `parse.ts` and `policy.ts` from it, and `check:lines` is a resident check that runs every time. No other tool member imports dev-flow.
- Member test results are cached per member and per tier in the main checkout's `tmp/test-cache/` (section "结果缓存" in the Chinese guide). The cache key uses the same `affected` rules as the plan: the inputs of a member are the files whose change selects it (global and unrecognized files, files that a reader rule names for it, its own files, the files of its upstream members from the turbo package graph). The key also contains the tier, the platform, the Node version and the environment variables in `cache.env`. Only a complete pass is cached. `FULL=1`, `--no-cache`, `OMNE_TEST_CACHE=0` and admission mode do not read the cache. A cache hit means that the same key passed once on this machine. It does not prove that an unstable test passes again.
- `pnpm-lock.yaml` is a global path, but it has an exception (`src/testing/lockfile-impact.ts`). If the lockfile is the only global file in the change set, the plan does not become full. The plan compares the base lockfile and the working tree lockfile, and maps each changed importer to its member. These members are seeds, the same as members with code changes, and the plan adds their dependents through the turbo package graph. The plan is still full, and the reason is in the output, in these cases:
  - A top-level key changed: `lockfileVersion`, `settings`, `overrides`, `patchedDependencies`, `catalogs` or another top-level key.
  - A dependency of the root importer (`.`, the tools of the whole repository) changed, directly or through other packages.
  - A lockfile does not parse, or it has a reference that the plan cannot explain: an importer that is not a member, a dependency on a missing snapshot, or a changed package that no importer depends on.
  - `tools/test-runner` is one of the mapped members or one of their dependents (the dependencies of the engine changed).
  - Another global file changed in the same change set. The plan does not use the mapping then.

  If the two lockfiles are equal after parsing, the lockfile selects no member. The plan line "锁文件：" shows the result of the mapping. `check:plan --json` writes the same text in `plan.lockfile`. The test result cache does not use this mapping: a lockfile change removes the cache entries of all members.
- `residentBuild` includes `packages/agent/agent`. `lint:deps` resolves the import of `dist/index.js` in its acceptance fixture `acceptance/fixtures/executor.mjs`. Without this build, a resident-only plan fails `lint:deps` on a checkout that has no earlier build output.

## Admission: run records, resume and evidence

The rules are in [the integration rules](../../docs/engineering/integration.md#检查责任), sections "增量准入" and "树相同时复用准入". The full description is in the Chinese guide, section "准入：运行记录、接续与证据核对".

**Run record** (`src/testing/admission-run.ts`, schemaVersion 1, `kind: admission-run`). Each `check` run writes a JSON record to `tmp/check-run/<short head>/run.json`. An admission run also writes the same record next to its admission log (`tmp/admission/<time>-<short head>.json`). The record contains the head, the tree hash, `dirty`, `admission`, the cache states, the exit code of each step and the step that failed first. `mode` is one of:

- `full`: all steps ran for all members. `base` is null.
- `affected`: the plan used the affected scope. `base` is the merge base of the baseline and the head (40 characters).
- `resume`: a resume run. `base` is H1. `resumeFrom` has the head and tree of H1, the step that failed, and the scope of the H1 run in `mode` (`full` or `affected`).

The record is written to a temporary name first and then renamed. A file that does not parse is not a record.

**`--resume-from <H1>`**. Use `pnpm run admission --resume-from <H1>` or `pnpm run check --admission --resume-from <H1>`. They are the same command. `--resume-from` is available only in admission mode (`--admission` or `OMNE_ADMISSION=1`). Without admission mode the command exits 2. You cannot use it with `FULL=1`.

H1 is a head where one admission run (full or affected) failed at one step X. After a fix, the command continues on HEAD. The resume scope is never wider than the scope of the H1 run:

- The resident steps run for the whole repository.
- X and the planned steps that did not run on H1 run again on HEAD with the H1 scope. If H1 was full, they run for all members. If H1 was affected, they run for the affected scope of HEAD relative to the baseline. The planned steps before them (`after`, transitive) also use this scope.
- The planned steps that passed on H1 run only for the members that H1..HEAD affects.

Reason: the affected scope of H1 (merge base..H1) together with the affected scope of H1..HEAD is the affected scope of HEAD (merge base..HEAD). Thus if H1 was affected, the `base` of its record must be equal to the merge base of the current baseline and HEAD.

The command exits 2 and writes nothing if a condition is false. Examples: the working tree has changes; H1 is not an ancestor of HEAD; H1 has no clean admission record with mode `full` or `affected`; H1 has only `resume` records (a resume run cannot be the start of a second resume); the tree does not match; the merge base is different; or a step other than X failed.

If H1..HEAD changes a global path, the command does not resume. It runs again on HEAD with the H1 scope and writes the reason. If the lockfile is the only global file, the lockfile rule above decides.

The admission log contains the evidence. If H1 was full: "H1 全量（失败于 X）＋ HEAD 增量（基线 H1）". If H1 was affected: "H1 影响面准入（失败于 X）＋ HEAD 增量（基线 H1）", and one more line with the baseline and the merge base. The log also lists each step with its scope and reason, the cache states of the H1 run and the files that H1..HEAD changed.

**`admission-evidence --for <F> [--record <path>]`** (`src/testing/admission-evidence.ts`). This command checks if F has a full admission that you can use. With `--record`, it checks only that record. Without it, it finds records in `tmp/admission/*.json` with the same tree as F. A record is accepted only if all of these are true: it is a schemaVersion 1 `admission-run`; `admission` is true; `mode` is `full`, or `mode` is `resume` and `resumeFrom.mode` is `full`; `dirty` is false; `failedStep` is null; every step ran and exited 0; `finishedAt` is set; its head is in this repository and its tree matches the head; and the tree is equal to the tree of F. A `resume` record of an affected H1 is not a full admission and the command rejects it. Exit codes: 0 accepted, 1 rejected, 2 usage error.

The records and logs are in the ignored `tmp/` directory. They are not evidence on another checkout or another machine.
