# dev-flow

[中文说明](README_ZH.md)

Development flow tools. This member is not published.

- [integration](src/integration/README.md): `start`, the task context, `status`, baselines and `task-sync`, which moves the target baseline forward after you merge the target branch. `@omne-harness/repo-toolchain` owns the read format of the task context in `core/task-context`; this member writes the context and validates all of it.
- [delivery](src/delivery/README.md): reads Issues and the project board and reports card shape, phase waits, dependency projections and card attribute findings. It also validates the line ownership table (`check:lines`) and syncs the attribute labels of one card.
- The package template: see below.

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
