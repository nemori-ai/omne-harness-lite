# @omne-harness/session-cordis-contract

[中文](README_ZH.md)

The Cordis definition member of Session. Variant: `service-contract`.

## Responsibility and status

This package owns only the Cordis definition of the Session seam. The definition has these parts. They are the service key `session`, the abstract class `SessionService`, the port service keys, the intercept configuration `{ caller }`, and the wake-up event `session-cordis-contract/committed`.

The package does not own domain behavior. [session-contract](../session-contract/README.md) owns the four faces and the port interfaces. [session](../session/README.md) owns the governance mechanism. [session-cordis](../session-cordis/README.md) owns the Service implementation and the injection. [session-adapters](../session-adapters/README.md) and [session-storage-sql](../session-storage-sql/README.md) supply the ports. The package knows only generic roles: caller class, port provider, and listener.

Status: Cordis definition member, `draft`. The [SPEC](SPEC.md) states the properties. It is a candidate design. Technical acceptance has not happened for it. The adoption basis is the [IC conventions](../../../docs/architecture/cordis-integration-conventions.md).

| Export | Support | Where |
| --- | --- | --- |
| `SessionService` with the four faces, `sessionKey` | Exported | `src/cordis.ts` |
| Ten port Services and keys: `sessionTransactions`, `sessionPrincipals`, `sessionIdentity`, `sessionEvidence`, `sessionClock`, `sessionIdleInput`, `sessionContextInput`, `sessionNotifier`, `sessionAgentDrive`, `sessionScopeRelease` | Exported | `src/cordis.ts` |
| `SessionIntercept`, the `Context` and `Events` augmentations, the event `session-cordis-contract/committed` | Exported | `src/cordis.ts` |
| Type re-exports of the root entry | Exported, no runtime value | `src/index.ts` |
| `sessionToolStartFence`, `sessionDeliveryRelease` | Superseded, not defined | [session-contract SPEC](../session-contract/SPEC.md#被替代的协议) |
- Not verified: the Cordis mechanism reading for the intercept configuration is source reading only. Thus property 4 of the SPEC is an assumption. See the [Cordis page](docs/cordis.md#机制读数与假设).

## Usage

The package has two entries:

- The root entry `@omne-harness/session-cordis-contract` re-exports only contract types. It does not import Cordis.
- `@omne-harness/session-cordis-contract/cordis` holds the service definition.

A caller plugin declares its caller class like this:

```ts
import type {} from '@omne-harness/session-cordis-contract/cordis'

export const inject = {
  session: { caller: 'intake' },
}
```

The object form of `inject` is still a required dependency. The value is the intercept configuration. A plugin that takes the service through `ctx.get` has no configuration, and the service refuses its calls. The [Cordis page](docs/cordis.md#intercept-配置与调用方类) gives the four caller classes and the dependency classes of each kind of dependent.

Independent use does not need this package. A caller that uses only values and pure interfaces installs [session-contract](../session-contract/README.md).

## Contracts

- `src/` owns the service definitions.
- The [SPEC](SPEC.md) owns the properties and the lifecycle table.
- The [Cordis page](docs/cordis.md) owns the service definition, the port service keys, the event, the dependency classes, and the IC conformance map.
- The [API page](docs/public-api.md) indexes the exports.
- The [session-contract SPEC](../session-contract/SPEC.md) owns the operations, the results, and the failures of the four faces.

The package holds no resources. The fiber of the caller plugin owns the life of its intercept configuration. The fiber of the listener owns the life of an event listener. The provider of each port owns that port. Removal of a port plugin does not undo a committed business fact.

## Design

Each entry has one source file. The outside dependencies are the types of session-contract and `@deepseek-ai/cordis`. The package imports no provider and no mechanism. The service has one key for all four faces. Only the transaction port and the internal principals go into `inject`. Every other port is taken at call time. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) and the [object model](docs/object-model.md) explain why this member has no flows and no domain objects of its own.

## Configuration and operation

The package has no plugin configuration, needs no environment, and reads no resources at run time. The intercept configuration `{ caller }` is an assembly declaration of a caller plugin. It is not configuration of this package. The provider configuration belongs to [session-cordis](../session-cordis/docs/cordis.md). The application assembly installs exactly one session-cordis provider, because the single recovery scanner for each tenant depends on it.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/session-cordis-contract
```

In this directory, run `pnpm typecheck` for the type check. The tests check the export sets of both entries, that every key equals the `provide` of its class, that the root entry imports no Cordis and no provider, and that a real `Context` loads a `SessionService` subclass and removes it on unload. See [tests/](tests/README.md). The obligations of the SPEC lifecycle section belong to the provider tests. A passing structure check does not prove behavior.

## Maintenance

- When the operation types of the four faces change in the contract, update the abstract class, the [API page](docs/public-api.md), and the export tests.
- When a port interface changes in the contract, update the port service keys in the [Cordis page](docs/cordis.md#端口服务键) and the provider of that port.
- When the service key, the intercept configuration, or the event changes, update the Cordis page and the provider session-cordis.
- Before a Cordis upgrade, run the basis probes that the Cordis page lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Properties and the lifecycle table
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── cordis.md             Service definition, port keys, event, IC map
├── architecture.md       Entries, dependencies, reasons
├── context.md            Who installs this member, position
├── flows.md              Why this member has no flows of its own
├── object-model.md       Why this member has no domain objects
└── public-api.md         Export entries and definition index
src/                      index.ts (type re-exports) and cordis.ts (definitions)
tests/                    Entry tests: export sets, keys, real Context load
schema/                   Template placeholder
verification/             models/ and proofs/, template placeholders
adr/                      Template placeholder
examples/                 Template placeholder
resources/                Template placeholder
acceptance/               Template placeholder, fixtures/ too
```

Each directory has README.md for its role and index.md for navigation. Outside `docs/`, these files are still template placeholders and state no package facts. See [index.md](index.md) for reading paths.
