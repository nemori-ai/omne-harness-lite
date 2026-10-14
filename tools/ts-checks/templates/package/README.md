# TypeScript package template

This directory owns `typescript-package@2.0.0`. It is a development resource, not a workspace product member.
Public interfaces, behavior and acceptance remain with their existing owners.
The required member shape is [package organization](../../../../docs/package-organization.md#成员的必选结构).
This generator emits a `build` script that deletes `dist` first, `erasableSyntaxOnly` on the build configuration, and `"files": ["dist"]`. It does not yet emit the source-condition export, because that name is not decided. It emits `tests/public-entry.spec.ts`, which imports the package name and checks the current public exports. Add integration only for a package that implements storage or an application service, and an end-to-end test only for the owner of a key user journey. See [package test duty](../../../../docs/verification.md#包级测试责任与边界).

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
Files contain `PACKAGE_TEMPLATE_DRAFT`. Complete accepted interfaces, behavior and real verification before removing placeholders.
Creation does not generate empty specs, fictitious services or passing placeholder tests.

## Resources and variants

| Template resource | Purpose |
| --- | --- |
| manifest.json | Exact identity, version, file slots, required resources, variants and historical rules |
| common/ | Manifest, TypeScript/Vitest configuration bilingual README drafts and bindings v2 registration |
| variants/module/ | Public functions and values without a binding entry |
| variants/cordis-module/ | Pure root and integration helpers or coordination bindings |
| variants/service-contract/ | Pure public definitions and separate Service definitions, keys and typed events |
| variants/service-provider/ | Independent factories and bindings that consume public Service definitions |
| fragments/ | Writing guides for actual documentation topics, complete owned behavior specifications, schema, verification and decisions |

`service-contract` can be created in any kebab-case group, including `identity` and `access`. The directory name `core` does not grant create or scan permission.
Ownership of Service definitions stays with [Product package organization](../../../../docs/package-organization.md).
`scan --json` lists judged edges on each package `dependencies` array.
A row includes `rule`, `state`, `member`, `targetMember`, and `sites`.
The rules are the existing IC rows, the layer rows, `undeclared-dependency`, and `member-cycle`.
`undeclared-dependency` and `member-cycle` are not `RuleId` values. They do not appear in `constraints.json`.
`unknown` stays `unknown`.
`--check` does not treat `unknown` as a pass. An `unknown` row alone does not make the exit code 1.

`lint:rules` `group-direction` is a separate check. It still reports `unregistered-group` for `packages/access`, `packages/identity`, `packages/agent`, and `packages/assembly`.
This change does not edit that rule.
Registering those groups on `GROUP_DIRECTION_POLICY` would leave a same-group import from `sdk` to `server-entry` legal until the two members form a cycle.

## Later implementers

This template creates drafts and reports dependency rows. It does not build the later product.

| Later work | How to use the template | This card does not provide |
| --- | --- | --- |
| Minimal CLI | Apps do not use this template. The CLI lives in `apps/`. Command parsing does not import `@deepseek-ai/cordis`. | There is no app variant, and this card does not implement the command loop. |
| Member test facility | A draft includes a `tests/` slot. The isolation test shows that an official skeleton can build and typecheck. | This card does not build a package test platform. |
| Base capability | `service-contract` and `cordis-module` can create a draft in a target group. The target path for `kernel-basis` is `packages/assembly/kernel-basis`. | This card does not create that member, and it does not move the sealed package. |

## Dependency diagnostics

A `scan --json` row includes `rule`, `state`, `member`, `targetMember`, and `sites`.

A type import with no declared dependency has `rule` `undeclared-dependency` and `state` `deviation`. The `reason` is `源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明`. `tests/dependency-report.spec.ts` asserts that sentence.

A cycle through a `./cordis` subpath and a relative import has `rule` `member-cycle` and `state` `deviation`. The `reason` starts with `成员之间成环`. The same test asserts that shape.

`unknown` stays `unknown`. Exit code 0 from `--check` does not mean every dependency row has been judged.

Keep definition uniqueness and public entry rules. Do not bypass inspection with a handwritten structure or a false adoption marker.
A provider consumes the public promises instead of copying them.
Private helper services do not automatically make a coordination package a public Service provider.
Choose a variant from responsibility review, not directory names or a single extracted provide fact.

```text
packages/<group>/<name>/
├── package.json                     Explicit exports, scripts, publishing and adopted version
├── README.md / README_ZH.md          Actual responsibilities, entries, examples and boundaries
├── documentation.json              Required files, sections and formal requirement sources
├── docs/                           Conditional topics and declared static images
├── SPEC.md                          Owned behavior beyond types; required for binding variants
├── src/
│   ├── index.ts                     Pure public root
│   ├── cordis.ts                    Binding variants only
│   └── <modules or subdirectories>  TypeScript implementation and public types
├── tests/
│   ├── <checks>.spec.ts/.spec-d.ts  Actual tests and public type checks
│   └── fixtures/                   Test inputs, not current business specifications
├── schema/                         External JSON Schema resources with stable identity
├── resources/                      Runtime data and licensed upstream artifacts
├── verification/
│   ├── README.md                    Properties, assumptions, commands and evidence ownership
│   ├── models/                     TLA+/Alloy or algorithm models and configurations
│   └── proofs/                     Arguments or machine proof sources
├── adr/                            Implementation decisions with continuing consumers
├── acceptance/                     Independent acceptance owner's scenarios
├── examples/                       Actual package use examples
├── tsconfig.build.json
├── tsconfig.test.json
└── vitest.config.ts
```

The tree shows available resource roles, not a requirement to create every optional directory.
The manifest declares all file slots. Source filenames and module counts vary within declared TypeScript slots.
Schema, runtime resources, models, proofs and fixtures must occupy their declared locations and formats.
Verification requires its README. Acceptance requires its separate Vitest configuration.
A declared directory must contain actual resources. Do not add empty directories to imitate the template.

Types and necessary validation express shape. SPEC states the complete necessary behavior beyond public types and references its accepted basis.
The specification has no fixed thickness limit. Shared guarantees stay with their owner instead of being copied.
Keep effective unmigrated sources and their consumers until an accepted migration replaces them.
Do not duplicate a provider's shared promises or manufacture a contract.md beside an existing authority.
Publish an owned SPEC and external schema/runtime resources through the explicit file list.
Preserve schema IDs, resource bytes and accepted business semantics during physical moves.

Models and proofs retain properties, mapping, assumptions, configurations, positive/negative controls and execution commands.
Keep temporary traces and logs with task evidence. A bounded model run does not prove arbitrary implementations.

## Complete structure comparison

Member discovery first checks real package directories and manifest files against workspace patterns.
It compares those candidates with the source inventory before inspecting packages.
Missing or invalid manifests, directory links and unexpected non-directory nodes cause exit 2.
The scanner cannot report a successful inventory that silently omits these candidates.
Group roots allow README.md, README_ZH.md, AGENTS.md, CLAUDE.md and documentation.json.
Group docs contain Markdown and declared SVG, PNG or WebP images. They are not workspace members.
Unknown directories still require a real package manifest. The name docs is reserved for group documentation.

The scanner visits **every owned file and directory**, including untracked files and empty directories.
It reports the full node inventory and compares it with the selected variant's instantiated template tree.
Fixed required nodes, optional resource roles and repeated source slots are all declared in manifest.json.
Undeclared files, wrong locations, empty directories, symlinks and other node kinds fail the comparison.
It does not use Git ignore rules to hide source resources.

Only real root directories named node_modules, dist, generated, coverage or tmp are excluded.
These dependency/build/evidence outputs are not source authority. The scanner reports each excluded directory.
A file or symlink with an excluded name is not silently skipped. Nested directories receive no such exemption.
This is a complete structure check, not a sample of selected entry files.
It also checks ESM, export sources/conditions, emission, publishing, scripts and draft placeholders.

Integration results are separate: deviation, unknown or static-pass.
The existing architecture extractor supplies facts. Its coverage limits remain explicit.
A complete file tree cannot prove authorization, transactions, actual drain, recovery or formal properties.
Known integration deviations prohibit adoption. Unknowns require manual applicability and evidence review, not automatic clearance.

## Adoption

After complete adaptation and manual integration review, an existing or completed new package records:

```json
{
  "omneHarness": {
    "packageTemplate": {
      "id": "typescript-package",
      "version": "2.0.0",
      "variant": "service-provider"
    }
  }
}
```

Do not mark an incomplete tree, unresolved applicable obligation or unverified provider as adopted.
The [1.0.0 adoption review](adoption-review.md) describes the earlier template adoption scope.
It does not establish 2.0.0 adoption or replace current contracts and markers.
The scanner is read-only. There is no automatic adoption or version upgrade command.

Marker states are current, older, unmarked, invalid and unknown.
Structure states are pass, fail and uncovered. Neither metadata status nor absence of known deviations establishes conformity.
Inventory exits 0 after a complete report, including negative results.
`--check` exits 0 only for current markers, a passing complete structure and no known integration deviation.
It exits 1 for marker/structure/deviation failures, and 2 for unsupported rules or input errors.
Unknown integration facts remain in both outputs. Exit 0 asserts template structure, not full integration or business acceptance.

## Version rules

The manifest is the single current version source. Change its version when released template obligations change.
Existing packages keep their adopted version until their complete migration is checked.
Unknown identities and future versions cannot be certified with current rules.

Version 2.0.0 adds mandatory documentation.json and conditional documentation slots.
previousVersions preserves the exact 1.0.0 required files, variants and complete layout.
Existing 1.0.0 markers remain older. They do not acquire the new registration requirement.
A supported historical entry needs its exact required files, variant requirements, complete layout and immutable ruleSet 2 semantics.
Without those rules, report uncovered. Future incompatible checking behavior requires a separate rule engine.
The withdrawn preliminary limited checker is not a published historical template.

## Documentation and group drafts

[Member documentation requirements](../../../../docs/member-documentation.md) own the required content.
Both package READMEs contain seven required sections. Each section starts with a documentation placeholder.
The bindings v2 registration uses paths relative to the repository root and stable section IDs.
Its adopted basis records the structural requirement, not acceptance of draft content.

The [group template](../domain/README.md) creates README.md and documentation.json only.
It creates no workspace member, source, empty topic or adoption marker.

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --json --check
uv run --locked omne-documentation inventory --root . --out tmp/documentation-inventory
```

Use fragments/docs only when a topic has actual readers. Default creation does not copy these fragments.
Register required topic files and sections in the owning documentation.json after adding actual content.
The layout permits Markdown, SVG, PNG and WebP under docs. Empty directories and other formats fail.

The TypeScript scanner checks layout, required registration and draft sentinels.
The Python inventory checks bindings v2, source references, sections, placeholders and unknown applicability.
A section placeholder appears as missing-section with reason `section body: placeholder-only`.
An inventory exit of 0 means that the report completed, including gaps. Inspect its rows.
Neither tool proves content sufficiency, independent installation, business behavior or semantic acceptance.

An unselected scan reports groups against the current group template but retains the package check exit policy.
Use explicit --group with --check to assert group structure. --group and --member are mutually exclusive.
Group results include the template identity, owned tree, delegated members, findings and current-template-only coverage.
They do not certify historical group adoption. Older packages and groups outside the new template scope need separate migration review.

## Long-lived specifications and single-delivery input

The [SPEC writing guide](fragments/specification/SPEC.md.tpl) covers owned behavior, failure, lifecycle, composition, and persistent verification.
The [internal design fragment](fragments/docs/internals.md.tpl) explains the mechanism, responsibility, failure handling, and necessary reasons.
Use both only for real owned obligations. The public entry remains the data-shape authority.

A single-delivery specification describes one task's implementation scope and acceptance input.
It stays with task process materials. A delivery Issue refers to current normative clauses instead of replacing them.
The [delivery protocol](../../../../docs/engineering/delivery.md) owns that distinction and the card's decision rules.

The [RFC directory](../../../../docs/rfcs/README.md) preserves actual proposals and their precise decisions.
RFC acceptance, normative writeback, implementation, and delivery acceptance remain separate.
The current SPEC expresses the final adopted guarantees without assembling RFC history.
Do not manufacture a proposal for an existing guarantee's first formal specification.

These writing-guide changes add no required files or structural slots.
The current manifest version and historical adoption rules remain unchanged.
