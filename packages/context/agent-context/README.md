# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Context-side Agent adapter member, `service-provider` variant. This member is only a skeleton now.

## Responsibility and status

This member will carry two rows of the application assembly page. The `agent-context` row provides `agentRequests` and `agentModelContext`. The `agent-account-outlet` row provides `agentAccountOutlet`. The service definitions belong to [agent-cordis-contract](../../agent/agent-cordis-contract/README.md). The Context-side ports belong to [request-context-contract](../request-context-contract/README.md). For the rows and their dependencies, see the [application assembly](../../../docs/architecture/runtime/application-assembly.md#插件树). For the adapter plan, see [the Context adapter plan](../request-context-contract/docs/context.md#适配方案).

Status: skeleton. The responsibilities and the adoption scope wait for the adoption of the Context and Agent integration gap contract ([#859](https://github.com/nemori-ai/omne-harness-lite/issues/859)). The member name and location are provisional until that adoption confirms them. A rename changes the package organization page and the lockfile in the same batch.

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` export nothing.
- Not implemented: request preparation, Runtime Context reads, the account outlet, and source set registration.
- Not verified: everything. No application assembles this member, and no package depends on it.

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
