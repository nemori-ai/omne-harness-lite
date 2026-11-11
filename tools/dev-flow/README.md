# dev-flow

[中文说明](README_ZH.md)

Development flow tools. This member is not published.

- [integration](src/integration/README.md): `gate-cli.ts wait` waits for a gate run and approves it with a note of at most 1024 bytes in UTF-8. `pnpm run release-run --input FILE --journal PATH` dispatches and follows one package release workflow; see the [package release command](src/integration/README.md#包发布运行). `cli.ts contract-check` compares the contract snapshots with the built `dist` in `pnpm run check`. `pr-sections.ts` parses the「所含的卡」and「契约变化」sections of a PR body.
- `src/shared`: runs `gh` commands and judges JSON input for the integration commands.
- [package-exports](src/package-exports/README.md): compares the built entries of one member with its export inventory and its public-api page. Member tests run the `package-exports` CLI as a child process. Product source does not import it.
- The package template: see below.

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
