# @omne-harness/{{PACKAGE_NAME}}

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft {{VARIANT}} package.
## Responsibility and status

<!-- documentation:placeholder -->

Describe actual consumers, platforms, responsibility, and adoption basis. Separate implemented, pending, and unverified behavior.

## Usage

<!-- documentation:placeholder -->

Give a working example, dependencies, and initialization and disposal responsibilities. Distinguish independent use from Cordis integration. Check public exports, source value dependencies, generated declarations, runtime startup, and the installation closure separately. A ./cordis entry does not prove independent installation.

## Contracts

<!-- documentation:placeholder -->

Link public types, necessary validation, and the sole behavior owner. SPEC.md owns behavior beyond types, and docs/public-api.md indexes the public definitions. Identify error, lifecycle, and resource responsibilities without copying signatures or state machines.

## Design

<!-- documentation:placeholder -->

Summarize internal modules and invariant owners. The full design belongs in docs/architecture.md, docs/flows.md, and docs/object-model.md.

## Configuration and operation

<!-- documentation:placeholder -->

Describe configuration owners, defaults, environment requirements, and explicit dependencies. State the caller and package responsibilities during operation.

## Verification

<!-- documentation:placeholder -->

List repeatable commands, properties, assumptions, and uncovered behavior. Add tests with actual assertions. Passing structure checks does not establish business behavior.

## Maintenance

<!-- documentation:placeholder -->

Identify consumers and checks that must change with public contracts, resources, or dependencies. Explain inapplicable information. Record named gaps for unknown information.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
