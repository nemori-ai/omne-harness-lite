# @omne-harness/tool

[中文](README_ZH.md)

The Tool implementation without Cordis. The root entry exports independent execution: `createIndependentToolScope` builds an execution scope with a local receiver, explicit limits and an in-memory wait history, and `executeTool` runs one executor inside such a scope. It also exports the ledger factory `createToolLedger` with the store port `ToolLedgerStore` and the guard snapshot `ToolLedgerGuards`, the runtime factory `createToolRuntime` with its construction shapes `ToolDependencies` and `ToolConfiguration`, and a `./testing` entry with the non-durable store `createMemoryToolLedgerStore` and dependency assembly `createTestToolDependencies`.

## Responsibility and status

This package implements the contract of `@omne-harness/tool-contract`. It manages concurrency, waits, cancellation and state, so two implementations may differ here and the package is not part of the contract. It does not depend on Cordis, so an independent program can execute a tool without a Cordis install. Independent execution is implemented. The runtime implements a part of the managed paths. The next section lists the five tiers of support. The exact support scope is in [SPEC.md](SPEC.md#当前范围).

## Support range

The checkout scope and the cross-package table are in [the group support range](../README.md#支持范围). This section states the part of this package. The verification scope tells what the tests check. It does not tell that behavior outside the tests holds.

| Tier | State in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: the construction shapes `ToolDependencies` and `ToolConfiguration` with the ledger shapes around them, the store port `ToolLedgerStore` with its record types, the guard snapshot `ToolLedgerGuards`, `ExecuteToolFailure`, and the host helpers `recordKey`, `isTenantShape` and `canonicalDigest` | Root entry | `tests/public-entry.spec.ts` checks the root exports, the import graph, the manifest and the Cordis routes. `*.spec-d.ts` check the signatures |
| Pure contract functions implemented | None here. The contract functions are in `tool-contract` | None | None |
| Independent execution implemented | `createIndependentToolScope` and `executeTool`. The scope uses a local receiver, explicit limits and an in-memory wait history. Receipts are `local` only | Root entry | The P11 rules of the scope and the wrapper, checked with controllable receiver and provider stand-ins. No real environment. No Cordis |
| Runtime paths implemented | `createToolLedger` and `createToolRuntime`. A call to a known-unavailable tool, or with complete but illegal arguments, is admitted idempotently and settles with no environment or executor. `lookup` and `queryOperation` find it, `readResult` reads it page by page, `releaseDelivery` releases it on either handoff path, and `account` accounts it. For a real tool, `admit` accepts the call and the driver takes it to a recorded start: environment preparation, the FIFO queue in the scope and limit that the caller fixed, the start guard, the start fence and `start`. A foreground start begins a timing segment through the supplied `ToolClock.begin`. A start that is refused before it happens settles as `unavailable` with `effect: 'not-started'`. `inspect` forwards to the Catalog port that the assembly passes in. This package has no Catalog provider | Root entry. `./testing` for the non-durable store and explicit dependency assembly | The managed-path specs consume the contract source entries and run over the non-durable store. They use environment, executor binding, start authority and clock stand-ins. `tool-host-local` runs this runtime with the real local start coordinator. One process only. Durability is not covered |
| Hosts and providers not yet delivered | The facts and the settlement of a started execution, and the release of its slot. Control, timing after the segment begins (elapsed time, deadlines and pauses), waits, process observation, recovery, drain and handover. A durable ledger store ([#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)). Real environments ([#278](https://github.com/nemori-ai/omne-harness-lite/issues/278)). The host clock, the binding registry and the Catalog. The Cordis plugins | None | None |

A call that reaches a recorded start stays `running` and holds its slot. Nothing releases the slot yet.

Operations that are not delivered answer a named `unsupported` failure. The `reason` names the operation and the increment. No operation throws or answers an empty success.

| Increment | Operations of the runtime facade and the provider | Ledger commands of the same increment |
| --- | --- | --- |
| `controls` | `control` | `recordControl` |
| `waits, decisions and resources` | `acceptDecision`, `acceptResource`, `readWait` | `openWait`, `attachRegistration`, `attachResource`, `recordResponse`, `closeWait` |
| `process observation and diagnostics` | `readProcess`, `readDiagnostics` | `preserveProcess`, `recordLateFact`, `recordLateResult` |
| `execution facts and release` | `content.read`, `content.raw` | `receiveFacts`, `recordFactAcknowledgement`, `preserveResult`, `recordAccount`, `planRelease`, `recordRelease`, `recordTask` |
| `recovery scan` | `recover` | `scanPending`, `claim`, `settleLost` |
| `drain and handover` | `quiesce`, `inspectDrain`, `handover` | None |
| `checkpointed executors` | None | `prepareResume`, `planSuspension`, `suspend` |
| `program executors` | None | `recordScheduling` |

## Usage

An independent program or an application assembly depends on this package and on `@omne-harness/tool-contract`. Production code in other domains depends only on `@omne-harness/tool-contract`. Tests in other domains may add `@omne-harness/tool/testing` as a development dependency. It exports the non-durable store `createMemoryToolLedgerStore` and the assembly described below.

An independent program calls `createIndependentToolScope({ limits, signal, process, waits })`. It gets a `ToolExecutionScope` or a field rejection when a limit is not a positive safe integer. It then calls `executeTool(argumentsValue, executor, environment, scope)`. The executor receives `scope.context` and may `emit` process updates and `wait` on Ask or resource protocols. A null `process` makes `emit` return `unsupported`; a null `waits` does the same for `wait`. The result is the executor's value, or a failure with `effect: 'not-started'` (the scope was refused, the author did not run) or `effect: 'unknown'` (the author ran, then threw or returned with the scope unable to settle).

### `./testing`

`createTestToolDependencies<P>(input)` creates a fresh store, ledger and seven existing contract memory doubles. It returns `dependencies`, `store`, `ledger`, `doubles` and `durability: 'none'`. The dependencies can be passed directly to `createToolRuntime`. Construction does not install a driver or schedule work until the caller constructs that runtime.

The caller supplies `instance`, `guards`, `configuration`, `instances`, `catalog`, `children` and `bindingsFor(executor)`. These inputs have no defaults. The guards own tenant qualification, source and grant checks, result construction and result policy. The factory uses `guards.policy` for the runtime too.

The caller owns the host, catalog, child coordination and executor resolution because those ports have no contract memory double. `bindingsFor` receives the executor binding and returns the distinct `ToolBindings` resolution port. It must make its own resolution and authorization choices.

```ts
import { createToolRuntime, type ToolConfiguration } from '@omne-harness/tool'
import {
  createTestToolDependencies,
  type TestToolDependenciesInput,
} from '@omne-harness/tool/testing'

export function runtimeForTest<P>(
  input: TestToolDependenciesInput<P> & { configuration: ToolConfiguration },
) {
  const assembly = createTestToolDependencies(input)
  const provider = createToolRuntime(assembly.dependencies, input.configuration)
  assembly.doubles.clock.controls.advance(10)
  return { ...assembly, provider }
}
```

The block type is fixed to `ContentBlock`, and the environment type is fixed to the contract double's `MemoryEnvironment`. `doubles` retains the original executor, environment, authority, clock, decisions, resources and custody objects, including their controls. Each call creates separate objects and records. The factory invents no tenant, principal, authorization or runtime identity. Ledger construction errors and `bindingsFor` exceptions propagate to the caller.

These doubles are for tests only. They provide no durability, real execution environment or production host. The factory does not add runtime operations beyond the support table, and it creates no timers or disposal protocol. The caller owns the runtime and any resources supplied through its ports.

## Contracts

Behavior belongs to the [contract SPEC](../tool-contract/SPEC.md), P11 for the independent path. [SPEC.md](SPEC.md) states how this implementation meets it and fixes the choices the contract leaves open: failure kinds, the byte encoding, the wait history reservation and the barrier rules. The G1, G2 and G8 decisions in the contract SPEC place the factories here.

## Design

Dependency direction: `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`. This package does not depend on `tool-cordis-contract`, `tool-host-local` or Cordis. It obtains `Outcome` from the dependency-free `@omne-harness/operation-result`. A test verifies that its production install closure excludes Cordis. Durability depends on the ledger store provider; the independent scope promises only `local` receipts.

## Configuration and operation

`ToolConfiguration` carries the author limits and the runtime budgets. `ToolDependencies` names each port the runtime consumes. The caller supplies both at construction. An independent scope takes its limits directly in `IndependentToolScopeInput`.

## Verification

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/tool test` builds the package and runs the tests. The tests check the root exports, the import graph, the manifest, the Cordis routes, the P11 rules of the independent scope and wrapper, the ledger rules, and the way of a real call to its start over the non-durable store with stand-in environment, binding and start authority. The local start coordinator of `tool-host-local` is tested with this runtime in that package. [tests/README](tests/README.md) maps each rule to its test.

Vitest maps exactly `@omne-harness/tool-contract`, `@omne-harness/tool-contract/binding` and `@omne-harness/tool-contract/testing` to their source entries. Business tests therefore run while a parallel contract build removes and recreates `dist`. A [controlled reproduction](https://github.com/nemori-ai/omne-harness-lite/issues/424#issuecomment-6271941775) holds that build after removal and runs the managed-start and queue-release tests. Source aliases do not verify installed contract JavaScript exports. The Tool build and `public-entry.spec.ts` still check Tool artifacts, declaration import graphs, manifest dependencies and the production install closure.

## Maintenance

A change to `ToolDependencies` or `ToolConfiguration` changes `tool-host-local` and every assembly that constructs the runtime. A change to the failure kinds or barrier rules in [SPEC.md](SPEC.md) changes every independent program that reads them.
