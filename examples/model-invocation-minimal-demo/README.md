# Model invocation minimal demo

[中文](README_ZH.md)

This example is a runnable **Cordis model-call loop**, not a formal business application. One host process wires the public surface of `@omne-harness-lite/model-request-runtime-local` around one Cordis context, composing real local storage (SQLite), a JSONL session log, an encrypted credential replica, account and membership checks, and the OpenRouter transport. It implements no Session, Run, Inbound or Agent Loop domain and no production governance. Where a trusted provider is needed, this demo supplies only single-process, single-host evidence and says so; it is not a template for cross-process authority. Reusable capabilities stay in `packages/`; this example only assembles them.

It offers two faces:

- an interactive CLI for a durable, streaming, multi-turn text conversation (`dist/cli.js`);
- a programmatic assembly (`createAcceptanceApplication`, `openDemo`, `createDemoSupervisor`) that tests and trusted local hosts use to reach the same runtime with images, tools, Run coordinates, acknowledgement and diagnostics.

## Run the CLI

Use the Node and pnpm versions declared at the repository root. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='your actual OpenRouter key'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo" --token-margin-multiplier 1.1 --token-margin-reserve 256
```

From `examples/model-invocation-minimal-demo`, run the built file relative to that directory instead:

```sh
node dist/cli.js --data ../../tmp/my-model-demo --token-margin-multiplier 1.1 --token-margin-reserve 256
```

`node dist/cli.js --help` prints every option. Both token margin options are required; the other options have these defaults:

| Option                               | Default   | Meaning                                                                                                                                                                   |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-output-tokens <n>`            | `16384`   | Per-response output limit, including reasoning tokens counted in output usage. The selected profile still enforces its maximum; the demo never clamps an excessive value. |
| `--transport-retirement-wait-ms <n>` | `10000`   | Positive wait for retiring a transport contribution; the CLI always sets `force=false`. A timed-out wait keeps the owner and does not claim cleanup.                      |
| `--ipc-max-message-bytes <n>`        | `1048576` | Bound on each complete IPC envelope, applied in both processes.                                                                                                           |
| `--ipc-max-commands <n>`             | `1`       | Bound on pending IPC requests between the supervisor and its worker.                                                                                                      |
| `--key-file <path>`                  | none      | Owner-only (0600) file holding only the raw key bytes, not `.env` syntax; one final newline is ignored. Choose it or `OPENROUTER_API_KEY`, not both.                      |

Use a **new** `--data` path for a new demo; the demo creates it with owner-only permissions. Use the same path to resume after `/exit` or end-of-file. An existing directory is accepted only when its authenticated session and durable log can be read and reconciled; unfinished work of unknown ownership is refused. Never pass a key value on the command line. After the key is published into the encrypted replica, a normal restart can omit both the environment variable and `--key-file`; supplying a key again replaces it through the actual credential publication API.

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
You> /models
  anthropic/claude-fable-5.1 [official] legal
  anthropic/claude-opus-5 [official] legal
  ...
* deepseek/deepseek-v4-pro-0813 [official] legal
  deepseek/deepseek-v4.1-flash [official] legal
  google/gemini-3.7-flash [official] legal
  ...
  z-ai/glm-5.3-prime [official] legal
You> /model deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Effective: deepseek/deepseek-v4.1-flash (session, official)
You> What did I ask?
Assistant> You asked me to say hello.
Saved. {"outcome":"complete", ...}
Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7
You> /history
user: Say hello.
assistant: Hello!
user: What did I ask?
assistant: You asked me to say hello.
You> /exit

Closed. Start again with the same --data path to resume.
```

The numbers are illustrative; the answer, token usage and USD cost come from the upstream response. Each submitted message can incur OpenRouter charges. `/models`, `/model`, `/model <identifier>`, `/history` and `/help` send no model request. Unknown slash commands are rejected locally.

### What one turn does

Each turn sends one text user message with no tools and no Run, `reasoningEffort: 'low'` and the configured output limit. The authenticated session binds the unified `createModelRuntime` service; the demo registers the call's host owner before sending and keeps it until physical stop. The service opens and dispatches the call, and a bounded, session-authorized observer streams the reply to the terminal. The observer defaults to 256 events and 262,144 bytes; programmatic callers can set both positive bounds. Delivery diagnostics and backpressure never substitute for persisted history or settlement.

A handed-off reply is persisted by the demo itself: `persistModelReply` writes the reply message and its model response as one durable batch before the next turn. Each request passes the complete validated message history, including prior reasoning and media blocks, to the invocation layer; visibility and model compatibility follow the shared contracts. The shared OpenRouter reader streams nonempty `delta.refusal` strings unchanged as reply text; a refusal does not create a separate completion path ([refusal service regressions](tests/refusal-service.spec.ts)).

After each durably settled response, including a failed one, the terminal rereads this session's persisted model responses and prints cumulative input, output and cache tokens plus actual USD. A missing value is shown as `known + N unknown` with an `(incomplete)` marker; it is never estimated or counted as zero. Restarting with the same data path restores the same totals.

A durable failed model response prints a generic failure line, and the CLI exits nonzero after closing; upstream error text is not printed. A refused request prints the runtime's refusal reason. An unconfirmed reply commit stops the loop and keeps the responsibility. There is no automatic retry or fallback. Ctrl+C during a call requests **system stop** and waits for actual settlement and application close; it is not the durable user interruption operation. Never reset data or automatically resend an unknown call.

A protocol failure or broken stream keeps already delivered text in the model response without turning it into a history message. `/history` reads the actual session log. Opening an existing conversation authenticates, checks session ownership and reconciles the durable model log before any new call; it never resends.

### Data directory

The data directory holds SQLite state, JSONL session history (`session-logs/`), engineering journals (`diagnostics/`), generated signing keys, the replica encryption key, and `demo-state.json` with a local demo account password. Keep the whole directory private and back it up together. The OpenRouter key lives only in the encrypted replica. Interrupted initial setup stays marked incomplete and is not silently replayed. Data written by an older incompatible development format is not guessed, rewritten or converted; use a new `--data` directory and keep the old one unchanged.

### Models

The demo installs every official definition published by `@omne-harness-lite/pi-ai-transport`: through the package's official catalog `officialCatalog` it loads 37 leaves from eight families (OpenAI 12, Anthropic 4, Google 2, DeepSeek 2, xAI 2, Qwen 8, Moonshot 2, ZAI 5), one official profile and one input meter per leaf. Each profile pins the single provider route that the leaf's definition declares, with fallback disabled. The cache setting is derived from the route's cache declaration: automatic caching stays automatic, and explicit caching takes the first declared TTL and breakpoint layout (for Anthropic, `1h` / `last_message`). The model-to-meter-to-cache mapping lives only in that package catalog; the demo keeps no mapping of its own. **`deepseek/deepseek-v4-pro-0813`** is still only the first session's explicit selection. **Installed does not mean certified**: which leaves have real certification is recorded in the per-leaf evidence table of the [realization verification page](../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md); input calibration for the two Google, eight Qwen and five ZAI leaves is still on its incremental track. `/models` reads the current display list (the 37 routes in name order; the sample output above elides rows with `...`), `/model` shows the selected and effective route, and `/model <identifier>` durably changes the selected route for later requests without resetting the session or its history. A layer lock can make the effective route differ from the selected one; a restart reads the durable selection. Restarting with an existing data directory registers the added profiles through the higher official manifest ordinal and updates the two earlier DeepSeek profiles to the new configuration revision.

## Assembling the runtime's public surface

`createModelRuntime(construction)` takes the transport, history readers and policies plus trusted ports that only the host can supply. `createAcceptanceApplication` in `src/bootstrap.ts` provides them from real components (no in-memory stand-ins and no ports that always answer `unavailable`):

| Runtime input                          | What this demo provides                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `callAccess.check`                     | `createDemoCallAccess` (`src/call-references.ts`). Every `read`, `wait`, `settle`, `cancel` and `ack` re-verifies the login state, effective membership and Session-to-tenant holding captured at the authenticated entry, checks the borrowed log binding and the call's original association, and only then runs the admitted callback with evidence that carries a revocation signal. The application aborts that signal when it starts closing. A caller can never pass an `allowed` flag. |
| `callPresence.read`                    | `createDemoCallPresence`. It reports `live` only while the original container still holds its execution resources. It reports `stopped` only for a container that released its exact lease with no unknown writer left on the Session's settlement owner, or for a covered cold worker after its recovery scope was built from host-witnessed exit evidence. An empty registry is never proof of a stop; anything else is `unknown`.                                                           |
| `callFacts`                            | The runtime's `createModelCallFacts` over `createModelCallContentStore`, on this demo's own SQLite storage. The content table comes from `modelCallContentMigrations('sqlite')`, composed into the demo's migration sequence. Budgets come from `modelRequest.callReferences` (`maxScopes` and the content `maxConcurrentWrites`/`maxContentBytes`); the runtime supplies no default.                                                                                                          |
| `SessionRuntimeBinding.sourceVersions` | Deployment-immutable identifiers: the official manifest ordinal and the deployed official capability set. The demo has no per-call revision reader, so it never cites a mutable path or profile name.                                                                                                                                                                                                                                                                                          |
| `acknowledgementCleanup`               | An explicit, finite retry schedule in `modelRequest.acknowledgementCleanup`: `createExplicitCleanupSchedule([200, 1_000, 5_000, 30_000])`. It is required, has no default and can be replaced by any policy object. Stopping a round never drops the durable cleanup responsibility.                                                                                                                                                                                                           |
| `openCall` `creationKey`               | `deriveCreationKey`: a pure hash of the Session, the user message identity and any explicit call and Run coordinates. It is stable across processes and is never a random value.                                                                                                                                                                                                                                                                                                               |

```ts
// The service returned by app.bindModelRuntime(actor, session) is scoped to that Session.
const opened = await service.openCall({
  creationKey: deriveCreationKey({ session, userMessage: user.id }),
  session,
  target: effective.effectiveModel.routeName,
  basis: effective.effectiveModel,
  messages: [user],
  tools: [],
  parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
  host: callHost.host, // the execution owner that outlives any one consumer
})
if (!('callId' in opened)) throw new Error('open refused')
const reply = await service.dispatch({ session, callId: opened.callId })
// Any later loop can read the durable result by reference; this never sends again.
const viewed = await service.acquireCall({ ref: opened.ref, mode: 'read' })
```

The demo derives one creation key per user message. Before an acknowledgement, the runtime refuses to publish another call under an already published creation key, so the second `openCall` answers `unavailable` without writing that call. After an acknowledgement, the same key with the same creation value and original association is recognized into the small acknowledged view, and a different value under that key answers `creationConflict` (runtime `tests/acceptance-a22-acknowledgement.spec.ts`).

### Reading a call by reference

`acquireCall` and `acknowledgeCall` are exposed on the same bound service. A `read` acquisition returns the durable view: state, origin, presence and, when ready, the result. A `wait` acquisition on a live call returns an independent consumer whose `release()` stops only its own observation; releasing it never cancels the execution owner, which stops when the host stops. A reference from another Session, an absent call or a closing application is answered without touching the model.

A confirmed ready reply is a terminal fact: the durable view and `readAttempts` report state `complete` (or `interrupted`) with the pending original carried on the last dispatch as `result: { disposition: 'disposition_pending', pending }`, not a `reply_pending` state. Settling that reply from the durable call facts does not unregister the container from the host; the registration is released when the host stops (`tests/acceptance-d4-lifecycle.spec.ts`, `tests/model-service-retry-control.spec.ts`, `tests/model-service-settlement.spec.ts`).

### Disposition, acknowledgement and release

`persistModelReply` is the demo's persisted-message writer; run it before acknowledging the call. `settleReply` settles a non-persisted disposition (`vetoed` or `consumed`). Once a final response is committed, a repeated `settleReply` is decided by that final alone: the same disposition is recognized with its original state, a different one answers `alreadyEnded`, and nothing is written.

```ts
// `reply` is the caller's own copy of the dispatched result (`'replyPending' in reply`).
if (!('replyPending' in reply)) throw new Error('no pending reply to hand over')
const acknowledged = await service.acknowledgeCall({
  ref: opened.ref,
  expectedResult: { kind: 'response', response: reply.replyPending.id },
})
// { acknowledged: { ref, target, acknowledgedAt, cleanup: 'released' } }
// or cleanup: 'pending' with a nonempty pendingReasons list
```

`acknowledgeCall({ ref, expectedResult })` hands the model-side copy over for release. It is a separate action from reading: the demo's `callAccess` checks `ack` afresh, and holding a reference or releasing a consumer never acknowledges. The runtime writes one durable acknowledgement, then deletes the call's stored copies under the explicit cleanup policy. Afterwards the old reference answers only a small accounting view without the route, reply or input calibration, and the reply text can no longer be re-read: keep your own copy of the original result before you acknowledge.

To settle a vetoed or consumed disposition after acknowledging a ready call, pass the original pending result back as `retainedResult`. Without it `settleReply` answers `wrongPhase`. The runtime validates the returned value, durably stages the complete batch and appends one final response; a repeat of the same disposition is then recognized without the value, and a different one answers `alreadyEnded` without changing the log. `tests/call-reference-service.spec.ts` runs these paths through the real SQLite, JSONL and local TLS service, and also checks acknowledgement of a ready-only call and access withdrawal at close.

### Settlement evidence and diagnostics

The runtime's successful ready handoff is published as a reference marker, not a settlement batch, so the engineering journal carries runtime `reply_handoff` rows for that call rather than a runtime `settlement` row. The runtime's settlement-event projection is internal and not exported, so the demo's own persisted settlement (through `persistModelReply`) does not enter the tenant engineering journal. Its public evidence is the typed acceptance diagnostics port: `AcceptanceDiagnostics.record` receives a `settlement` operation event with outcome `settlement.committed` for the call (`tests/d6-completion-pending-close.spec.ts`, `tests/d6-completion-sink-isolation.spec.ts`).

`AcceptanceDiagnostics.record` receives typed `settlement` and `observer` correlation on the applicable operation events. Settlement events keep tenant, session, call, dispatch, response, owner, policy and contention counts; observer rejection events keep tenant, session, call, dispatch, position and buffer counts. Request text, credential values, tool data and configuration bodies stay out of this port. A throwing or asynchronous sink increments `status().diagnosticFailures` independently of the model result, and the counter remains readable after `close()`. The callback is synchronous and best-effort; neither it nor the bounded journals below guarantee lossless diagnostic delivery.

## Deployment configuration

`createDemoConfig()` returns the example's explicit `modelRequest` deployment; programmatic callers can replace any of these values before opening the application:

- `transport.imagePreparation` loads the installed sharp codec with the replaceable `modelImageBalancedV1` policy. Production and controlled HTTPS transports receive the same preparation configuration. Original messages stay intact; metering and sending share the prepared image bytes. The runtime clears reuse scopes through its captured transport owner, including during shutdown.
- `maxScopes` and `callReferences.maxScopes` are 64; the reference content budget is 4 concurrent writes and 16 MiB per content value. These are local resource settings, not model limits.
- `defaultRetry` supplies a replaceable retry backoff policy and random sample source (`createDemoDefaultRetryConfiguration()`); `registryPolicy` sets the current-evaluation fill retry count and concurrent-operation limit to `{ maxRetries: 2, maxInFlight: 8 }`.
- `settlement.contention.limits` is `{ submissions: 2, elapsedMs: 5000, retainedBytes: 1048576, concurrent: 1 }`. Consumers with large retained session prefixes, such as image histories, must raise `retainedBytes` and `elapsedMs` themselves; model image limits do not override this operational budget.

```ts
// config is the result of createDemoConfig(...); diagnostics is your existing sink.
if (!config.modelRequest) throw new Error('model request deployment required')
const modelRequest = config.modelRequest
const imageConfig = {
  ...config,
  modelRequest: {
    ...modelRequest,
    settlement: {
      ...modelRequest.settlement,
      contention: {
        ...modelRequest.settlement.contention,
        limits: {
          ...modelRequest.settlement.contention.limits,
          retainedBytes: 16 * 1024 * 1024,
          elapsedMs: 60_000,
        },
      },
    },
  },
}
const app = createAcceptanceApplication(imageConfig, {
  stage: 'modelRequest',
  diagnostics,
})
```

### Image preparation

The assembled transport prepares images under D-109 before the final input gate. An image above the profile's `maxImageBytes` is re-encoded within the finite policy, so a 4 MiB + 1 byte PNG is sent as one request whose inline image is within 4 MiB, while the durable user message keeps the original bytes. An image of exactly 4 MiB is sent unchanged. `input_limit_exceeded` is reserved for a prepared candidate that still exceeds a cap; a configured token-margin excess is refused with zero HTTP requests (`tests/openai-sol-luna-images-service.spec.ts`). The CLI has no image-attachment syntax; images enter through the programmatic user-message API.

### Transport contributions

The model request stage installs a Cordis `modelTransport` service and one trusted contribution fiber per configured exact definition and input meter. The runtime acquires that service's fixed lease for each call; publishing another contribution does not change an existing call. Retiring a contribution stops new acquisition of that version and waits for its leases, HTTPS readers and callbacks to stop. Application close stops the runtime before disposing contributions and the transport service. Controlled HTTPS tests exercise Pro and Flash contributions across an in-flight old call and verify that an uninterpretable configuration produces `invalidInput` before HTTP or model anchors (`tests/model-transport-service.spec.ts`, `tests/model-hotupdate-integration.spec.ts`). This is a process-local hot-update slice; the caller still owns directory adoption and explicit old-version retirement.

### Token margin and response calibration

Both token margin options are explicit deployment choices. The CLI admits a request when `ceil(estimatedTokens * multiplier) + reserve` fits the project input cap. The CLI installs 37 meters, bound per family through the catalog; the two DeepSeek meters support estimated signed replay/new contributions within their supported reference-rendering domain; the other families follow their own meters (see the pi-ai-transport README). After source, basis, projection and reference-boundary validation, the planner reuses the upstream input observation and measures only the replayed output and new input; stable prefix content does not enter the marginal tokenizer. If that path does not apply, it falls back to full measurement; unavailable full measurement refuses the request before sending ([DeepSeek service regression](tests/deepseek-marginal-service.spec.ts)).

On each later turn, the demo reader returns every actually selected prior assistant response from the same authenticated log prefix. The runtime passes the newest usable accurate input observation as the anchor and separately passes all known selected output groups, including a response whose input count is unavailable. A changed model or input prefix triggers full measurement; a turn without usable usage can leave an earlier legitimate observation available. Historical responses are never rewritten, and estimates never replace actual usage or cost. This reader covers the linear no-Run session and an explicitly controlled single-Run fixture; it does not establish arbitrary branch or compaction provenance. The margin does not guarantee equality with upstream counting.

## Retry, runner and Run

The root publication declares the official `omne-official:default-retry` contribution, and a separate fiber registers the default-retry implementation with the application's Cordis runner service. A persisted retry conclusion never sends another model request by itself: a programmatic caller waits the returned nonzero `plan.after`, then explicitly calls `dispatchAgain`, which rechecks current evaluation limits and may refuse while keeping the retry conclusion.

The application fills the actual SQLite assembly manifest from the current evaluated inputs and lends its restricted history reader to the runner service. `dispatchRunner(actor, session, request, signal)` rechecks the actor and session, then obtains the failure source from the runtime's same-prefix `readAttempts(..., { consumeFailure: true })`; `replayRunner(actor, session, request)` reads durable conclusions without acquiring that source or writing. An `after_model_call` dispatch needs a trusted construction-time `runnerExternal` provider that verifies and lends the real Run, log and environment handles; without one this example returns `unavailable`. The CLI makes no-Run calls and never invokes the runner automatically. A runner request must belong to the same Run as its durable model call.

Programmatic `startServiceCall` can forward an already established `run`, `attempt` and original availability `report` together to `openCall`. A trusted construction-time `runHistory` reader may interpret the Run from the runtime-supplied owned prefix; without it, Run settlement stays unavailable. `persistModelReply` gives the original pending reply and the same reader to the settlement coordinator, which recognizes or appends the complete message/response batch and determines lateness from the owned prefix. The default calibration reader handles only the no-Run message chain; a Run call needs a trusted construction-time `calibrationHistory` reader to prove selected-message ancestry, or returns `sourceUnavailable`.

For local acceptance only, the construction-time `controlledRunFixture` borrows this application's authenticated session, current asset registry and physical session-log owner. Its `startAttempt` returns the registry's real availability report after a fenced `attempt_started` append; callers release its scope in `finally`. It selects one verified Run/attempt and the complete linear message chain in that session; an unselected or conflicting Run stays unavailable. It provides no CLI Run command or general Run owner.

## Programmatic entries

The package root exports `createAcceptanceApplication` with its configuration and result types and fixed stage fiber names, `openDemo`, `createDemoSupervisor`, `runInteractive`, `createDemoConfig`, `createDemoDefaultRetryConfiguration`, `createExplicitCleanupSchedule`, `MODEL`, the diagnostic journal and diagnostic assembly entries, and their types. The assembly owns its Cordis context and lifecycle. Its `currentTime()` is a narrow read of its existing lease Clock for message and invocation timestamps; an unavailable clock prevents a send. `AcceptanceHooks` and `developmentTransport` are trusted test controls, not tenant input. The authentication-only stage sends no model request.

- `startServiceCall(actor, session, { user, parameters, host, observer?, tools?, callId?, run?, attempt?, report? })` takes a complete judged `UserMessage`, including image blocks, appends it before opening the call and lets the chosen model and transport check compatibility.
- With a trusted, borrowed `modelRequest.assetRegistry` (`AssetRegistryService.lookup`), `tools: ModelToolName[]` are resolved by the runtime against that session's real registry; nonempty tools without a registry return `unavailable`. The registry owner must keep it available until application close; the CLI configures none.
- `appendServiceToolResult(actor, session, { message, host })` lets an external tool-result writer submit a judged `ToolMessage` after a complete model tool call is persisted. The application checks current identity, host ownership and pairing against the full durable prefix before one conditional append. It does not execute the tool or invent a Run.
- `openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?, host?)` returns the actual application and authenticated actor for local programmatic use.

The deployment's `modelRequest.transport.retirement` requires a positive `waitMilliseconds`, `force` and a replaceable `schedule`.

## Supervisor, worker and recovery

The CLI uses `createDemoSupervisor(...).open()` and a separate remote facade with serializable commands and display identity; its worker calls the same local `openDemo` and verifies identity for each operation. The supervisor owns one long-lived worker process for the data root across turns. That worker owns Cordis, storage, the session log, credentials, model calls and their close path; the supervisor owns its child instance and IPC. It starts a successor only after observing the previous child's actual `exit` and stream `close`; an IPC disconnect or a kill request alone never proves exit. The key file is read inside the worker only after old durable calls are reconciled, and only its path crosses IPC; a missing key can still fail startup after recovery has committed. The deployment must reserve the data directory for this supervisor's worker chain.

Within one surviving supervisor, a worker killed after a durable dispatch can be replaced; the successor reconciles the original session log with zero new model HTTP requests. A newly started CLI cannot inherit another supervisor's exit evidence: if the old owner of an unfinished call is unknown, opening refuses before a new request. A clean log marker or an obtainable file lock does not prove that an old model effect stopped. Fully settled history can be reopened by a new CLI (`tests/cold-supervisor.spec.ts`).

A send result's `released` describes that stop attempt. If a terminal callback is still running it stays false; after the callback actually stops, an explicit `close()` retry can complete, and the supervisor waits for the worker's real exit. The supervisor's trusted fault controls can drop one send receipt and replay it with a colliding request ID against the successor; the original generation still prevents delivery. `inspect().nativeIpcBackpressureObserved` reports whether Node's IPC send buffer applied backpressure. These controls exist for local recovery tests, not tenant operations.

## Local engineering journal

The demo authenticates first, opens separate owner-only local and verified-tenant JSONL collectors, then activates its model-request fibers in the same Cordis context. For programmatic assembly, `createAcceptanceApplication(...).ready` prepares identity and session-log access; call `activateModelRequest(actor, diagnostics, diagnostics.transports)` only after authenticating and opening both diagnostic owners. A failed activation does not open model admission.

Each transport construction reserves a generation before creating the service. Its registry borrows a record-only port bound to the local collector and the fixed `transport:<generation>` execution ID; registration and retirement events come from the actual registry and do not enter the tenant journal. A confirmed resource-free abort leaves a generation gap; an unknown construction keeps its reservation. The service's `inspect()` reports registry delivery failures and drops separately from network diagnostics and collector health. Current, constructing, old live and terminal transport generations share one retention bound (four in `createDemoDiagnosticConfig`); if live owners fill it, a new construction is refused.

`openDemo(...).diagnostics.tenant` and `.local` expose bounded `query`, `exportPage` and `health` to the trusted local host. `close()` stops business work before diagnostic writers and returns `complete`, `businessComplete`, the diagnostic close results and transport health. Keep the same owner and retry while it is incomplete; read handles stay usable after close. If a diagnostic sink is still pending after business close, the result stays incomplete with the pending count. The accepted, written and flushed watermarks are distinct: a failed sync does not claim a flushed record or undo a durable session reply. `DemoDiagnosticConfig.journalFileSystem` lets a trusted programmatic host supply the journal filesystem for fault injection; the CLI has no such option. The diagnostic wall clock reads the host source exported by `@omne-harness-lite/clock-lease`; unreadable or backward time makes retention queries unavailable.

Planning measurement records contain only a closed projection: mode, fallback, precision, predicted and admission tokens, signed contributions, safe basis revisions and the retained source prefix summary, without `configuration.values`. Collector `planning` durations cover the whole planning boundary, not tokenizer time alone. Estimates never enter cumulative actual usage or billing.

```ts
import type { DemoConversation } from '@omne-harness-lite/model-invocation-minimal-demo'

export async function closeAndReadDiagnostics(demo: DemoConversation) {
  const closed = await demo.close()
  const tenant = demo.diagnostics.tenant
  const page = await tenant.query({ scope: tenant.scope, limit: 32, maxBytes: 65_536 })
  return { closed, page, health: tenant.health() }
}
```

`createDiagnosticJournal(config)` creates and exclusively owns a new collector directory under a private root; `openDiagnosticJournalReader(config)` reopens it read-only after close or restart. Supply the complete `DiagnosticJournalConfig`, including scope, clocks, scheduler, retention and query/export limits.

```ts
import {
  createDiagnosticJournal,
  type DiagnosticJournalConfig,
} from '@omne-harness-lite/model-invocation-minimal-demo'

export async function readEngineeringPage(config: DiagnosticJournalConfig) {
  const journal = await createDiagnosticJournal(config)
  const page = await journal.query({
    scope: config.scope,
    limit: config.queryMaxRecords,
    maxBytes: config.queryMaxBytes,
  })
  const closed = await journal.close()
  return { page, closed, health: journal.health() }
}
```

Queries and `exportPage(query, { maxRecords, maxBytes })` require the exact bound scope. An empty journal's `through.sequence='0'` fixes an empty snapshot, not a record identity. Expired cursors, corruption, timeout and capacity exhaustion have explicit results. TTL cleanup runs only while an owner is active, not after process exit; failed deletion or unfinished I/O never counts as freed space. These engineering records are separate from session history.

## Development runner host

The application returned by `createAcceptanceApplication()` also offers `runExtensionPass(actor, session, request)` for explicitly supplied development extensions. `DemoRunnerRequest` uses the runner package's existing pass, chain and non-storage ports; supply real execution and waiting sources for the ports you use, since an `isActive()` result does not prove a Run or a waiting-card fact. This entry registers no production chain and adds no model command.

The application authorizes the actor and session and supplies the shared JSONL binding, conclusion writes, reminder reads/writes and physical task owner; callers cannot replace these storage ports or claim that the writer has stopped. `subjectForCandidate` identifies the original positioned subject for each conclusion, including nested passes, and the runner adapter checks their relation. The runner service adapter borrows only the history reader's `read` capability; the application keeps ownership of the reader and its `close()`.

Always await `app.close()`. It closes runner admission and cancels passes, keeps still-running contributions, stops other shared-log consumers and then closes the actual log. An uncertain append is resolved only by reopening the same log through SL3 recovery admission and reading its original key. A writer whose exit is still unknown stays unfinished; do not report `complete: false` as a clean shutdown.

## Verification

From the repository root (no model credential or paid request is used):

```sh
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test
python3 examples/model-invocation-minimal-demo/tests/pty-check.py
```

The build needs the workspace dependencies built first (`pnpm run build` at the root). The PTY check drives the real interactive CLI under an OS pseudo-terminal against controlled local TLS. Run a single file with `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/<file>.spec.ts --maxWorkers=1`. The full suite forks worker processes and runs large-history cases; on a loaded host run it without other heavy jobs.

Every test uses a controlled local TLS endpoint with synthetic upstream responses. These tests verify the service composition, durable history and accounting paths; they do not certify tokenizer accuracy, effort mapping, cache retention, private preprocessing or live route acceptance.

| Test file                                                                                                                                                     | What it exercises through the authorized service                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/call-reference-service.spec.ts`                                                                                                                        | Creation keys, `acquireCall`, acknowledgement (settled and ready-only), post-ACK `settleReply` with `retainedResult`, repeated disposition and access withdrawal at close                            |
| `tests/model-service-settlement.spec.ts`, `tests/model-service-retry-control.spec.ts`                                                                         | Reply disposition, host-released registration, retry control and the `complete` + `disposition_pending` read of a confirmed ready                                                                    |
| `tests/d6-completion-*.spec.ts`                                                                                                                               | Close ownership, sink isolation and failure, redaction, HTTP 503 and the `reply_handoff` / `settlement.committed` evidence                                                                           |
| `tests/deepseek-marginal-service.spec.ts`                                                                                                                     | Both DeepSeek routes: three durable turns with marginal calibration, plus zero-HTTP excess-margin refusal                                                                                            |
| `tests/openai-sol-luna-images-service.spec.ts`                                                                                                                | GPT-6 Sol/Luna and their Pro variants (`pi-ai:openai` `mp4-18`, definitions 6/7 and Pro 6): image history, exact 4 MiB boundary (Sol), D-109 preparation of 4 MiB + 1 byte, and token-margin refusal |
| `tests/openai-pro-images-service.spec.ts`                                                                                                                     | Three GPT-5.6 Pro bindings and GPT-6 Astra Pro: three turns with image history and full estimated admission under `scope_unknown`                                                                    |
| `tests/openai-output-history-service.spec.ts`                                                                                                                 | Three GPT-5.6 non-Pro models: a middle reply with known output and unknown input usage, then anchor reuse or full measurement                                                                        |
| `tests/google-effort-service.spec.ts`, `tests/xai-effort-service.spec.ts`, `tests/zai-prime-effort-service.spec.ts`, `tests/qwen-open-effort-service.spec.ts` | Request effort over three durable turns (Google and xAI `low`/`medium`/`high`, Z.ai Prime `low`/`high`/`max`, the two open Qwen leaves `high`/`max`), plus zero-HTTP excess-margin refusal           |
| `tests/qwen-visible-service.spec.ts`                                                                                                                          | The six commercial Qwen leaves with their declared cache configuration, measured in full each turn                                                                                                   |
| `tests/xai-closeout-service.spec.ts`, `tests/moonshot-three-round-service.spec.ts`                                                                            | xAI opaque reply persisted and resent intact; Moonshot three rounds with and without tools                                                                                                           |
| `tests/refusal-service.spec.ts`                                                                                                                               | Refusal text committed, replayed exactly after close/reopen, and stopped by host cancellation or the stall deadline                                                                                  |
| `tests/model-transport-service.spec.ts`, `tests/model-hotupdate-integration.spec.ts`                                                                          | Exact transport contributions, an old call draining across a new contribution, and `invalidInput` for an uninterpretable configuration                                                               |
| `tests/cold-supervisor.spec.ts`, `tests/crash-reopen.spec.ts`, `tests/control-writer-uncertainty.spec.ts`, `tests/response-writer-cold-recovery.spec.ts`      | Supervised worker, SIGKILL, crash reopen, unknown control and response writers, and cold recovery without another HTTP request                                                                       |
| `tests/runner-host.spec.ts`                                                                                                                                   | Authenticated runner passes, reminder persistence, replay, close/reopen and filesystem failure injection                                                                                             |

The service, selection, observer, recovery, acknowledgement and calibration mapping follows the accepted [RT12](../../.meta_harness/design/spec/capabilities/model-request-runtime/v12/contract.md) and [MR11](../../.meta_harness/design/spec/data/model-response/v11/contract.md), with calibration adopted by [D107](../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/decision.md) and image preparation by [D-109](../../.meta_harness/design/record/decisions/model-request-image-preparation-adoption/decision.md); provider status is in the [runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md). Bounded real OpenRouter PTY evidence for the unified-service assembly is in the [2026-09-28 demo service evidence](../../.meta_harness/design/record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md), and real per-leaf three-round runs through this demo's service entry are listed in the [transport verification](../../.meta_harness/design/realization/packages/model/pi-ai-transport/verification.md). The CLI's model switch itself is verified only against controlled local TLS and the PTY check.
