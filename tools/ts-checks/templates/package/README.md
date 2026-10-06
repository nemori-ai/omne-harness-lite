# TypeScript package template

This directory owns `typescript-package@1.0.0`. It is a development resource, not a workspace product member.
Public interfaces, behavior and acceptance remain with their existing owners.

## Create and inspect

Run from the repository root:

```sh
pnpm package:template create --group core --name example-capability --variant service-contract
pnpm package:template create --group core --name example-capability --variant service-contract --write
pnpm package:template scan --json
pnpm package:template scan --member packages/core/storage --check
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
| common/ | Manifest, TypeScript/Vitest configuration and bilingual README drafts |
| variants/module/ | Public functions and values without a binding entry |
| variants/cordis-module/ | Pure root and integration helpers or coordination bindings |
| variants/service-contract/ | Pure public definitions and separate Service definitions, keys and typed events |
| variants/service-provider/ | Independent factories and bindings that consume public Service definitions |
| fragments/ | Writing guides for actual thin specs, schema, verification and decisions |

Public Service definitions belong to core. A provider consumes their promises instead of copying them.
Private helper services do not automatically make a coordination package a public Service provider.
Choose a variant from responsibility review, not directory names or a single extracted provide fact.

```text
packages/<group>/<name>/
├── package.json                     Explicit exports, scripts, publishing and adopted version
├── README.md / README_ZH.md          Actual responsibilities, entries, examples and boundaries
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

Types and necessary validation express shape. SPEC states only additional behavior and references its accepted basis.
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
Group navigation files are limited to README.md, README_ZH.md, AGENTS.md and CLAUDE.md.

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
      "version": "1.0.0",
      "variant": "service-provider"
    }
  }
}
```

Do not mark an incomplete tree, unresolved applicable obligation or unverified provider as adopted.
The [per-package adoption review](adoption-review.md) records this PR's qualified packages and remaining scopes.
It does not replace contracts, accepted evidence or the marker in package.json.
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

This first release has no actual historical version. previousVersions is empty.
Controlled fixtures test historical dispatch, not a real historical migration.
A supported historical entry needs its exact required files, variant requirements, complete layout and immutable ruleSet 2 semantics.
Without those rules, report uncovered. Future incompatible checking behavior requires a separate rule engine.
The withdrawn preliminary limited checker is not a published historical template.
