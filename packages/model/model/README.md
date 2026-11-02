# @omne-harness/model

[中文](README_ZH.md)

## Responsibility and status

This member implements the items in the table below. They include standalone execution, credential judgments, admission, stream preservation, instance observation and call settlement. They also include result reading, processed ACK, a product sending boundary, and an isolated in-memory testing entry. Local credential custody belongs to [model-host-local](../model-host-local/README.md). The shared operations and behavior belong to [model-contract](../model-contract/README.md).

| Entry or capability                               | Current support                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executeModel`                                    | One standalone execution through an injected transport, with cancellation and resource cleanup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Credential judgment and `deliver`                 | Pure credential judgments. `deliver` delegates to the supplied resolver                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `createModelRuntime`                              | Admission, inspection, cancellation intent, original-stream preservation, instance observation, and confirmed call settlement within the boundaries below. Result reading and processed ACK are implemented. Retained ACK remains unavailable                                                                                                                                                                                                                                                                                                                                                                                         |
| `createModelSendBoundary`                         | Receipt and window commits, current credential fence, one start per dispatch, and a single fact consumer through explicit resources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `createModelPreparationResources`                 | The production preparation lease. It holds one family binding for each profile supplier. It reads the call facts of a declared lineage once, with the access of the caller. It judges the anchor and the sources, and each budget reports the calibration verdict. Without a lineage, each meter gives the same result as the family meter. After release, every meter of the lease is unavailable. Request Context does not fill `lineage` yet ([#638](https://github.com/nemori-ai/omne-harness-lite/issues/638)). Until it does, a real measurement through Request Context gives a full measurement or a named unavailable result |
| `@omne-harness/model/testing`                     | In-memory Commands and five controlled dependency ports. A dispatch record keeps the message identities of its fixed request after cleanup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Durable Commands and production managed execution | Durable Commands: `createSqlModelCommands` of [`@omne-harness/model-storage-sql`](../model-storage-sql/README.md) puts the shared core of `./commands` on SQL storage. It keeps only the latest snapshot, so a long reply does not use more capacity for each batch. The accounts suite gives the same results as on the memory Commands. Its known differences, the send coordinator and the real provider are in its SPEC. Production managed execution: not implemented. A known limit of the memory Commands: each confirmed snapshot counts against the call capacity                                                            |
| Cordis runtime host and vendor execution          | Not implemented in this package                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Usage

Admission uses the shared `judgeAdmit` synchronously before queuing. It rejects malformed input without allocating a call or capacity. The [input contract](../model-contract/SPEC.md#封闭输入判断) defines frozen payload, preserved access identity and parser limits. Lesson 01 teaches admission judging. Lesson 04 passes the pure request judge before a supplier reports input-over-limit.

A standalone program or a host that selects this implementation starts from [consumption and construction](docs/context.md). The design of executeModel, createModelRuntime, and the construction parameters is accepted. For their exact shapes, see the [public API design](docs/public-api.md). `executeModel`, `createModelRuntime`, and `createModelSendBoundary` are available from the root entry. The independent capability factories remain unimplemented.

For memory testing, import `createTestModelDependencies` from `@omne-harness/model/testing`. Supply the explicit authority, evidence, owners, and finite limits described in the [testing API](docs/public-api.md#内存测试入口). The returned dependencies can construct the real runtime.

The memory test provider returns sealed and partial result parts with actual trim notices. Its explicit part-count and byte targets group whole parts. An oversized part has its own page. The complete page stays within the admitted capacity. See the [test entry](docs/public-api.md#内存测试入口).

The caller encodes and saves the invocation reference before admit. Inspect, connect and beginRead use that reference with current Access. Lesson 05 saves an operation reference with the original ACK result and evidence. See the [shared reference contract](../model-contract/SPEC.md#可保存调用引用).

A request assembler measures through a preparation lease. It constructs `createModelPreparationResources` with the Commands, a family binding source, a supplier port and `maxCitedCalls`. Then it acquires a lease with its access, the profile and an optional `lineage`. The lease reads the dispatch records of the calls that the lineage names. It reads each call once, with that access. Before each family measurement, it judges the anchor and the sources. The budget reports the verdict in `calibration`. The rules are in [SPEC, "准备资源与校准租约"](SPEC.md#准备资源与校准租约).

## Run the learning examples

Use Node.js 24 or later and pnpm 10.28.1 in a repository checkout. These workspace packages are private. The examples do not require a vendor account, network access, or credentials.

From the repository root, prepare a fresh checkout:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @omne-harness/model... -r run build
pnpm --filter @omne-harness/model examples
```

If dependencies are already prepared and the lockfile did not change, reuse them. Rebuild the packages after source changes. The examples import the public package entries and execute their built code.

Read and run these lessons in order. Each lesson also runs independently:

| Script                                                            | What you do and observe                                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-submit-and-query.ts](examples/01-submit-and-query.ts)         | Call `admit` and `inspect`. Handle `Reply`, `Admission`, `Lookup`, and accepted `CallState`. Transport starts remain zero.                                                             |
| [02-observe-and-settle.ts](examples/02-observe-and-settle.ts)     | Construct the runtime, start its trusted driver, connect a live handle, and receive `snapshot` then `changed`. Inspect `Settlement` and its original termination, version, and source. |
| [03-output-limit.ts](examples/03-output-limit.ts)                 | Supply a real scripted `trim` fact. Distinguish `completed/limit` from a failure.                                                                                                      |
| [04-input-over-limit.ts](examples/04-input-over-limit.ts)         | Inspect `failed/input-over-limit` and the supplier's `reported` fields. Preserve unknown values as `null`.                                                                             |
| [05-read-and-acknowledge.ts](examples/05-read-and-acknowledge.ts) | Read sealed and partial parts across pages, close the read, and submit consumer-owned completion evidence. Recognize the original ACK.                                                 |

For one lesson, run `pnpm --filter @omne-harness/model exec node --experimental-strip-types examples/02-observe-and-settle.ts`. Expected output and the shared assembly are explained in the [example guide](examples/README.md). The scripts keep their API inputs and result branches visible. [example-support.ts](tests/example-support.ts) explains each controlled adapter.

Admission records responsibility, not a send. `drive` reports local progress and resource release. `inspect` returns the authoritative business state. A successful drive can produce a failed business termination. A failed release can coexist with a confirmed Settlement. Close the observer and withdraw the host publication separately. Neither action acknowledges or cancels the call.

## Settlement support boundaries

The driver settles original, confirmed `completed`, `completed/limit`, `input-over-limit`, and failures that need no new retry decision. A confirmed upstream interruption needs the control from the same preserve receipt. A persisted control before any dispatch can settle without sending. Full details belong to the [implementation specification](SPEC.md#已实现的调用收场).

The driver retains pending operations and inputs in the current process. It does not infer an original termination from mutable dispatch history. Uncontrolled interruption, sender `not-started`, retry-policy decisions, and recovery without original terminal evidence remain unsupported. No default stop decision is supplied. The fifth lesson reads the result and submits processed ACK. Retained ACK, durable storage, production hosts, and real vendors remain unsupported.

## Contracts

The [implementation specification](SPEC.md) owns the behavior of a single standalone execution and of the construction configuration. The implementation must satisfy the [shared specification](../model-contract/SPEC.md). It must not reduce the identity, sending, custody, and recovery guarantees of that specification.

## Design

The [design index](docs/index.md) covers architecture, flows, internal objects, public entries, consumption, and Cordis assembly. The host assembly design is held in [docs/cordis.md](docs/cordis.md). It does not correspond to any export of this member. model-host-local implements only local credential custody.

## Configuration and operation

The constructor takes Commands, the sending fence, the retry policy, the instance host, and the clock explicitly. The application selects and owns the adapters that it needs. It does not take business parameters from a global Context. The target run implementation does not depend on Cordis. The package manifest does not declare Cordis, proper-lockfile, or model-cordis-contract. The package exposes the root and the isolated `./testing` entry. It has no `./cordis` and no `./execute`. The command `pnpm --filter @omne-harness/model run install-closure` packs this member, installs it in isolation, resolves the entries, and runs a scenario. It writes a report to the path of `--out`. For the way to run it and its scope, see the [test description](tests/README.md#安装闭包). This page does not record run results. The package does not install all vendors or vocabularies automatically.

The trusted host calls `provider.driver.drive` with a stable claim and continuity evidence. The driver publishes the initial instance before preparing and sending. It consumes the sender's original window and stream once. Commands confirm each batch before the driver publishes its complete snapshot. Explicit sending failures remain failures from drive. Unknown writes retain their original inputs.

Consumers call `runtime.instances.connect` and then `handle.observe`. Each observer uses its own current observe permission. Closing an observer keeps the call running. The required positive `observerCheckIntervalMs` sets the interval between two permission reads of a waiting observer. An instance without a recovered content snapshot ends observation as unavailable.

`outputBatchBytes` and `outputBatchDelayMs` control batch boundaries. Zero delay saves each received fact before another read. Positive delay permits aggregation. A timer requests a flush, but a pending read stays in its original window. If that read remains silent, the received prefix can remain unpublished indefinitely. The delay does not guarantee maximum visibility latency.

`observerBufferBytes` bounds logical registrations and unread notifications. A registration costs 64 bytes. Each unseen version costs 32 bytes per observer. Insufficient registration capacity or excessive lag ends that observer as unavailable. Shared snapshot contents are not copied into per-observer queues. One observer allows one pending next. Concurrent next ends that observer. Production scheduling, retained ACK, and cross-process recovery remain unimplemented.

## Sending through explicit resources

Construct `createModelSendBoundary` with Commands, a synchronous `SendCoordinator`, a `CredentialPort`, `SendResources`, and a positive `maxRetainedAttempts`. The [construction types](src/send/types.ts) define these dependencies. The sender commits the materialization receipt and receive window before the final fence. The coordinator rechecks current qualification and claims the dispatch before credential resolution and synchronous start. All qualification changes and sender instances must share that coordinator's state owner.

Factory credentials require an explicit trusted registration. The registration names the exact profile, supplier, recipient, model and official origin. It also states that no tenant binding exists now, and it gives a human-named query ID. A request's factory tag grants no permission. Tenant resolution never falls back to factory credentials. The resource holds its credential value only for the synchronous start.

Unknown writes retain their original operation, expected revision, resource, and input. Repeated sends query and replay the original write. If start returned facts but its record is unconfirmed, the sender retains those facts without reading or closing them. Once the record is confirmed, it hands out the original stream once. Signal cancellation reaches the transport. Exhaustion or consumer return releases materialized, prepared, and acquired resources in reverse order. Safe exceptions expose release failures. Unresolved attempts and failed releases retain capacity. They do not expire automatically.

The scripted testing assembly uses this same sender. Explicit `sending` options supply the credential and source rules. Missing configuration is unavailable. This controlled memory assembly proves no real vendor, durable storage, production host, or cross-process recovery guarantee.

A started result carries the confirmed original `window` and its single `facts` stream. Consumers pass `result.window` to Commands.preserve with the original execution and dispatch. The window grants no access rights. The runtime driver consumes this original stream and publishes only confirmed snapshots.

## Verification

Run these commands from the repository root. The package requires Node.js >=24 and pnpm 10.28.1. Each run report identifies the Node.js version actually tested.

```sh
pnpm turbo run typecheck --filter=@omne-harness/model
pnpm turbo run test --filter=@omne-harness/model
pnpm turbo run test:fast --filter=@omne-harness/model
pnpm turbo run test:slow --filter=@omne-harness/model
pnpm run check:docs
```

The Turbo test tasks build this package and its dependencies before they run the selected tests. The `typecheck` task does not build. Direct `pnpm --filter @omne-harness/model test` does not build, so its required build output must already exist. The `test:fast` and `test:slow` tasks select the fast and slow layers, respectively.

The full `test` runs Vitest, then executes the five learning scripts if Vitest succeeds. Neither test layer runs examples automatically. With build output ready, run `pnpm --filter @omne-harness/model examples` separately. Acceptance remains a separate script, scheduled by the [test runner](../../../tools/test-runner/README.md). Run `pnpm run acceptance` from the repository root.

The execution tests call the public entry with the scripted transport and controlled failure providers. They cover one send, receipt matching, cancellation, stream loss, and cleanup. The preparation tests drive the real memory Commands and a stub family meter that records the calibration it receives. They cover these items:

- The anchor hit, also after cleanup released the request material.
- The same result for a call of another tenant and for a missing call.
- Each anchor miss reason and each withheld source reason.
- The reads with the access of the caller.
- The acquire that gets all bindings or none.
- The idempotent release.

A conformance test runs the six transport obligations against the provider directly. The other tests cover these items:

- The credential judgment, including the rejection of each tenant that was not minted.
- The export set of the root entry.
- The old subpaths, which do not resolve.
- The manifest, which has no Cordis-type dependency.

The tests of custody, persistence, and the Cordis plugin are in model-host-local. The memory tests cover local Commands transitions, fault injection, result reads, and resource release. These tests do not prove durable custody, real vendors, or production managed execution. For the shared protocol and the type consumption duties, see the [contract verification](../model-contract/verification/index.md).

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

| Entry                                                                                                                            | Documentation role                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Design](docs/index.md)                                                                                                          | Architecture, flows, objects, interfaces, consumption, and assembly                                 |
| [Source](src/index.md)                                                                                                           | Actual public exports and internal code                                                             |
| [Tests](tests/index.md), [fixtures](tests/fixtures/index.md)                                                                     | Executable assertions and fixed inputs                                                              |
| [Schema](schema/index.md)                                                                                                        | External data formats and published identity                                                        |
| [Continuing verification](verification/index.md), [models](verification/models/index.md), [proofs](verification/proofs/index.md) | Properties, assumptions, conformance, and verification resources                                    |
| [Design decisions](adr/index.md)                                                                                                 | Implementation choices with continuing consumers                                                    |
| [Examples](examples/index.md)                                                                                                    | Runnable consumption                                                                                |
| [Runtime resources](resources/index.md)                                                                                          | Assets, sources, and loading responsibility                                                         |
| [Continuous acceptance](acceptance/index.md)                                                                                     | Three product scenarios through the built runtime, with controlled dependencies and explicit limits |

## Standalone consumption entry

For the implemented exports of the credential judgment, see the [public entry](docs/public-api.md#已实现的凭据入口). For the way to call them, see the [consumption guide](docs/context.md#独立消费入口). For the use of the local vault and the plugin, see [model-host-local](../model-host-local/docs/context.md). The credential judgment has behavior tests. The acceptance of other run designs does not mean that they are implemented.
