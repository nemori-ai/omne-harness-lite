# TypeScript package template

This directory owns `typescript-package@4.0.0`. It is a development resource, not a workspace product member.
Public interfaces, behavior and acceptance remain with their existing owners.
The required member shape is [package organization](../../../../docs/package-organization.md#成员的必选结构).

## Create and inspect

Run from the repository root:

```sh
pnpm package:template create --group identity --name authorization --variant service-contract
pnpm package:template create --group identity --name authorization --variant service-contract --write
pnpm package:template create --group access --name public-contract --variant module --write
pnpm package:template scan --json
pnpm package:template scan --member packages/identity/authorization --json
```

Creation previews by default. `--write` refuses existing targets and symlinks.
It validates inputs before writing and removes its incomplete new package on failure.
It does not install dependencies or execute package code. Use a trusted checkout without concurrent directory replacement.

The result reports its template identity, version and variant. A generated draft has **no adoption marker**.
`src/index.ts` and `src/cordis.ts` contain `PACKAGE_TEMPLATE_DRAFT`. Complete accepted interfaces, behavior and real verification before removing it.
Creation does not generate fictitious services or passing placeholder tests.

## Generated files

Creation writes six files, plus two for binding variants. It writes no Markdown and no documentation registration.

```text
packages/<group>/<name>/
├── package.json
├── tsconfig.build.json
├── tsconfig.test.json
├── vitest.config.ts
├── src/index.ts           src/cordis.ts for binding variants only
└── tests/public-entry.spec.ts   tests/cordis-entry.spec.ts for binding variants only
```

The generated `package.json` has a `build` script that deletes `dist` first, the `source` export condition before `types`, `"files": ["dist"]`, and three test scripts: `test`, `test:fast` and `test:slow`.
The vitest mode selects the tier. These scripts do not build. From the repository root, run `pnpm turbo run test --filter=<package name>`. Turbo builds the member and its dependencies first.
`tsconfig.build.json` sets `erasableSyntaxOnly`. Published packages omit `source`.
`tests/public-entry.spec.ts` imports the package name and checks the current public exports.
Add integration only for a package that implements storage or an application service, and an end-to-end test only for the owner of a key user journey. See [package test duty](../../../../docs/verification.md#包级测试责任与边界).

## Resources and variants

| Template resource          | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| manifest.json              | Exact identity, version, file slots, required resources, variants and historical rules |
| common/                    | Manifest, TypeScript/Vitest configuration and the public-entry test               |
| variants/module/           | Public functions and values without a binding entry                               |
| variants/cordis-module/    | Pure root and integration helpers or coordination bindings                        |
| variants/service-contract/ | Pure public definitions and separate Service definitions, keys and typed events   |
| variants/service-provider/ | Independent factories and bindings that consume public Service definitions        |

`service-contract` can be created in any kebab-case group, including `identity` and `access`. The directory name `core` does not grant create or scan permission.
Ownership of Service definitions stays with [Product package organization](../../../../docs/package-organization.md).
Choose a variant from responsibility review, not directory names or a single extracted provide fact.
Private helper services do not automatically make a coordination package a public Service provider.
A provider consumes the public promises instead of copying them.

## Complete structure comparison

Member discovery first checks real package directories and manifest files against workspace patterns.
It compares those candidates with the source inventory before inspecting packages.
Missing or invalid manifests, directory links and unexpected non-directory nodes cause exit 2.
Group roots allow SPEC.md, AGENTS.md and CLAUDE.md under the current group template, and the older group documents under its previous rules. Group docs are not workspace members.
Unknown directories still require a real package manifest. The name docs is reserved for group documentation.

The scanner visits **every owned file and directory**, including untracked files and empty directories.
It reports the full node inventory and compares it with the selected variant's declared layout in manifest.json.
Undeclared files, wrong locations, empty directories, symlinks and other node kinds fail the comparison.
It does not use Git ignore rules to hide source resources.

Version 4.0.0 allows these Markdown files only: an optional root `README.md`, `UPSTREAM.md` and `api/*.api.md`.
It allows no `docs/`, `adr/`, `SPEC.md`, `AGENTS.md`, `CLAUDE.md`, `README_ZH.md`, `index.md`, `documentation.json`, or `README.md` and `index.md` in any subdirectory.
Source filenames and module counts vary within the declared TypeScript slots.
Schema, runtime resources, models, proofs and fixtures must occupy their declared locations and formats.
Acceptance configuration follows executable scenarios, not the directory. When `acceptance/` holds a `*.acceptance.ts` file outside `acceptance/fixtures/`, the package needs `vitest.acceptance.config.ts` and an `acceptance` script. The configuration requires at least one such scenario. A violation reports `acceptance`.

Only real root directories named node_modules, dist, generated, coverage, tmp or .turbo are excluded.
The scanner reports each excluded directory. A file or symlink with an excluded name is not silently skipped. Nested directories receive no such exemption.
It also checks ESM, export sources and conditions, emission, publishing, scripts and draft placeholders.

Integration results are separate: deviation, unknown or static-pass.
The existing architecture extractor supplies facts. Its coverage limits remain explicit.
A complete file tree cannot prove authorization, transactions, actual drain, recovery or formal properties.
Known integration deviations prohibit adoption. Unknowns require manual applicability and evidence review, not automatic clearance.

## Dependency diagnostics

`scan --json` lists judged edges on each package `dependencies` array.
A row includes `rule`, `state`, `member`, `targetMember`, and `sites`.
The rules are the existing IC rows, the layer rows, `undeclared-dependency`, and `member-cycle`.
`undeclared-dependency` and `member-cycle` are not `RuleId` values. They do not appear in `constraints.json`.
`unknown` stays `unknown`. `--check` does not treat `unknown` as a pass. An `unknown` row alone does not make the exit code 1.

A type import with no declared dependency has `rule` `undeclared-dependency` and `state` `deviation`. The `reason` is `源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明`. `tests/dependency-report.spec.ts` asserts that sentence.
A cycle through a `./cordis` subpath and a relative import has `rule` `member-cycle` and `state` `deviation`. The `reason` starts with `成员之间成环`. The same test asserts that shape.

Group direction is a separate check: the dependency-cruiser rules behind `pnpm run lint:deps`, see [repo-toolchain](../../../repo-toolchain/README_ZH.md#依赖图与依赖规则). A same-group import from `sdk` to `server-entry` violates `sdk-not-server` directly.

## Adoption

After complete adaptation and manual integration review, an existing or completed new package records:

```json
{
  "omneHarness": {
    "packageTemplate": {
      "id": "typescript-package",
      "version": "4.0.0",
      "variant": "service-provider"
    }
  }
}
```

Do not mark an incomplete tree, unresolved applicable obligation or unverified provider as adopted.
The [1.0.0 adoption review](adoption-review.md) describes the earlier template adoption scope.
It does not establish a later version's adoption or replace current contracts and markers.
The scanner is read-only. There is no automatic adoption or version upgrade command.

Marker states are current, older, unmarked, invalid and unknown.
Structure states are pass, fail and uncovered. Neither metadata status nor absence of known deviations establishes conformity.
Inventory exits 0 after a complete report, including negative results.
`--check` exits 0 only for current markers, a passing complete structure and no known integration deviation.
It exits 1 for marker, structure or deviation failures, and 2 for unsupported rules or input errors.
Exit 0 asserts template structure, not full integration or business acceptance.

## Version rules

The manifest is the single current version source. Change its version when released template obligations change.
Existing packages keep their adopted version until their complete migration is checked.
Unknown identities and future versions cannot be certified with current rules.

`previousVersions` preserves the exact required files, variants and complete layouts of 3.0.0, 2.0.0 and 1.0.0. A marked package is scanned by the rules of its own version.
Version 3.0.0 has rule set 3: the documentation skeleton, the docs topic alternatives (`docs/<topic>.md` or `docs/<topic>/` with README.md and index.md, never both) and acceptance configuration that follows executable scenarios.
Versions 2.0.0 and 1.0.0 have rule set 2: no topic check, and `acceptance/` and `vitest.acceptance.config.ts` still require each other. Version 2.0.0 added mandatory documentation.json.
Version 4.0.0 has rule set 4. It drops the documentation skeleton, the topics and the registration, and keeps the acceptance rule.
Existing markers remain older. They do not acquire the new requirements.
A supported historical entry needs its exact required files, variant requirements, complete layout and immutable rule set semantics.
Without those rules, report uncovered. Future incompatible checking behavior requires a separate rule engine.

## Group template

The [group template](../domain/README.md) creates one `SPEC.md` per group.
It creates no workspace member, source, empty topic or adoption marker.

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --check --json
```

An unselected scan reports groups beside packages but retains the package check exit policy.
Use explicit `--group` with `--check` to assert group structure. `--group` and `--member` are mutually exclusive.
Group results include the template identity, owned tree, delegated members and findings.
They do not certify a group's adoption beyond structure.
