# @omne-harness/tool-host-local

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft service-provider package.
## Responsibility and status

<!-- documentation:placeholder -->

Describe actual consumers, platforms, responsibility, and adoption basis. Separate implemented, pending, and unverified behavior.

## Usage

<!-- documentation:placeholder -->

Give a working example, dependencies, and initialization and disposal responsibilities. Distinguish independent use from Cordis integration. Check public exports, source value dependencies, generated declarations, runtime startup, and the installation closure separately. A ./cordis entry does not prove independent installation.

## Contracts

<!-- documentation:placeholder -->

Link public types, necessary validation, and the sole behavior owner. SPEC.md owns behavior beyond types. Identify error, lifecycle, and resource responsibilities without copying signatures or state machines.

## Design

<!-- documentation:placeholder -->

Describe internal modules, data flow, control flow, and invariant owners. Split complex mechanisms into pages for actual reading tasks.

## Configuration and operation

<!-- documentation:placeholder -->

Describe configuration owners, defaults, environment requirements, and explicit dependencies. State the caller and package responsibilities during operation.

## Verification

<!-- documentation:placeholder -->

List repeatable commands, properties, assumptions, and uncovered behavior. Add tests with actual assertions. Passing structure checks does not establish business behavior.

## Maintenance

<!-- documentation:placeholder -->

Identify consumers and checks that must change with public contracts, resources, or dependencies. Explain inapplicable information. Record named gaps for unknown information.

## Directory structure and document responsibilities

Each fixed directory has one responsibility. A directory that exists does not prove that it contains an implementation, a schema, a model, a proof, or an acceptance capability. The source entries and the package-root READMEs keep the `PACKAGE_TEMPLATE_DRAFT` marker. The other skeleton pages keep a placeholder marker until the owner writes their content.

```text
tool-host-local/
├── README.md / README_ZH.md / index.md
├── SPEC.md
├── documentation.json / package.json
├── docs/                     README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md
├── src/                      README.md + index.md + index.ts + cordis.ts
├── tests/                    README.md + index.md + public-entry.spec.ts + cordis-entry.spec.ts
│   └── fixtures/             README.md + index.md
├── schema/                   README.md + index.md
├── verification/             README.md + index.md
│   ├── models/               README.md + index.md
│   └── proofs/               README.md + index.md
├── adr/                      README.md + index.md
├── examples/                 README.md + index.md
├── resources/                README.md + index.md
├── acceptance/               README.md + index.md
└── tsconfig.build.json / tsconfig.test.json / vitest.config.ts
```

The public contract of this provider belongs to the contract member [`@omne-harness/tool-contract`](../tool-contract/README.md). The full file navigation is in [index](index.md). The topic responsibilities are in [docs/README](docs/README.md).
