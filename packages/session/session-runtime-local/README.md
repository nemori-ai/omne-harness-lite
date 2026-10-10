# @omne-harness-lite/session-runtime-local

[中文](README_ZH.md)

This package provides persistent local admission for Session operations. The root exports independent functions and trusted construction ports. Session behavior belongs to [the public definition](../../core/session-runtime/SPEC.md). Provider behavior belongs to [SPEC.md](SPEC.md).

The root exports `createLocalSessionDriver` for normal Model and Tool paths. It scans durable Session work and owns original Run tasks. The caller supplies actual Run sources, Model services, Clock and explicit policy. Stop withdraws new work; close waits for the actual scan and task returns. The `./cordis` entry exports `SessionDriver` with explicit policy and Core startup injection. Production-source composition requires separate acceptance.

`createSessionDriverWorkOwner` and `createSessionCallAccess` retain original work and enforce original Run reads. They do not grant new Model or Tool permission or provide execution recovery.

Original Run journal borrows validate their fixed grant once and retain a private read binding. Each read uses an actual storage unit and current log source. Appends retain their original grant and attempt checks. See [the binding structure and limits](adr/original-run-read-binding.md).

`sessionModelRequestPreparation` prepares the current model request for the existing runtime consumer. Session owns tool resolution, history calibration and assembly timeout evaluation. The application supplies this implementation explicitly. This preparation interface is separate from the prepared execution request accepted by a Model pool. See [SPEC.md](SPEC.md#会话模型请求准备).


`createSessionModelReconciler` owns complete Session-log reconciliation. Its projections share the original recovery entries and retryable close state. `sessionModelSettlement` also supplies cold-reply recognition and control-record append. These operations do not dispatch model requests or close the borrowed execution pool.


`createSessionModelSelection` owns Session model selection, full-history reads, evaluation and original operation cleanup. Its public types belong to Core. Callers explicitly close the returned handle and keep it until original operations have stopped.

The Session provider owns retained immutable history and its borrow lifetime. See [retention and capacity](adr/model-history-retention.md), [the content algorithm](../../core/model-request-runtime/adr/immutable-model-history.md), [the benchmark](verification/benchmarks/README.md), and [the finite publication model](verification/history-cuts/README.md). Capacity fallback remains a complete current read. Benchmark and model results do not prove whole-CLI latency or a process heap bound.

## Admission

Compose `admissionMigrations` on the shared root database. Compose `admissionUseMigrations` on each tenant runtime database. Then call `createLocalAdmission` with the root storage, the trusted governance probe, and explicit capacity limits. The caller owns both storage instances and the probe.

Reserve the original target before network IO. Query only the active ticket. Consume a ready ticket in the actual tenant unit. The recorded ticket use and the original business receipt commit together. A ticket is a coordinate; it does not grant permission. Keep live guards inside their callbacks.

Login rejection and member rejection have different scopes. A new login handle cannot erase an unresolved member observation. Existing Run execution requires its own persisted grant and current execution fences.

## Shared-unit state

Compose `sessionStateMigrations` on the tenant runtime database. The trusted coordinator constructs `createLocalSessionState` with current authority, explicit limits, and the original work settlement reader. The participant uses the caller's storage unit. The coordinator must commit its log facts and receipts in that same unit. A staged state result does not prove public admission or consumption.

The participant retains pending input positions until adoption. It rejects reused terminal Run identities and copied or rolled-back Attempt permits. Completion requires no pending input and settled original work. Full Session operations and execution recovery remain under construction.

## Shared-unit receipts

Compose `operationReceiptMigrations` on the tenant runtime database. Construct `createLocalOperationReceipts` with the fixed tenant, current authority, and actual log participant. Lookup uses the complete `OperationRef`. Creation lookup does not require the assigned Session identity. Same-semantic replay preserves the original receipt snapshot. A different semantic is rejected. New receipts check the staged log coordinate. The coordinator must pair the original business fact, state, and pending qualification before committing.

## Development

Follow [workspace setup](../../../docs/development.md). Build dependencies first.

```sh
pnpm --filter @omne-harness-lite/session-runtime-local build
pnpm --filter @omne-harness-lite/session-runtime-local typecheck
pnpm --filter @omne-harness-lite/session-runtime-local test
```

The tests use real SQLite transactions and an actual process crash. They do not replace CLI, OpenRouter, tool, or complete recovery acceptance. The package does not yet carry a template adoption marker.

The root also exports `createLocalSessionIngress` and `sessionRuntimeMigrations`.
This function composes persistent creation, input admission, receipts, and reads.
Its trusted bootstrap port must initialize the actual Session before publication.
The trusted `lifecycle` port also coordinates Run creation, the first attempt, input and result adoption, call preparation, and completion. It persists the original Run grant and step receipt with the state and log facts. A new Run requires its own login check. An existing Run uses its original grant. Step replay returns the original receipt and does not issue another permit. Cancellation, archival, execution recovery, and complete call coordination remain under construction.
See [SPEC.md](SPEC.md) for shared-unit behavior and construction requirements.

The root selects the original model participant through `modelIssue`. It must supply current model authority and explicit capacity limits. The trusted `modelInvocation.admit` port checks the stored preparation and current Attempt permit in the actual unit. It commits the original model anchor, unique claim, and Session issue proof together. Only the original model owner can consume that claim. Replay gives no second launch right. The owner can read its exact committed proof after the Run ends or the ingress closes. The root must retain its borrowed log and storage until that owner releases them. The application selects the actual model source and SDK ACK adapters. Tools and the complete production host remain under construction.

The trusted `tenancy` reader returns ownership from the actual persistent Session reservation. It does not use a development seed. The `./cordis` entry exports `createLocalSessionContext`. This constructor creates a separate Context and explicit shared bridges. The application supplies a fresh Runtime Context provider through `runtimeContext`. The constructor uses its original plugin, readiness, initializer, and admission control. Its private initializer is bound to one Session. Stop waits for the original work and log borrow. A failed release remains pending and can be retried. The caller must supply the actual legal recipe and seed before publishing the Session. `currentGeneration()` observes the actual Context lifetime. It returns null before readiness and after withdrawal. This identity grants no execution permission.

The original creation ticket stores the actual member role. This snapshot is only recipe input. It does not grant current access. SessionBootstrap receives the original ticket to recognize the original Session. Missing roles have no default.

## Live access bindings

createLocalSessionAccess borrows actual current authority and a fixed authenticated principal and tenant. Supply explicit permission and capacity policies. The factory returns operations and a private issuer separately. Do not register the issuer as an ordinary service. Each use checks current authority. Copied, revoked and closed bindings refuse access. Close drains original checks without closing borrowed owners. See [SPEC](SPEC.md).

## Original model result custody

Supply an actual original execution source and explicit limits through `modelResults`. The trusted custody port stores the complete Pending value, its required references, the original issue identity, and the receipt in the same storage unit as the custody fact. It uses the original Run grant, including for late results. Replay checks the original fact and issue proof and returns the original value and receipt. A different value or an alias result key is rejected.

An unavailable reference source rolls back the unit. An unknown commit preserves the original result identity for lookup. Neither outcome permits ACK. Custody does not advance a Run, set a reply disposition, or send ACK. The root must connect the actual model source and the model owner's ACK rules. Close drains registered work and retains borrowed dependencies. See [provider behavior](SPEC.md#原完整模型结果保管).

## Original Run log borrow

The trusted root can borrow `runJournal` with the original coordination authority, Scope and Run. Each read or write checks the durable grant in its actual storage unit. The borrow supplies the complete prefix and native `SessionLog` operations for model settlement. It does not replace current execution permission or the unique issue claim.

The root must retain the borrow until the original model work and ACK responsibility end. Ingress close waits for each accepted borrow to be returned. Borrow close revokes admission and drains its units without closing physical dependencies. Its process-local generation becomes unavailable at close. See [provider behavior](SPEC.md#原run日志借用).

`lifecycle.commitStep(adoptResult)` adopts an original stored model result once under the latest permit. It does not insert a second reply or replace SDK settlement and ACK. See [the provider specification](SPEC.md#原模型结果的协调采用).

## Original model consumers

The root exports `createSessionRunModelBinding`, `createSessionModelResultSource`, `createSessionRunHistory`, and `runSessionModelTurn`. They bind an original Run, read its history, and transfer a complete result through custody, adoption, SDK settlement, and ACK. The application supplies the actual model and settlement factories through Core interfaces. This package does not select a concrete Model provider. Return the model assembly borrow before its original journal. These functions do not complete the full driver or authorize new execution. See [behavior](SPEC.md#原-run-的模型运行时接线).

The root also exports `prepareSessionModelRun`, `createSessionModelAttempt`, and `createSessionModelObservations`. The provider consumes the Core Agent Loop, retains the original model job, and separates local waits from physical execution. These components do not implement the complete driver or tool loop.

`RuntimeOptions.toolIssue` enables the trusted original Tool admission support. `toolInvocation.support` requires this Ingress owner's coordination authority. The provider checks the original prepared call and actual intent in the shared transaction. Tool result custody, delivery, and complete driver composition remain separate work; this support alone is not a complete Tool path.

`toolResults` retains and recognizes the original Tool terminal evidence and Session custody receipt in one unit. The trusted root supplies the immutable Tool result source. The native composition uses the public immutable result source; production qualification and Cordis composition require separate verification.

`toolDelivery` confirms the ordinary Tool message with its ready, confirmation and adoption facts in one unit. The root supplies the existing pure Runner history interpreter. New delivery requires the current permit; recognition verifies the full original batch. Full native and Cordis composition remains a separate verification gate.

## Adopted tools before Model IO

The normal Model driver persists the original report and complete adopted tool table before it creates a model call. Nonempty entries must match the exact version selected by the original evaluation. An unconfirmed append blocks Model IO and does not trigger a retry. Explicit recognition accepts only the same complete snapshot.

The root exports `inspectSessionToolAdoption`, `sessionToolActionOwner`, and `SessionToolAdoption`. This reader validates the fact and its original Scope and key. It performs no IO and grants no Tool permission. The projection keeps this fact out of model messages. Runner batch completion and native Tool consumption have a limited implementation; ordinary delivery continues the original Run after reliable custody. See [SPEC](SPEC.md#原-run-的模型运行时接线).

## Complete action batches

`createSessionToolActionHistory` reads the original adopted Model tool batch, the complete action fact, and the native Tool route from one exact prefix. The root supplies the mature Runner conclusion interpreter. This function performs no IO and grants no execution permission.

`readSessionRunnerAction` reads the original Run journal for a trusted Runner host. It returns the persisted calls, adoption report, and stable anchors. It rejects a foreign Run or a superseded attempt and grants no execution permission.

The internal batch consumer dispatches the actual Runner, checks its original replay, and persists the whole ordered batch before returning execution locators. An asked pass keeps the batch pending. An unconfirmed append returns no locator. Recognition uses the original fact without redispatch. The fact stays outside model messages. The Model task now consumes the actual native Tool through the original same-unit support. It keeps the model work token pending, prepares each original call, and retains the native participant and its actual stopped proof. Unknown outcomes keep the original work. Returning this borrow does not close the shared pool. Each stopped Tool result enters actual immutable custody before the original after-action pass and ordinary delivery. Unknown custody or delivery retains the original work without another model call. Confirmed whole-batch delivery returns the Tool borrow and registers the next model work before completing the preceding Model responsibility. Core Tool and Runner fact readers keep events out of model messages. Cordis and production-source composition remain separate verification gates. See [SPEC](SPEC.md#原-run-的模型运行时接线).

## Cordis driver and operation faces

The trusted host supplies the actual Core startup service before it loads `SessionDriver`.
The plugin publishes the original control after startup returns.
Fiber activation does not prove driver readiness.
Removal aborts startup admission and calls the original stop and close.
The root retains partial startup resources and pending or failed close responsibilities.
Service removal and Cordis disposal do not prove that these resources are closed.

`createLocalSessionIngressBinding(original)` binds four Core faces to the same borrowed Ingress.
Its configuration is an empty object.
The binding delegates admission, lifecycle, work reads and Run journal borrowing.
It grants no access and does not close the borrowed Ingress on removal.
See [SPEC.md](SPEC.md#cordis驱动插件) for the ownership rules.

`sessionModelSettlement` supplies model settlement, persistent work, and work recovery to runtime consumers. `createSettlementCoordinator` and `createSettlementWork` are also independent functions. See [ownership and lifetime](SPEC.md#模型结算的实际拥有者).

The Session-owned `createSessionModelCallFacts` factory rebuilds and updates the call index from the session log. The root passes the original content store; the physical runtime keeps the close responsibility. See [the specification](SPEC.md#模型调用事实索引).

The root exports `createSessionModelReads` and the fixed-prefix failure readers. The read owner retains Session history and read lifetimes; Model supplies its original execution view and borrowed content/ACK operations.

## Original model invocation coordination

The Session provider owns `createAnchoredModelInvocation`. It composes the explicitly supplied physical executor with a real
SessionLog binding and the shared settlement coordinator. It supports one
dispatch with an explicit list of resolved model tools, either without a Run or
with an explicit `run`/`attempt` pair whose anchors use a fenced append. The host supplies fixed
call/response/message identities, the complete profile binding and selection
source, the actual credential scope/value, policy, transport, owner and log
generation. The function validates these values; their shape does not establish
authorization or credential provenance. It borrows the exact transport for this
call; this delivery does not implement transport hot replacement.

The original transport plans once. The confirmed dispatched record precedes
HTTP, and the confirmed opened record precedes visible content. The complete MR11
response uses that original opened timestamp, actual usage/cost/upstream facts
and the same invocation's safe headers. Complete and truncated replies remain
caller-owned full `PendingModelResponse` facts without disposition or lateness. The lower-level `settleReply('persisted')` uses
the shared coordinator for one `[AssistantMessage, ModelResponse]` append;
explicit vetoed/consumed dispositions use one response append. Determinate
failure and system interruption settle a response before outcome resolves;
system interruption retains any delivered content without creating a reply.

`abort()` requests system stop. The runtime service persists the user interruption intent before invoking the anchored handle's `interrupt(initiator)`; callers use `runtime.interrupt` for that protocol. A live call shares its original owner registration with short control work, including when the concurrency limit is one. Uncertain control appends retain that registration until the task stops and a complete authoritative log prefix determines the effect; unresolved response writers remain a separate debt. `close()` closes admission, requests stop and waits for actual invocation, gate, append and settlement tasks to stop.
Only confirmed settlement (or no dispatch) permits `releaseBorrowed`. Unknown
anchors or settlement return unavailable and retain the handle, the original
settlement request and borrowed references. An unknown dispatched or opened
anchor is recovered only by the host at the existing S-33 boundary. An unknown
settlement append stays owned by the shared coordinator: after its writer
actually stopped, a later `settleReply` or `close()` reads the same-source
complete prefix. A complete batch is recognized; proven absence lets the same
original request be settled again (noRun bytes are identical; a Run batch may
update only `late` and its shell under S-70④); an unverifiable prefix stays
unavailable. A later disposition or close never replaces the retained original.

After actual host preparation, pass its input and an explicit reply disposition to the example below. Retain the returned call and its host owner while close is unavailable. The fifteen-method service is composed; production Run ownership and model certification still need their own evidence.

```ts
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import type { ModelPoolInstance } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationInput } from '@omne-harness-lite/model-request-runtime'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import type { ReplyDisposition } from '@omne-harness-lite/model-response'

/** Supply actual host preparation and an explicit caller disposition. */
export async function runPreparedInvocation<P extends PlannedSemantics, R>(
  input: Omit<AnchoredInvocationInput<P, R>, 'execute'>,
  disposition: ReplyDisposition,
  pool: Pick<ModelPoolInstance, 'execute'>,
) {
  const call = createAnchoredModelInvocation({ ...input, execute: pool.execute })
  const outcome = await call.outcome
  const settlement = 'replyPending' in outcome ? await call.settleReply(disposition) : null
  const close = await call.close()
  // Retain call and its host owner when close is unavailable; neither abort nor outcome proves release.
  return { call, outcome, settlement, close }
}
```


## Tools in a prepared invocation

Pass resolved `ModelToolEntry` values through `planInput.tools`. `modelEntry` converts a validated tool definition to that model-facing shape. Declare tool-definition as a direct dependency when using this example.

```ts
import { createAnchoredModelInvocation } from '@omne-harness-lite/session-runtime-local'
import type { ModelPoolInstance } from '@omne-harness-lite/model-request-runtime'
import type { AnchoredInvocationInput } from '@omne-harness-lite/model-request-runtime'
import { type PlannedSemantics } from '@omne-harness-lite/model-request-runtime'
import { modelEntry, type ToolDefinition } from '@omne-harness-lite/tool-definition'

export function invokeWithTools<P extends PlannedSemantics, R>(
  input: Omit<AnchoredInvocationInput<P, R>, 'execute'>,
  definitions: readonly ToolDefinition[],
  pool: Pick<ModelPoolInstance, 'execute'>,
) {
  return createAnchoredModelInvocation({
    ...input,
    execute: pool.execute,
    planInput: { ...input.planInput, tools: definitions.map(modelEntry) },
  })
}
```

The runtime sends definitions and assembles streamed tool calls; the caller supplies each corresponding tool result in subsequent history. No tool is executed or automatically fed back by this function. Invalid definitions, duplicate names and orphan calls are rejected before a new dispatched anchor or HTTP request. The internal service composition helper now resolves names through the captured session or Run report scope; it is not a public tool execution API.

## Session model-call composition

`createSessionModelRuntime` composes the Session model-call operations over one original call store.
Supply `execute` from the shared physical Model pool. The Session coordinator retains original issue, ready, ACK, and close responsibilities.

The Cordis entry exports `createSessionModelRuntimeLocal`. Its trusted construction requires the same `execute` and an original `createContentStore` factory.
See [the composition contract](model-runtime.md) and [lifecycle responsibilities](adr/model-service-lifetime.md).
