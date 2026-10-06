# TypeScript package template

This directory owns package scaffolding and the `typescript-package@1.0.0` structural rules. It is a development resource, not a workspace product member. Public interfaces and accepted behavior remain with their existing owners.

## Create a draft

Run from the repository root:

```sh
pnpm package:template create --group core --name example-capability --variant service-contract
pnpm package:template create --group core --name example-capability --variant service-contract --write
pnpm package:template scan --json
pnpm package:template scan --member packages/core/storage --check
```

Creation previews the file list by default. `--write` refuses an existing target, including a symlink. It validates templates before writing and removes its incomplete new package on write failure. It does not install dependencies, execute package code, or adopt a business contract. Use it in a trusted local checkout, without concurrent directory replacement.

Generated files contain `PACKAGE_TEMPLATE_DRAFT`. Complete the accepted public interfaces, behavior and meaningful verification before removing those placeholders. Scanning rejects incomplete drafts. A successful build alone does not make a draft an accepted capability.

## Directory and variant ownership

| Resource | Purpose |
| --- | --- |
| `manifest.json` | Template identity, exact version, common resources, variants and supported historical rule sets |
| `common/*.tpl` | Package manifest, build/test configuration and English/Chinese README drafts |
| `variants/module/` | Pure root for a reusable function or data module |
| `variants/cordis-module/` | Pure root plus a binding entry for kernel helpers or composition mechanisms without a public Service definition |
| `variants/service-contract/` | Pure public definitions plus `./cordis` Service definitions, keys and typed events. Definition packages belong to `packages/core/` |
| `variants/service-provider/` | Independent functions/factories plus `./cordis` provider binding that consumes public Service definitions |
| `fragments/` | Conditional writing guides for thin behavior, external schema, verification and implementation decisions |

The binding variants do not generate fictitious Service classes, keys or lifecycle callbacks. Complete those from the accepted contract. A provider implements an existing public definition. Application assembly chooses the provider.

The generated package has this layout. Optional resources are added only when they have a real obligation:

```text
packages/<group>/<name>/
├── package.json              Explicit exports, scripts and template marker
├── README.md / README_ZH.md  Scope, public entries and development use
├── tsconfig.build.json      src/ → dist/
├── tsconfig.test.json        Typecheck source and tests without emission
├── vitest.config.ts         Repository test tiers and type tests
├── src/
│   ├── index.ts             Pure public root
│   ├── cordis.ts            Binding entry, only for binding variants
│   └── contracts/           Optional public type split, exported through index.ts
├── SPEC.md                  Optional thin behavior beyond types
├── schema/                  Optional externally consumed JSON Schema
├── tests/                   Real behavior and public type checks
├── verification/
│   └── models/              Optional TLA+, Alloy or algorithm models and configurations
└── ADR/                     Optional implementation decisions still used by consumers
```

`contracts/` is not another copy of the contract in prose. Keep public types with their owner. Internal runtime validators stay in `src/`. Add a public Schema only when a consumer needs it. Preserve its stable identity and publish its actual resource through explicit exports. Publish `SPEC.md` when the package owns that behavior.

A thin spec states only behavior that types cannot express. It references acceptance and unmigrated sources instead of replacing them implicitly. Model resources retain their assumptions, positive and negative controls, execution commands and evidence ownership. A finite test or bounded model run is not an unconditional proof. The fragments do not create empty specs, models, tests or decision records.

## Adoption and scanning

A package records:

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

This records structural adoption, not complete architecture or business acceptance. Existing packages first receive a read-only inventory. Complete required resources and review the binding ownership before adding this exact marker. Preserve public exports, dependencies, source, models and accepted semantics. Include both README files in the package file list. Do not mark a known static deviation as compliant.

The scanner reuses the existing workspace and architecture readers. It scans only `packages/<group>/<name>`. Templates, tools, examples and applications are outside this package adoption scope. It reports marker status (`current`, `older`, `unmarked`, `invalid`, `unknown`) separately from structural status (`pass`, `fail`, `uncovered`). Required resources, ESM, explicit export sources, scripts, variants, draft placeholders and known static deviations participate in the result. Rule set 1 supports types/import conditions and optional require/default conditions pointing to the same runtime target. Other conditions or targets require review because their order can redirect runtime loading. Explicit build settings must not suppress runtime or declaration emission. Architecture and binding unknowns remain visible as separate coverage limitations. No scan certifies tenant authorization, transaction guarantees, provider drain or model lifecycle behavior.

Inventory exits 0 after a complete scan, including negative results. `--check` exits 0 only for current markers with passing structure. It exits 1 for missing/older markers or structural failures, and 2 for unsupported rules or input errors. JSON and text expose the same findings. The scanner never modifies a package or upgrades its marker.

## Version changes

The manifest is the current version source. Increment its semantic version when template obligations change. A package keeps its adopted version until someone checks and migrates it. An unknown identity or future version cannot be checked under current rules.

This first release has no real historical template version. `previousVersions` is empty. Tests use controlled historical fixtures only. A historical entry must name an older exact version, its required files and immutable `ruleSet: 1` semantics. That rule set is the fixed first scanner's structural logic, not later current rules. A future incompatible rule engine needs a separate revision. Without complete supported rules, report `uncovered` and require review. Do not restore an obsolete template body or manufacture a historical migration claim.
