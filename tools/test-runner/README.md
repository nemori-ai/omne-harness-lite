# test-runner

[中文说明](README_ZH.md)

The test runner plans member builds, type checks, tests and acceptance from the change set, runs them (member tests through turbo, acceptance member by member), and writes timing ledgers. It also runs differential mutation testing. The rules are in [`test-runs.config.json`](test-runs.config.json). This member is not published. It is removed after turbo takes over its work. `@omne-harness/repo-toolchain` defines the ledger read format in `core/test-ledger`; the clean loop and the health page read ledgers through it.

See the [Chinese guide](README_ZH.md) for the full plan rules, tiers, ledgers and mutation testing. This page lists only the rules that narrow the plan.

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
- `residentBuild` includes `packages/agent/agent`. `lint:deps` resolves the import of `dist/index.js` in its acceptance fixture `acceptance/fixtures/executor.mjs`. Without this build, a resident-only plan fails `lint:deps` on a checkout that has no earlier build output.
