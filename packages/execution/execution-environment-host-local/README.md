# @omne-harness/execution-environment-host-local

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation and host provider member of the execution environment. Variant: `service-provider`.

## Responsibility and status

This package does two jobs. First, it puts the registry of [execution-environment](../execution-environment/README.md) into the service `executionEnvironment` that [execution-environment-cordis-contract](../execution-environment-cordis-contract/README.md) defines. It owns registration as effect, the close on service removal, and the report of a failed removal. Second, it provides the `files` facility on the host machine. The facility reads, stats, writes, and closes files by the named object identity. [execution-environment-contract](../execution-environment-contract/README.md) owns the domain behavior.

Status: Service implementation member, `draft`. The host file use section is accepted. See [host file use in the SPEC](SPEC.md#宿主文件使用). The adoption basis also includes the [system page](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备) and the [topic owner table](../docs/architecture.md#主题与唯一拥有者) of the group.

- Implemented: read, stat, write, and close of the host files facility. The host files provider. The Service subclass `ExecutionEnvironmentRegistry`, the plugin `filesFacilityPlugin`, and the plugin `hostFilesPlugin`.
- Not implemented: the other eight `files` operations (they reply `unsupported` now), the `command` and `terminal` providers, the platform prerequisite probe, the grant root restriction, publication of the two Runtime Context blocks, the caller-class check, and `definePlugin` for the two plugins. See the SPEC [gap list](SPEC.md#明确缺项).
- Not verified: no test covers a second load under one isolate label or a configuration check failure.

No application assembles this package now, and no package depends on it.

## Usage

The package has two entries:

- `@omne-harness/execution-environment-host-local/cordis` holds the plugins. An application assembler loads the service, the `files` declaration plugin, and the host files plugin.
- `@omne-harness/execution-environment-host-local` holds the host files facility, the object identity reader, and the host files provider. It does not depend on Cordis.

```ts
import { Context } from '@deepseek-ai/cordis'
import {
  ExecutionEnvironmentRegistry,
  filesFacilityPlugin,
  hostFilesPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

const ctx = new Context()
await ctx.plugin(ExecutionEnvironmentRegistry)
await ctx.plugin(MyRecoveryAuthority)
await ctx.plugin(filesFacilityPlugin)
await ctx.plugin(hostFilesPlugin)
```

`MyRecoveryAuthority` is a subclass of `ExecutionRecoveryAuthorityService` from `@omne-harness/execution-environment-cordis-contract/cordis`. The maintenance owner of the integrator implements it. The service reads it on each recovery operation. Without it, recovery answers `unavailable`. Calling plugins use the service through the service definition. They do not import this package. The execution adapter names an object with `hostObjectToken` from the root entry. The [usage page](docs/context.md#使用方式) covers assembly, naming, and independent use.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types: host provider facts, host file use (accepted), other current behavior, the Service implementation, and the removal order.
- The [host file use section of the architecture page](docs/architecture.md#宿主文件使用) owns the mechanism and the run records.
- The [Cordis page](docs/cordis.md) owns the plugins, the configuration, registration as effect, the removal order, and the IC map.
- [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) owns the service key and the abstract class.

The fiber of the service plugin owns the service instance and the registry instance. On service removal, the package closes the registry: it refuses new requests, invalidates leases, and retires all providers. When a retirement stays pending, the removal function throws `RetirementPending`. On a fiber unload, Cordis writes that error to `ctx.logger` and the unload completes. A caller that calls the returned removal itself can retry it. The fiber of `filesFacilityPlugin` owns the `files` descriptor registration. The fiber of `hostFilesPlugin` owns the host files provider registration. Removal does not undo bytes already written.

## Design

The root entry has two modules: the host files facility and the host files provider. `./cordis` has the Service subclass and two plugins. The outside dependencies are execution-environment-contract, execution-environment, execution-environment-cordis-contract, and `@deepseek-ai/cordis`. The host files facility checks only the object identity. The lease view of the registry checks the tenant and the guard. One provider shares one facility instance and counts the file operations in flight. The registry gate, not the provider, refuses operations with `closed` after the acquisition ledger closes. On retirement, the provider admits no new operation and waits for the operations in flight up to `drainBoundMs`. Past that bound, the retirement is pending. The Service subclass only forwards calls and manages life. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives three mechanism flows. The [object model](docs/object-model.md) lists the objects.

## Configuration and operation

The Service subclass and `filesFacilityPlugin` accept only an absent value, `null`, or an empty object as configuration. `hostFilesPlugin` also accepts `drainBoundMs`, a finite number of milliseconds, zero or more. It bounds how long the host provider retirement waits for file operations in flight. The initial value is 10000. A retirement past the bound writes one diagnostic error with the count in flight to `ctx.logger`. The recovery authority port comes as the service `executionRecoveryAuthority`. It does not go into the plugin tree. One isolate label holds one service.

The host files facility runs on Node. It checks the object identity with `O_NOFOLLOW`, the device number, and the inode. `package.json` declares the engine `>=24`. The platform in the host facts is `process.platform` with `os.release()`. The provider version is the `version` of this package's `package.json`. The prerequisites read as `unknown`, because no probe runs.

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/execution-environment-host-local test
```

In this directory, run `pnpm typecheck` for the type check. The eight test files hold seventy-nine tests. See [tests/](tests/README.md). File bytes, symbolic links, and object replacement use the real file system. Cordis loading uses real Cordis 4.0.4. Authorization decisions use stubs. One test file holds one `open` call with a module mock to keep a file operation in flight. Run records: at acceptance, the tests ran only on Node v26.0.0 and darwin. On 2026-10-21, on Node v24.18.0 and linux, all seventy-nine tests passed. No test covers the grant root restriction, a second load, or a configuration check failure. A passing structure check does not prove behavior.

## Maintenance

- A change to the accepted host file use behavior needs a new acceptance through the original acceptance entry. Then update the SPEC, the [architecture section](docs/architecture.md#宿主文件使用), and the tests.
- When the service definition changes, update the Service subclass, the [Cordis page](docs/cordis.md), and the tests.
- When the registry factory changes, update the Service subclass.
- When a new host facility arrives, update the host provider facts in the SPEC, the [API page](docs/public-api.md), and the Cordis page.
- Before a Cordis upgrade, run the basis probes that the service definition member lists.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Host provider, host file use (accepted), Service, removal order
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms, host file use (accepted)
├── flows.md              Mechanism flows F-EEH01 to F-EEH03
├── object-model.md       Service instance, provider, facility instance, handle generations
├── public-api.md         Export entries and definition index
├── context.md            Assembly, naming, independent use, position
└── cordis.md             Plugins, configuration, registration, removal order, IC map
src/                      index.ts, host-files.ts, host-provider.ts, cordis.ts
tests/                    Eight test files, fixtures/ is empty now
schema/                   Empty, the configuration schema is in src/cordis.ts
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
