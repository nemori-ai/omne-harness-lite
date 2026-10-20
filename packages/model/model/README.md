# @omne-harness/model

[中文](README_ZH.md)

## Responsibility and status

This member implements standalone execution, credential judgments, admission, stream preservation, instance observation, a product sending boundary, and an isolated in-memory testing entry. Local credential custody belongs to [model-host-local](../model-host-local/README.md). The shared operations and behavior belong to [model-contract](../model-contract/README.md).

| Entry or capability | Current support |
| --- | --- |
| `executeModel` | One standalone execution through an injected transport, with cancellation and resource cleanup |
| Credential judgment and `deliver` | Pure credential judgments. `deliver` delegates to the supplied resolver |
| `createModelRuntime` | Admission, inspection, cancellation intent, original-stream preservation, and instance observation. Settlement and result consumption remain unavailable |
| `createModelSendBoundary` | Receipt and window commits, current credential fence, one start per dispatch, and a single fact consumer through explicit resources |
| `@omne-harness/model/testing` | In-memory Commands and five controlled dependency ports |
| Durable Commands and production managed execution | Not implemented |
| Cordis runtime host and vendor execution | Not implemented in this package |

## Usage

A standalone program or a host that selects this implementation starts from [consumption and construction](docs/context.md). The design of executeModel, createModelRuntime, and the construction parameters is accepted. For their exact shapes, see the [public API design](docs/public-api.md). `executeModel`, `createModelRuntime`, and `createModelSendBoundary` are available from the root entry. The independent capability factories remain unimplemented.

For memory testing, import `createTestModelDependencies` from `@omne-harness/model/testing`. Supply the explicit authority, evidence, owners, and finite limits described in the [testing API](docs/public-api.md#内存测试入口). The returned dependencies can construct the real runtime.

The memory test provider returns sealed and partial result parts with actual trim notices. Its explicit part-count and byte targets group whole parts. An oversized part has its own page. The complete page stays within the admitted capacity. See the [test entry](docs/public-api.md#内存测试入口).

## Contracts

The [implementation specification](SPEC.md) owns the behavior of a single standalone execution and of the construction configuration. The implementation must satisfy the [shared specification](../model-contract/SPEC.md). It must not reduce the identity, sending, custody, and recovery guarantees of that specification.

## Design

The [design index](docs/index.md) covers architecture, flows, internal objects, public entries, consumption, and Cordis assembly. The host assembly design is held in [docs/cordis.md](docs/cordis.md). It does not correspond to any export of this member. model-host-local implements only local credential custody.

## Configuration and operation

The constructor takes Commands, the sending fence, the retry policy, the instance host, and the clock explicitly. The application selects and owns the adapters that it needs. It does not take business parameters from a global Context. The target run implementation does not depend on Cordis. The package manifest does not declare Cordis, proper-lockfile, or model-cordis-contract. The package exposes the root and the isolated `./testing` entry. It has no `./cordis` and no `./execute`. The command `pnpm --filter @omne-harness/model run install-closure` packs this member, installs it in isolation, resolves the entries, and runs a scenario. It writes a report to the path of `--out`. For the way to run it and its scope, see the [test description](tests/README.md#安装闭包). This page does not record run results. The package does not install all vendors or vocabularies automatically.

The trusted host calls `provider.driver.drive` with a stable claim and continuity evidence. The driver publishes the initial instance before preparing and sending. It consumes the sender's original window and stream once. Commands confirm each batch before the driver publishes its complete snapshot. Explicit sending failures remain failures from drive. Unknown writes retain their original inputs.

Consumers call `runtime.instances.connect` and then `handle.observe`. Each observer uses its own current observe permission. Closing an observer keeps the call running. The required positive `observerCheckIntervalMs` controls checks while an observer waits. An instance without a recovered content snapshot ends observation as unavailable.

`outputBatchBytes` and `outputBatchDelayMs` control batch boundaries. Zero delay saves each received fact before another read. Positive delay permits aggregation. A timer requests a flush, but a pending read stays in its original window. If that read remains silent, the received prefix can remain unpublished indefinitely. The delay does not guarantee maximum visibility latency.

`observerBufferBytes` bounds logical registrations and unread notifications. A registration costs 64 bytes. Each unseen version costs 32 bytes per observer. Insufficient registration capacity or excessive lag ends that observer as unavailable. Shared snapshot contents are not copied into per-observer queues. One observer allows one pending next. Concurrent next ends that observer. Production scheduling, settlement, result consumption, and cross-process recovery remain unimplemented.

## Sending through explicit resources

Construct `createModelSendBoundary` with Commands, a synchronous `SendCoordinator`, a `CredentialPort`, `SendResources`, and a positive `maxRetainedAttempts`. The [construction types](src/send/types.ts) define these dependencies. The sender commits the materialization receipt and receive window before the final fence. The coordinator rechecks current qualification and claims the dispatch before credential resolution and synchronous start. All qualification changes and sender instances must share that coordinator's state owner.

Factory credentials require an explicit trusted registration of the exact profile, supplier, recipient, model, official origin, current lack of a tenant binding, and a human-named query ID. A request's factory tag grants no permission. Tenant resolution never falls back to factory credentials. The resource holds its credential value only for the synchronous start.

Unknown writes retain their original operation, expected revision, resource, and input. Repeated sends query and replay the original write. If start returned facts but its record is unconfirmed, the sender retains those facts without reading or closing them. Once the record is confirmed, it hands out the original stream once. Signal cancellation reaches the transport. Exhaustion or consumer return releases materialized, prepared, and acquired resources in reverse order. Safe exceptions expose release failures. Unresolved attempts and failed releases retain capacity; there is no automatic expiry.

The scripted testing assembly uses this same sender. Explicit `sending` options supply credential and source checks. Missing configuration is unavailable. This controlled memory assembly proves no real vendor, durable storage, production host, or cross-process recovery guarantee.

A started result carries the confirmed original `window` and its single `facts` stream. Consumers pass `result.window` to Commands.preserve with the original execution and dispatch. The window grants no access rights. The runtime driver consumes this original stream and publishes only confirmed snapshots.

## Verification

Run `pnpm --filter @omne-harness/model typecheck`, `pnpm --filter @omne-harness/model test`, and `make docs-check`. The execution tests call the public entry with the scripted transport and controlled failure providers. They cover one send, receipt matching, cancellation, stream loss, and cleanup. The six transport conformance checks test the provider directly. The other tests cover the credential judgment (including rejection of every tenant that was not minted), the export set of the root entry, the fact that the old subpaths do not resolve, and the fact that the manifest has no Cordis-type dependency. The tests of custody, persistence, and the Cordis plugin are in model-host-local. The memory tests cover local Commands transitions, fault injection, result reads, and resource release. These tests do not prove durable custody, real vendors, or production managed execution. For the shared protocol and the type consumption duties, see the [contract verification](../model-contract/verification/index.md).

## Maintenance

When you change the construction or an algorithm, update the [documentation registration](documentation.json), the real consumers, and the verification. For resource navigation, see the [package index](index.md). Resources that are not implemented keep their actual status.

## Boundary with model-contract

The domain contract belongs to the [contract entry](../model-contract/docs/public-api.md). This member maintains only the implementation functions and the construction shapes. The [shared SPEC](../model-contract/SPEC.md) records the shared business behavior. This member does not change its scope and does not reduce its guarantees.

## Directory structure and documentation roles

The skeleton follows [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) and the template `typescript-package@3.0.0` (see the [generated tree](../../../docs/package-organization.md#完整生成树)). A directory that does not apply to this package states in its README why it does not apply. A directory that exists does not mean that the function is implemented.

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
package.json              Package manifest
docs/                     Six topics: architecture, flows, object-model, public-api, context, cordis
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each fixed directory has a README and an index. The source, build, and test configuration follow the actual files. Build output and dependency directories are not part of the documentation skeleton.

| Entry | Documentation role |
| --- | --- |
| [Design](docs/index.md) | Architecture, flows, objects, interfaces, consumption, and assembly |
| [Source](src/index.md) | Actual public exports and internal code |
| [Tests](tests/index.md), [fixtures](tests/fixtures/index.md) | Executable assertions and fixed inputs |
| [Schema](schema/index.md) | External data formats and published identity |
| [Continuing verification](verification/index.md), [models](verification/models/index.md), [proofs](verification/proofs/index.md) | Properties, assumptions, conformance, and verification resources |
| [Design decisions](adr/index.md) | Implementation choices with continuing consumers |
| [Examples](examples/index.md) | Runnable consumption |
| [Runtime resources](resources/index.md) | Assets, sources, and loading responsibility |
| [Independent acceptance](acceptance/index.md) | Independent scenarios, environments, and criteria |

## Standalone consumption entry

For the implemented exports of the credential judgment, see the [public entry](docs/public-api.md#已实现的凭据入口). For the way to call them, see the [consumption guide](docs/context.md#独立消费入口). For the use of the local vault and the plugin, see [model-host-local](../model-host-local/docs/context.md). The credential judgment has behavior tests. The acceptance of other run designs does not mean that they are implemented.
