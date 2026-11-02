# @omne-harness/execution-environment-host-local

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The Service implementation and host provider member of the execution environment. Variant: `service-provider`.

## Responsibility and status

This package does two jobs. First, it puts the registry of [execution-environment](../execution-environment/README.md) into the service `executionEnvironment` that [execution-environment-cordis-contract](../execution-environment-cordis-contract/README.md) defines. It owns registration as effect, the close on service removal, and the report of a failed removal. Second, it provides the `files` and `command` facilities on the host machine. The `files` facility does twelve operations on the object that the request names, with an optional host files root. The `command` facility runs commands on Linux, each in its own systemd user scope. [execution-environment-contract](../execution-environment-contract/README.md) owns the domain behavior.

Status: Service implementation member, `draft`. The host file use section is accepted. See [host file use in the SPEC](SPEC.md#宿主文件使用). The adoption basis also includes the [system page](../../../docs/architecture/runtime/execution-environment.md#环境选择与资源准备) and the [topic owner table](../docs/architecture.md#主题与唯一拥有者) of the group.

- Implemented: the twelve operations of the host files facility, and the host files root (Linux only; other hosts answer `unavailable` for the eight operations beyond read, stat, write, and close). The Linux `command` facility, its platform prerequisite probe (P1 and P3 to P6), and the resource recovery of its scope units. The host files domain `createHostFilesDomain`. The host files provider: one facade per acquisition, quota, original-acquisition query, listing, and settlement. The Service subclass `ExecutionEnvironmentRegistry`, the plugins `filesFacilityPlugin` and `commandFacilityPlugin`, and the plugin factory `createHostFilesPlugin(domain)`.
- Not implemented: the `terminal` provider, the grant root as the contract defines it (the host files root is a different restriction), `files` and `command` on a host that is not Linux, publication of the two Runtime Context blocks, the caller-class check, `definePlugin` for the plugins, and the settlement of old capacity after a process ends (it needs exit evidence from outside the process; it is a remaining duty after M2). See the SPEC [gap list](SPEC.md#明确缺项).
- Not verified: no test covers a second load under one isolate label or a configuration check failure.

No application assembles this package now, and no package depends on it.

## Usage

The package has two entries:

- `@omne-harness/execution-environment-host-local/cordis` holds the plugins. An application assembler loads the service, the three port services, the `files` and `command` declaration plugins, and the host files plugin.
- `@omne-harness/execution-environment-host-local` holds the host files facility, the object identity reader, the host files domain, and the host files provider. It does not depend on Cordis.

```ts
import { Context } from '@deepseek-ai/cordis'
import { createHostFilesDomain } from '@omne-harness/execution-environment-host-local'
import {
  ExecutionEnvironmentRegistry,
  createHostFilesPlugin,
  filesFacilityPlugin,
} from '@omne-harness/execution-environment-host-local/cordis'

// The process host creates the domain once and keeps it across plugin reloads.
const domain = createHostFilesDomain()
const ctx = new Context()
await ctx.plugin(MyEnvironmentAuthority)
await ctx.plugin(MyScopeBinding)
await ctx.plugin(MyRecoveryAuthority)
await ctx.plugin(ExecutionEnvironmentRegistry)
await ctx.plugin(filesFacilityPlugin)
await ctx.plugin(createHostFilesPlugin(domain))
```

`MyEnvironmentAuthority`, `MyScopeBinding`, and `MyRecoveryAuthority` are subclasses of `ExecutionEnvironmentAuthorityService`, `ExecutionScopeBindingService`, and `ExecutionRecoveryAuthorityService` from `@omne-harness/execution-environment-cordis-contract/cordis`. The integrator implements them. The service reads each one from its own load context on each use. Without one, the answer is `unavailable`, never a pass. Calling plugins use the service through the service definition. They do not import this package. The execution adapter names an object with `hostObjectToken` from the root entry. The [usage page](docs/context.md#使用方式) covers assembly, naming, and independent use.

## Contracts

- `src/` owns the public shapes. The [API page](docs/public-api.md) indexes the exports.
- The [SPEC](SPEC.md) owns behavior beyond the types: host provider facts, host file use (accepted), other current behavior, the Service implementation, and the removal order.
- The [host file use section of the architecture page](docs/architecture.md#宿主文件使用) owns the mechanism and the run records.
- The [Cordis page](docs/cordis.md) owns the plugins, the configuration, registration as effect, the removal order, and the IC map.
- [execution-environment-cordis-contract](../execution-environment-cordis-contract/docs/cordis.md) owns the service key and the abstract class.

The fiber of the service plugin owns the service instance and the registry instance. On service removal, the package closes the registry: it refuses new requests, invalidates leases, and retires all providers. When a retirement stays pending, the removal function throws `RetirementPending`. On a fiber unload, Cordis writes that error to `ctx.logger` and the unload completes. A caller that calls the returned removal itself can retry it. The fiber of `filesFacilityPlugin` owns the `files` descriptor registration. The fiber of the host files plugin owns one provider generation. The domain outlives the plugin: a reloaded plugin joins the same domain and sees the original quota use and acquisitions. Removal does not undo bytes already written.

## Design

The root entry has these modules: the host files facility (with the tree operations, the batch operations, and the path checks), the Linux command facility (with its gate script, scope control, and prerequisite probe), the host files domain, and the host files provider. `./cordis` has the Service subclass and three plugins. The outside dependencies are execution-environment-contract, execution-environment, execution-environment-cordis-contract, legal-identity, runtime-context-contract (types only), and `@deepseek-ai/cordis`. The host files facility checks only the object identity. The lease view of the registry checks the tenant and the guard. The domain holds one shared file engine for each files configuration (root, state directory, and bounds); each acquisition gets its own facade with its own admission, its operations in flight, and an owner tag on each descriptor whose close failed. A release, a settlement, or a retirement seals the facade, waits up to `drainBoundMs`, and retries the failed closes. The quota slot returns once, only when nothing is left; otherwise the answer is pending, even with an empty resource list. The registry gate, not the provider, refuses operations with `closed` after the acquisition ledger closes. The Service subclass only forwards calls and manages life. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives three mechanism flows. The [object model](docs/object-model.md) lists the objects.

## Configuration and operation

The Service subclass and `filesFacilityPlugin` accept only an absent value, `null`, or an empty object as configuration. The host files plugin also accepts `drainBoundMs`, a finite number of milliseconds, zero or more. It bounds how long a release, a settlement, or a retirement waits for file operations in flight. The initial value is 10000. It accepts `filesRoot` and `stateDirectory` (absolute paths) and the six bounds of the `command` facility, too. The provider options also take the bounds of listing and searching (`limits`), which the plugin configuration does not accept yet. A pending result writes one diagnostic error to `ctx.logger`. The quota policy is an option of `createHostFilesDomain`, not plugin configuration; its initial value is 64 unsettled acquisitions per tenant and no global bound. The three ports come as the services `executionEnvironmentAuthority`, `executionScopeBinding`, and `executionRecoveryAuthority`. They do not go into the plugin tree. One isolate label holds one service.

The host files facility runs on Node. It checks the object identity with `O_NOFOLLOW`, the device number, and the inode. On a host without `O_NOFOLLOW` (Node on Windows) it checks the final path segment with `lstat` after the open instead. `package.json` declares the engine `>=24`. The platform in the host facts is `process.platform` with `os.release()`. The provider version is the `version` of this package's `package.json`. The prerequisites in the host facts merge the files probe (P2) with the command probe (P1, P3 to P6): one unsatisfied item makes the whole unsatisfied, otherwise one unknown item makes it unknown. The `files` operations beyond read, stat, write, and close, the host files root, and the `command` facility run on Linux only. The command tests that start real processes run only when `OMNE_HOST_COMMAND_LINUX=1` is set.

## Verification

From the repository root, run:

```sh
pnpm --filter @omne-harness/execution-environment-host-local test
```

In this directory, run `pnpm typecheck` for the type check. The sixteen test files hold two hundred seventy tests: 249 fast-tier tests, 20 slow-tier tests, and 1 test that runs only on a host that is not Linux. See [tests/](tests/README.md). File bytes, symbolic links, object replacement, and descriptors use the real file system. Cordis loading uses real Cordis 4.0.4. Authorization decisions use stubs. Some test files hold `open` with a module mock to keep a file operation in flight, or make `FileHandle.close` or `unlink` fail on purpose. The command tests use the real `systemd-run`, gate process, and `systemctl`. Run records: at acceptance, the tests ran only on Node v26.0.0 and darwin. Current run records are in the SPEC [verification section](SPEC.md#组合与验证). No test covers the grant root as the contract defines it, a second load, or a configuration check failure. A passing structure check does not prove behavior.

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
├── flows.md              Mechanism flows F-EEH01 to F-EEH06
├── object-model.md       Service instance, domain, provider, acquisition records, handle generations
├── public-api.md         Export entries and definition index
├── context.md            Assembly, naming, independent use, position
└── cordis.md             Plugins, configuration, registration, removal order, IC map
src/                      index.ts, host-files.ts and its three helpers, host-command.ts and its three helpers, host-domain.ts, host-provider.ts, cordis.ts
tests/                    Sixteen test files and one test helper, fixtures/ is empty now
schema/                   Empty, the configuration schema is in src/cordis.ts
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
