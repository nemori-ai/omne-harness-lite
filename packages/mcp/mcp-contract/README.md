# @omne-harness/mcp-contract

[中文](README_ZH.md)

The pure contract of the MCP group: values, outcomes, failures, the five application service interfaces, pure functions, the category port of MCP endpoint bodies, the requirement ports, and conformance suites for the port implementers.

## Responsibility and status

This package states what MCP gives and what MCP needs, in MCP's own words. It does not name its callers. It has no service implementation, no transport, and no SDK. The MCP SDK, Cordis and every implementation stay out of this package.

Status: candidate contract, without technical acceptance. The behavior is in [SPEC.md](SPEC.md). The group design is in [the group engineering design](../docs/architecture.md).

| Part                                                                                            | State                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values, brand guards, keys                                                                      | Implemented and tested                                                                                                                                                                    |
| Endpoint body parser, category port `mcp`, schema                                               | Implemented and tested                                                                                                                                                                    |
| Catalog functions `completeListing`, `mergeListing`, `markUnavailable`, `actionPermissionItems` | Implemented and tested                                                                                                                                                                    |
| `classifyOutcome`, `toContentBlocks`, `boundInstructions`                                       | Implemented and tested                                                                                                                                                                    |
| Five service interfaces                                                                         | Interfaces only. `@omne-harness/mcp` implements them                                                                                                                                      |
| Five requirement ports and the transport port                                                   | Interfaces only. Conformance suites and in-memory doubles in `./testing`; the transport suite `mcpTransportConformance()` runs on the scripted transport `createScriptedTransportFactory` |
| Real peers, credentials, process landings, durable storage                                      | Not verified here                                                                                                                                                                         |

## Usage

The package has three entries. Callers import the root. Port implementers import `./provider`. Port implementers import `./testing` in their tests only.

```ts
import { createCategoryRegistry, readBodyText } from '@omne-harness/assets'
import { mcpEndpointBodyContract, parseEndpointBody } from '@omne-harness/mcp-contract'

const registry = createCategoryRegistry()
registry.register(mcpEndpointBodyContract())

const read = readBodyText(text, limits)
if (read.kind === 'ok') {
  const parsed = parseEndpointBody(read.value, 'files')
  if ('failure' in parsed) report(parsed.failure)
}
```

A port implementer runs a suite in its own test framework:

```ts
import { mcpCatalogStoreConformance, runConformanceCase } from '@omne-harness/mcp-contract/testing'

for (const conformance of mcpCatalogStoreConformance())
  it(conformance.name, async () => {
    // A fresh fixture for every case, built by the implementer.
    expect(await runConformanceCase(conformance, newFixture())).toEqual({ kind: 'passed' })
  })
```

The package has no initialization and holds no resource. It does not need Cordis. See [docs/context.md](docs/context.md).

## Contracts

- Public types and runtime checks: [src/](src/README.md), indexed in [docs/public-api.md](docs/public-api.md).
- Behavior beyond the types: [SPEC.md](SPEC.md).
- Endpoint body schema: [schema/endpoint-body.schema.json](schema/endpoint-body.schema.json).

Which failures each function returns, and the preconditions whose violation throws, are in SPEC.md: C4 and C7 for the catalog functions, and S3 for `boundInstructions`.

## Design

Modules: `brands`, `values`, `args`, `json`, `endpoint`, `listing`, `catalog`, `classify`, `content`, `instructions`, `revisions`, `keys`, `outcomes`, `ports`, `transport`, `services`, and the `testing-*` modules of the `./testing` entry. `testing-transport` holds the transport suite and its fixture types (`TransportFixture`, `PeerScript`); `testing-scripted-transport` holds the in-memory scripted transport that passes it. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The package has no configuration. `McpConfig` is the configuration type of the service implementation. SPEC S3 and S4 state its fields and how setting values are used.

## Verification

Run `pnpm turbo run build typecheck test --filter=@omne-harness/mcp-contract`. The tests import the built package. They cover every rejection reason of the body, the catalog properties with a seeded random walk, an exhaustive outcome table, every content type, the five suites on the in-memory doubles, the transport suite on the scripted transport with both material kinds, and doubles and scripted transports that break the contract and make the suites fail. Type tests pin each closed set and the `./provider` type exports. SPEC.md lists what the tests do not cover.

## Maintenance

A change to a public type or a SPEC clause changes `@omne-harness/mcp`, `@omne-harness/mcp-host-local` and the group design. Update `tests/closed-sets.ts` when a closed set changes. Keep `schema/endpoint-body.schema.json` and `src/endpoint-schema.ts` equal. A test checks them. After the contract is merged, only additive changes are allowed without a new decision.

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
