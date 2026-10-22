# @omne-harness/session-adapters

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The adapter member of Session. Variant: `cordis-module`.

## Responsibility and status

This package is the only Session member that imports neighbor contracts. Session knows all six neighbors: Agent, Model, Tool, Runtime Context, Request Context, and the execution environment. The neighbors do not know Session. Their contracts name only generic roles, for example external coordinator, commit participant, consumer owner, scope holder, history holder, and maintainer. This package translates between those roles and the Session commands, ports, and facts.

The package owns three things:

- Inbound plugins. A neighbor calls them, or they read a neighbor output. They write session facts through Session commands.
- The implementations of the construction ports and the outbound ports. [session-contract](../session-contract/SPEC.md#构造依赖端口与出站端口) owns the port interfaces. [session-cordis-contract](../session-cordis-contract/docs/cordis.md#端口服务键) owns the service keys.
- The translation tables, which include the `session.modes` table.

The package does not own governance rules, scheduling, or storage. [session-contract](../session-contract/README.md), [session](../session/README.md), and [session-storage-sql](../session-storage-sql/README.md) own them.

Status: adapter member, `draft`. The [SPEC](SPEC.md) is a candidate design. Technical acceptance has not happened for it.

- Implemented: nothing. `src/index.ts` and `src/cordis.ts` hold only template markers.
- Not implemented: all seventeen plugins and port providers.
- Blocked by named premises: the history source, the intake extension points, and the residency ports. Two Agent entries also block work: the late-result entry and the execution views with no live runtime. The [SPEC](SPEC.md#具名前提与明确缺项) lists each premise and the behavior before it closes.

## Usage

The application assembly uses this package on the session path only. Independent callers of a neighbor do not need it.

1. Load [session-cordis](../session-cordis/README.md) and one storage provider.
2. Load the plugins from `@omne-harness/session-adapters/cordis`. Do not load a plugin that the [plugin list](SPEC.md#插件清单) marks as waiting for a premise.
3. Construct the scope-release port in the assembly entry. Give it the recovery access that the maintenance owner issues.
4. Declare the session consumer owner to Model as exempt from the guard until the qualification participant protocol closes.

An inbound plugin declares its caller class like this:

```ts
export const inject = {
  session: { caller: 'coordinator' },
}
```

Tests and tools that need only a translation function import the root entry. The root entry does not import Cordis. The [context page](docs/context.md) gives the full assembly steps.

## Contracts

- `src/` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns the behavior of each plugin, the result mappings, the translation table, and the named premises.
- The [Cordis page](docs/cordis.md) owns `inject`, the provided keys, registration, and removal.
- The [API page](docs/public-api.md) indexes the exports.
- The [session-contract SPEC](../session-contract/SPEC.md) owns the commands, the clauses, and the port semantics.

The package holds no business state. It holds only derived objects that it can lose: live handles, subscriptions, the previous filtered snapshot, and a prefix digest cache. Removal of a plugin does not undo a committed session fact or an external effect.

## Design

Each plugin adapts one role of one neighbor. Each plugin calls the `session` service with one caller class. Translations are deterministic pure functions. Each plugin maps neighbor results to Session results through a closed table. A result outside the table is a dependency failure, not a business refusal. The [architecture page](docs/architecture.md) explains the boundary and the reasons. The [flows page](docs/flows.md) gives one flow for each plugin. The [object model](docs/object-model.md) lists the runtime objects and the identity mappings.

## Configuration and operation

Plugin configuration uses Standard Schema. The adjustable fields are the event page size, the timeouts and retry backoff of neighbor calls, and the page size for re-release. A default is only an initial value. The recovery access is a runtime object. It is not configuration. The application assembly passes it in. The application assembly installs one session-cordis provider, because the single recovery scanner for each tenant depends on it.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-adapters
```

The two current tests check only the template entries. See [tests/](tests/README.md). The continuous obligations VA-01 to VA-19 in the [SPEC](SPEC.md#组合与验证) are not covered yet. A passing structure check does not prove behavior.

## Maintenance

- When a neighbor contract changes, update the matching plugin, its mapping table, and its flow.
- When a Session port or command changes, update the matching plugin and the [Cordis page](docs/cordis.md).
- When a named premise closes, update the plugin status, remove the gap row, and add the behavior and its tests.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Plugins, mappings, translation table, premises
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Boundary, modules, mechanisms, SOLID choices
├── flows.md              One flow for each plugin
├── object-model.md       Runtime objects and identity mappings
├── public-api.md         Export entries and definition index
├── context.md            Assembly steps and position
└── cordis.md             inject, keys, registration, IC map
src/                      index.ts and cordis.ts, template markers only now
tests/                    Two entry tests, fixtures/ is empty now
schema/                   Template placeholder
verification/             models/ and proofs/, template placeholders
adr/                      Template placeholder
examples/                 Template placeholder
resources/                Template placeholder
acceptance/               Template placeholder, fixtures/ too
```

Each directory has README.md for its role and index.md for navigation. Outside `docs/`, these files are still template placeholders and state no package facts. See [index.md](index.md) for reading paths.
