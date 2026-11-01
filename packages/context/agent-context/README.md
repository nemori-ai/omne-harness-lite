# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Context-side Agent adapter member, `service-provider` variant.

## Responsibility and status

This member carries two rows of the application assembly page. The `agent-account-outlet` row provides `agentAccountOutlet`. The `agent-context` row provides `agentRequests` and `agentModelContext`. The service definitions belong to [agent-cordis-contract](../../agent/agent-cordis-contract/README.md). The Context-side ports belong to [request-context-contract](../request-context-contract/README.md). For the rows and their dependencies, see the [application assembly](../../../docs/architecture/runtime/application-assembly.md#插件树). For the adapter plan, see [the Context adapter plan](../request-context-contract/docs/context.md#适配方案).

Status: second step, in progress. The package is the adapter between Agent and Request Context and Runtime Context. It is the only member of the Context group that imports the Agent contract. It does not import session-adapters. The session-side parts arrive through the key `contextHolderSources` (K-RQ), and the reader eligibility arrives through `runtimeContextReaderEligibility` (K-RC).

- Implemented: the account outlet. `createAgentAccountOutlet` turns one Agent account handoff into one account fact for the accounting inbox and maps the answer by name. `absentAccountTarget` is the resolver that has no target. `AgentAccountOutletProvider` is the Cordis plugin that provides `agentAccountOutlet`.
- Known limits (named in the [SPEC](SPEC.md#已知限制)): in this wave no member initializes the account projection (ACCT-INIT) and no member resolves the account target (ACCT-TARGET). In a real assembly `deliver` always answers `unavailable` with `scope-unresolved`. It never answers `received`.
- Implemented: request preparation and the model context read. `createAgentRequests` translates `prepare`, `derive` and `resume` into Request Context calls, stages the group values of each call, and registers the source set of a target on its first call. `createAgentModelContext` reads the model-readable Runtime Context, full or incremental, and keeps the block material in the process. `createContextMaterials` is the material store that the two share. `AgentContextProvider` is the Cordis plugin that provides both services in one fiber.
- Known limits of the second step: the fourth group gives `null` for the definition adoption and the workspace (ASSEMBLE-CONTEXT-NULL). The compaction path works only inside one instance, and `derive` cannot read a step result in this wave (COMPACTION-PATH). The plugin injects the Model preparation resources by the key name `modelPreparationResources` until model-cordis-contract delivers the key (X3-KEY). The result capacity of a ready preparation comes from the plugin configuration (RESULT-CAPACITY).
- Verified: the outlet passes the conformance suite of `AgentAccountOutlet` over the real account projection. Request preparation runs over the real Request Context registry with the default strategies, and its fixed request passes the Model request preparation double. The second round declares `lineage.continues`. The model context read runs over the real Runtime Context mechanism. Both plugins load and stop on real Cordis 4.0.4, and the holder double of K-RQ closes its reads only after the settlement. See [tests/](tests/README.md).
- Not verified: the account projection in a real assembly, the real Model-side result receiver, the real K-RQ, K-RC and X-3 providers, a Runtime Context read with blocks, and any behavior across processes.

## Usage

Independent use needs a `ContextAccountingInbox`, an adoption identity for the sender, and a target resolver:

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

The returned outlet holds no resource and needs no disposal. With Cordis, load `AgentAccountOutletProvider` from `@omne-harness/agent-context/cordis` with the configuration `{ sender }`. It needs `requestContext` and `contextAccountingInbox`. A `./cordis` entry does not prove independent installation.

Request preparation and the model context read share one material store:

```ts
const materials = createContextMaterials({ owner, capacity: 256 })
const reader = createAgentModelContext({ materials, parts, eligibility, runtimeContext })
const requests = createAgentRequests({
  materials,
  parts,
  requestContext,
  preparation,
  conversions,
  model,
  resultCapacity,
  tools: firstWaveTools,
  stepResults: absentStepResults,
})
```

When you stop, call `requests.close()` and give its settlement to the holder of the parts, then call `materials.close()`. With Cordis, load `AgentContextProvider` with the configuration `{ owner, resultCapacity }`. It needs six keys: `requestContext`, `contextHolderSources`, `runtimeContextReaderEligibility`, `runtimeContext`, `modelRequestPreparation` and `modelPreparationResources`. See [docs/context.md](docs/context.md) and [docs/cordis.md](docs/cordis.md).

## Contracts

The behavior of the three outlets is in [SPEC.md](SPEC.md). The public definitions are indexed in [docs/public-api.md](docs/public-api.md). The ports and their answers belong to agent-contract. The inbox, the fact, the source set and the operation group belong to request-context-contract. The keys K-RQ and K-RC belong to the two Cordis contract members of the Context group. The field mapping belongs to the [Context adapter plan](../request-context-contract/docs/context.md#适配方案).

## Design

The outlet checks the tenant of the call first, then asks the target resolver, then hands one fact to the inbox once. It keeps nothing between calls. Request preparation checks the tenant of its own evidence first, resolves the history through the holder, stages the group values of the call, and asks Request Context. The read keeps the material of the latest full read per execution attachment, in the process only. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The outlet plugin configuration has one field, `sender`, the adoption identity that the outlet gives to every fact. The context plugin configuration has `owner`, `resultCapacity` and an optional `materials` capacity (initial value 256). A configuration that does not fit makes the load fail. The first wave passes the absent resolver, the first-wave tools rule and the absent step results.

## Verification

Run these commands in this directory: `pnpm exec vitest run` and `pnpm run typecheck`. The tests import the built output of the members they use, so build the dependencies first. They cover the outlet suites, the four outcomes of `prepare`, the second-round lineage, the groups and tokens, the staging table, the registration, the failure classes, the compaction checks, the full and incremental reads, the evidence scope, the refusals, and the real Cordis lifecycle of both plugins. They do not cover the initialization of the account projection in a real assembly or the real session-side providers.

## Maintenance

When a port, the field mapping or a service key changes, update the plugin `inject`, the mapping tables in the SPEC and the tests. When model-cordis-contract delivers the X-3 key, import its constant in place of `MODEL_PREPARATION_RESOURCES`. The consumers are Agent (through the three keys) and the application assembly page. When the target resolver gets a real provider, update the known limits in the SPEC.

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
