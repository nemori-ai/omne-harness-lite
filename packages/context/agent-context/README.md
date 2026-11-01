# @omne-harness/agent-context

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Context-side Agent adapter member, `service-provider` variant.

## Responsibility and status

This member carries two rows of the application assembly page. The `agent-account-outlet` row provides `agentAccountOutlet`. The `agent-context` row will provide `agentRequests` and `agentModelContext`. The service definitions belong to [agent-cordis-contract](../../agent/agent-cordis-contract/README.md). The Context-side ports belong to [request-context-contract](../request-context-contract/README.md). For the rows and their dependencies, see the [application assembly](../../../docs/architecture/runtime/application-assembly.md#插件树). For the adapter plan, see [the Context adapter plan](../request-context-contract/docs/context.md#适配方案).

Status: first step, in progress. The package exists as the adapter between Agent and Request Context. It is the only member of the Context group that imports the Agent contract.

- Implemented: the account outlet. `createAgentAccountOutlet` turns one Agent account handoff into one account fact for the accounting inbox and maps the answer by name. `absentAccountTarget` is the resolver that has no target. `AgentAccountOutletProvider` is the Cordis plugin that provides `agentAccountOutlet`.
- Known limits (named in the [SPEC](SPEC.md#已知限制)): in this wave no member initializes the account projection (ACCT-INIT) and no member resolves the account target (ACCT-TARGET). In a real assembly `deliver` always answers `unavailable` with `scope-unresolved`. It never answers `received`.
- Not implemented: `agentRequests`, `agentModelContext`, and the registration of source sets. They wait for the shapes of the session-side parts.
- Verified: the outlet passes the conformance suite of `AgentAccountOutlet` over the real account projection. The plugin loads and stops on real Cordis 4.0.4 with the real request-context provider. See [tests/](tests/README.md).
- Not verified: the account projection in a real assembly, the real Model-side result receiver, and any behavior across processes.

## Usage

Independent use needs a `ContextAccountingInbox`, an adoption identity for the sender, and a target resolver:

```ts
import { absentAccountTarget, createAgentAccountOutlet } from '@omne-harness/agent-context'

const outlet = createAgentAccountOutlet({ inbox, sender, resolveTarget: absentAccountTarget })
const outcome = await outlet.deliver({ access, handoff })
```

The returned outlet holds no resource and needs no disposal. With Cordis, load `AgentAccountOutletProvider` from `@omne-harness/agent-context/cordis` with the configuration `{ sender }`. It needs `requestContext` and `contextAccountingInbox`. A `./cordis` entry does not prove independent installation.

## Contracts

The behavior of the outlet is in [SPEC.md](SPEC.md). The public definitions are indexed in [docs/public-api.md](docs/public-api.md). The port `AgentAccountOutlet` and its answers belong to agent-contract. The inbox and the fact belong to request-context-contract.

## Design

The outlet checks the tenant of the call first, then asks the target resolver, then hands one fact to the inbox once. It keeps nothing between calls. See [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The plugin configuration has one field, `sender`, the adoption identity that the outlet gives to every fact. A configuration that does not fit makes the load fail. The first wave passes the absent resolver. The caller of the factory supplies the inbox, the sender and the resolver.

## Verification

Run these commands in this directory: `pnpm exec vitest run` and `pnpm run typecheck`. The tests import the built output of the members they use, so build the dependencies first. They cover the conformance suite, the tenant order, the absent resolver, the field mapping, the answer mapping, and the real Cordis lifecycle. They do not cover the initialization of the account projection in a real assembly.

## Maintenance

When the inbox, the handoff or the service keys change, update the plugin `inject`, the mapping tables in the SPEC and the tests. The consumers are Agent (through `agentAccountOutlet`) and the application assembly page. When the target resolver gets a real provider, update the known limits in the SPEC.

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
