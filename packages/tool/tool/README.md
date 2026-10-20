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
| Runtime paths implemented | `createToolLedger` and `createToolRuntime`. The internal ledger admits each operation idempotently. A call to a known-unavailable tool, or with complete but illegal arguments, settles with no environment or executor. `queries.lookup` and `queries.queryOperation` find it, `readResult` reads it page by page, `releaseDelivery` releases it on either handoff path, and `account` accounts it. For a real tool, `invoke` allocates a call reference and accepts the payload and the driver takes it to a recorded start: environment preparation, the FIFO queue in the scope and limit that the caller fixed, the start guard, the start fence and the live-only binding `start`. A failed or throwing binding is reconciled against the original authority. Only permanent exclusion permits an unavailable terminal. An unknown receipt queries the original binding and keeps the task and slot. A foreground start begins a timing segment through the supplied `ToolClock.begin`. A start that is refused before it happens settles as `unavailable` with `effect: 'not-started'`. `inspect` forwards to the Catalog port that the assembly passes in. This package has no Catalog provider | Root entry. `./testing` for the non-durable store and explicit dependency assembly | The managed-path specs consume the contract source entries and run over the non-durable store. They use environment, start authority and clock stand-ins. A trusted test bridge stages capsule evidence and consumes the permit before calling the contract memory executor. Tests count method attempts, unique acceptances and actual executor launches separately. `tool-host-local` runs this runtime with the real local start coordinator. One process only. Durability is not covered |
| Hosts and providers not yet delivered | Automatic runtime fact reading, the settlement of a started execution, and the release of its slot. Control, timing after the segment begins (elapsed time, deadlines and pauses), waits, process observation, recovery, drain and handover. A durable ledger store ([#280](https://github.com/nemori-ai/omne-harness-lite/issues/280)). Real environments ([#278](https://github.com/nemori-ai/omne-harness-lite/issues/278)). The host clock, the binding registry and the Catalog. The Cordis plugins | None | None |

A call that reaches a recorded start stays `running` and holds its slot. The ledger accepts process/final custody through its trusted `commands.receiveFacts` entry. The ledger records source confirmations through `commands.recordFactAcknowledgement`. Automatic runtime fact reading and physical release are not implemented. Repeating `invoke` with the same tenant, complete consumer and fixed request recovers the original reference and admission receipt. A new execution needs a new consumer. Internal recovery advances the original call and start.

A binding failure uses a separate `/start-failed` ledger receipt. A driver that reads a committed receipt does not call start again. The current driver also retains an unconfirmed failure and retries that receipt.

If a crash loses the observation before the receipt commits, a compliant authority must exclude the old ticket and delayed requests. Only then can the original start obtain a new permit for its first acceptance. This window can repeat an RPC method call, but cannot replay an accepted execution effect.

A concurrent driver with an old negative read can still call start after the marker commits. The authority orders consume against permanent exclusion. Consume first preserves the running execution and its slot. Exclusion first prevents a new acceptance and launch. The marker grants no dispatch rights.

This scope replaces the earlier global method-count promise under the [revision 2 decision](https://github.com/nemori-ai/omne-harness-lite/issues/430#issuecomment-6285621097). The old counterexample remains valid against that superseded promise.

A general unknown execution state is not a failure marker. The in-memory hints provide no durability. This increment does not persist or expose the original binding exception text through `run`. `readDiagnostics` remains unsupported.

Preflight and query ports return named failures unchanged. An unknown exception rejects `run` with the same error object. It keeps the start task and slot without an automatic retry or terminal write. A `binding.start` exception still requires reconciliation because execution may already be accepted. If the next query throws, its error reaches the caller while the unconfirmed binding failure remains. Serial cleanup creates no additional unhandled rejection.

Operations that are not delivered answer a named `unsupported` failure. The `reason` names the operation and the increment. No operation throws or answers an empty success.

| Increment | Operations of the runtime facade and the provider | Ledger commands of the same increment |
| --- | --- | --- |
| `controls` | `control` facade delegates with a fresh operation; the real ledger returns unsupported | `control`, `recordControl` |
| `waits, decisions and resources` | `queries.readWait`; trusted responses stay internal | `openWait`, `attachRegistration`, `attachResource`, `recordResponse`, `closeWait` |
| `process observation and diagnostics` | `readProcess`, `readDiagnostics` | `preserveProcess`, `recordLateFact`, `recordLateResult` |
| `execution facts and release` | `content.read`, `content.raw` | `preserveResult`, `recordAccount`, `planRelease`, `recordRelease`, `recordTask` |
| `recovery scan` | `recover` | `scanPending`, `claim`, `settleLost` |
| `drain and handover` | `quiesce`, `inspectDrain`, `handover` | None |
| `checkpointed executors` | None | `prepareResume`, `planSuspension`, `suspend` |
| `program executors` | None | `recordScheduling` |

### Ledger fact custody

A trusted Tool producer calls `ledger.commands.receiveFacts({ principal, tenant, call, start, batch })` after the original start. This entry accepts process and final facts. It commits the complete events, process current blocks or a settle task, the original batch receipt, stream cursor and a fact-ack task in one call transaction. `loadRecovery.streams` exposes the saved cursor and pending receipts. This is a ledger entry. The runtime driver does not yet consume the stream automatically.

Batch and event identities include the original start operation and source owner. Changing the source evidence cannot bypass deduplication. A repeated equal batch returns its original receipt without a write. Gaps, reused cursor boundaries and conflicting inputs fail. Cursors are opaque. A batch can contain multiple events. An unknown custody commit returns `unavailable` and asks the producer to resubmit the original batch.

Process sequence values are non-negative decimal integers. Append supports cumulative text and thinking text with a fixed block identity and visibility. Other content kinds require replace. Mode is fixed after opening, and closed blocks reject new updates. Historical equal updates remain recognisable. Trim keeps its count and reason and does not remove the original events. Process observation is not implemented.

A batch that contains wait, continued, account or program-scheduling returns `unsupported` without saving any part. The source retains responsibility. A final creates one settle task without settling the call or releasing its slot. Trusted recovery consumers use `ledger.facts.read({ principal, tenant, call, basis })` with that task's exact evidence to recover a `SavedFact`, including raw, result, terminal and effect. Reads require current recover qualification and return a detached value.

The assembly must restrict the `write` action to trusted Tool producers. Source text and evidence shape do not authenticate an external producer. `ToolLedgerGuards.factAcknowledgements` is required. Construct it with `createToolFactAcknowledgementGuard(bindings)` using the same bindings object as the runtime. The guard resends the original receipt through `bindings.recover.acknowledge` and compares the complete confirmation. The source and confirmation owners may differ.

`recordFactAcknowledgement` checks current write qualification, the original operation and the complete saved receipt before source verification. It commits the confirmation, operation receipt, pending acknowledgement removal and fact-ack removal together. Unknown source or store outcomes retain the original recovery responsibility. Equal operation retries return their original progress without another source call. A new equal acknowledgement operation saves its own queryable receipt.

The non-durable tests use a real memory execution source, ledger and recovery binding. They cover lost ACK replies, unknown commits, forged confirmations, input mutation and operation exclusion. They do not prove automatic reading, production durability or resume support.

## Usage

An independent program or an application assembly depends on this package and on `@omne-harness/tool-contract`. Production code in other domains depends only on `@omne-harness/tool-contract`. Tests in other domains may add `@omne-harness/tool/testing` as a development dependency. It exports the non-durable store `createMemoryToolLedgerStore` and the assembly described below.

An independent program calls `createIndependentToolScope({ limits, signal, process, waits })`. It gets a `ToolExecutionScope` or a field rejection when a limit is not a positive safe integer. It then calls `executeTool(argumentsValue, executor, environment, scope)`. The executor receives `scope.context` and may `emit` process updates and `wait` on Ask or resource protocols. A null `process` makes `emit` return `unsupported`; a null `waits` does the same for `wait`. The result is the executor's value, or a failure with `effect: 'not-started'` (the scope was refused, the author did not run) or `effect: 'unknown'` (the author ran, then threw or returned with the scope unable to settle).

### `./testing`

`createTestToolDependencies<P>(input)` creates a fresh store, ledger and seven existing contract memory doubles. It returns `dependencies`, `store`, `ledger`, `doubles` and `durability: 'none'`. The dependencies can be passed directly to `createToolRuntime`. Construction does not install a driver or schedule work until the caller constructs that runtime.

The caller supplies `operationIdentities`, `sourceIssuer`, `guards`, `configuration`, `instances`, `catalog`, `children` and `bindingsFor(executor)`. These inputs have no defaults. The guards own tenant qualification, source and grant checks, result construction and result policy. The factory uses `guards.policy` for the runtime too. Its guard input omits `factAcknowledgements`; the factory constructs that guard from the single `bindingsFor` result and passes that same bindings object to the runtime.

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

An ordinary caller saves the complete consumer and fixed request before calling `runtime.invoke({ principal, tenant, request })`. Repeating the same tenant, complete consumer and request recovers the original reference and admission receipt. A new execution needs a new consumer. `queries.lookup` returns the current authoritative state, including delivery. The state in the invoke receipt remains the admission-time state. If the entire response is lost before its reference is saved, repeat the original invoke intent. `association-unknown` has no proven reference. `commit-unknown` keeps the original reference while source issuance or admission remains unknown. A lookup that reports not-accepted does not exclude unfinished source issuance; continue with the original invoke.

`commands.releaseDelivery` returns `released` with the producer's original durable receipt. Success has no operation reference and does not claim a new write. An unknown delivery answer carries the operation reference for `queries.queryOperation`. A reliable negative answer rules out only that attempt. The caller can then explicitly release again to retrieve an existing receipt. Unknown or unreadable delivery answers must not trigger automatic release resubmission. Persistent reads and delivery do not require `instances.connect`. Every access checks the current principal and tenant. A reference grants no authority.

The assembly supplies the trusted identity and source ports. No production source issuer is supplied here. For tests, `createTestInvocationSource` pairs a non-durable source binding with its guard. `createTestToolIdentities` supplies operation and instance counters. The host passes its instance identity to `driver.run` and reuses it for the lifetime of that instance. These fixtures prove no production host, claim, takeover or durability.

`createTestInvocationSource({ authority, snapshotPrincipal })` supplies a paired issuer and guard with `durability: none`. The caller supplies a synchronous semantic snapshot function. It must isolate mutable credentials and preserve their authentication behavior. A genuinely immutable opaque credential can be reused. Resolve captures the snapshot before its first await. Source resolution uses that fixed view for qualification and subject comparison. The ledger and the paired source guard still receive the current original principal. The source digest never serializes the generic principal. `bindings()` returns diagnostic copies, using the same snapshot function for the principal and separate copies of the other data.

The optional synchronous `beforeIssue` hook runs after reservation and before issuance. If it throws, resolve returns issuance-unknown with the original identities and retains the reservation. The next same-intent invoke retries issuance. An issued source does not call the hook again. Snapshot failure returns rejected/unavailable before association access or allocation. These testing hooks add no production storage or restart guarantee. The public control facade allocates a new operation before delegation; the current ledger writes no control fact and returns unsupported.
