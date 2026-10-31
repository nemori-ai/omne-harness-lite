# dev-flow

[中文说明](README_ZH.md)

Development flow tools. This member is not published.

- [integration](src/integration/README.md): `start`, the task context, `status`, baselines and `task-sync`, which moves the target baseline forward after you merge the target branch. `@omne-harness/repo-toolchain` owns the read format of the task context in `core/task-context`; this member writes the context and validates all of it. `ri-notes` builds the two sections of a promotion PR from the unit records and PR bodies of one track. It only reads. It exits 1 when a contract finding refuses the promotion: a declared level above the cards, a breaking change off the integration track, or declarations that disagree with the snapshot difference. Other findings only report. For the integration node, `worktree-cli.ts` prepares a worktree for a dispatched attempt and regenerates agent projections (its `prepare-closures` subcommand builds the worktrees of several closures on one base), and `gate-cli.ts wait` waits for a gate run and approves it with a note of at most 1024 characters.
- [delivery](src/delivery/README.md): reads Issues and the project board and reports card shape, phase waits, dependency projections and card attribute findings. It also validates the line ownership table (`check:lines`) and syncs the attribute labels of one card. `change-scope-cli.ts` checks that the files a card changed stay in its write scope and its line, and that the snapshot changes of the contract members it changed stay within its declared contract change. `scripts/check.sh` runs it every time. Four commands support cards that run in parallel: `scope-cli.ts` intersects the write scopes of several cards and only reads, `milestone-cli.ts` creates milestones and moves cards between them, `board-cli.ts` writes the Project date, Line, Kind, Wave and Status fields of one card, and `dispatch-cli.ts` posts a dispatch comment and writes the binding back into the card. `baseline-cli.ts read` reads the contract baseline blocks in the comments of a baseline card, merges them by comment time and writes the file that `omne-contract-api --baseline` reads. It only sends GET requests.
- [delegate](src/delegate/README.md): `brief-check-cli.ts` checks a closure spec before dispatch. It reports missing sections, a descriptive write scope, paths and scripts that do not exist on the base commit, and callers that the write scope leaves out. It only reads.
- The package template: see below.

`pnpm run pre-admission --journal PATH` runs the existing pre-admission checks from the repository root. Each operation keeps separate logs and stops at the first failed check. See the [pre-admission command](src/delivery/README.md#预准入命令).

`pnpm run release-run --input FILE --journal PATH` dispatches and follows one package release workflow. It is separate from a milestone wave release. See the [package release command](src/integration/README.md#包发布运行).

- [package-exports](src/package-exports/README.md): compares the built entries of one member with its export inventory and its public-api page. Member tests run the `package-exports` CLI as a child process. Product source does not import it.

## Ordinary tasks

The [delivery observer](../dev-flow/src/delivery/README.md) reads an explicit Issue capture and reports known facts, deviations, and unknowns. It does not authorize dispatch or acceptance. The formal configuration remains disabled. Each task uses the ordinary protocol to define its identity, result, scope, and acceptance responsibility.

## Package scaffolding

The private `omne-package-template` CLI creates drafts and inventories exact template adoption. See the [template guide](../dev-flow/templates/package/README.md) and [development entry](../../docs/development.md#创建和整改产品包). It reuses the architecture reader. Structural results do not accept business or lifecycle behavior.

The package template is typescript-package@3.0.0 and creates the complete skeleton. Exact 2.0.0 and 1.0.0 rules remain available for older markers.
`service-contract` creation and structure scan no longer require `packages/core`.
`scan --json` reports judged edges on `dependencies`. `unknown` stays `unknown`.
Group direction is checked by dependency-cruiser through `pnpm run lint:deps` ([dependency rules](../repo-toolchain/README_ZH.md#依赖图与依赖规则)); there is no group layer table. A same-group import from `sdk` to `server-entry` violates `sdk-not-server` directly.
The later-implementer table and diagnostic shapes are in the [template guide](../dev-flow/templates/package/README.md#later-implementers).
`create-domain --group <name>` previews a package-domain@1.0.0 documentation draft. Add --write to create it.
`scan --group <name> --check` checks group structure. It is mutually exclusive with --member.
See the [group template](../dev-flow/templates/domain/README.md). Python documentation inventory separately checks bindings, sections and placeholders.

## GitHub delivery observation

The [delivery observer](../dev-flow/src/delivery/README.md) reads an explicit configuration and capture. It reports card shape, phase waits, native dependency projections, stock and changes. It does not authorize dispatch or acceptance, and it does not infer current product support.
