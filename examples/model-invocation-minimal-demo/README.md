# Model invocation minimal demo

An interactive command-line example of a durable, streaming, multi-turn model conversation. It uses the real local account, organization standing, session ownership, current evaluation input, official model profile, encrypted credential replica, OpenRouter transport, and JSONL session log. The former model-request-acceptance assembly now lives in this example. Reusable capabilities remain in `packages/`.

The demo installs two official profiles, **`deepseek/deepseek-v4-pro-0813`** and **`deepseek/deepseek-v4.1-flash`**, both with the **`deepinfra/fp8`** provider and fallback disabled. Pro is only the first session's explicit selection. `/models` reads the current directory display list, `/model` shows the selected and effective route, and `/model <identifier>` durably changes the selected route for later requests. It does not reset the session or its history; a layer lock can make the effective route differ from the selected one. A restart reads the durable selection. Other published model definitions are not automatically available in this demo without a matching profile, adaptation, and input meter.

The model request stage installs a Cordis `modelTransport` service and one trusted contribution fiber per configured exact definition and input meter. The runtime acquires that service's fixed lease for each call; publishing another contribution does not change an existing call. Contribution retirement stops new acquisition of that version and waits for its leases, HTTPS readers, and callbacks to stop. Application close stops the runtime before disposing contributions and the transport service. A controlled HTTPS test exercises Pro and Flash contributions across an in-flight old call and verifies that an uninterpretable configuration produces `invalidInput` before HTTP or model anchors. This is a process-local hot-update slice; the caller still owns directory adoption and explicit old-version retirement.

The programmatic `ModelRequestDeployment` requires `defaultRetry` and `registryPolicy`. `defaultRetry` supplies a replaceable retry backoff policy and random sample source; `createDemoDefaultRetryConfiguration()` provides this example's initial values. `registryPolicy` sets the current-evaluation fill retry count and concurrent-operation limit, with `{ maxRetries: 2, maxInFlight: 8 }` in `createDemoConfig()`. The root publication declares the official `omne-official:default-retry` contribution, but a persisted retry conclusion never sends another model request by itself. Callers can replace these explicit deployment values before opening the application.

The application fills the actual SQLite assembly manifest from the current evaluated inputs and lends its restricted EIS history reader to one Cordis runner service. A separate P5 fiber registers the default-retry implementation with that service. `dispatchRunner(actor, session, request, signal)` rechecks the actor and session, then obtains the failure source from the runtime's same-prefix `readAttempts(..., { consumeFailure: true })`; `replayRunner(actor, session, request)` reads durable conclusions without acquiring that source or writing. For an `after_model_call` dispatch, a trusted construction-time `runnerExternal` provider must verify and lend the real Run, log, and environment handles. With no such owner, this example returns `unavailable`. Its ordinary no-Run CLI conversation does not manufacture a Run or invoke P5 automatically.
Programmatic `startServiceCall` can forward an already established `run`, `attempt`, and original availability `report` together to `openCall`. A trusted construction-time `runHistory` reader may interpret the Run from the runtime-supplied owned prefix; when absent, Run settlement remains unavailable. `persistModelReply` gives the original pending reply and the same reader to the settlement coordinator, which recognizes or appends the complete message/response batch and determines whether that response is late from the owned prefix. The default calibration reader handles only the no-Run message chain: a Run call requires a trusted construction-time `calibrationHistory` reader to prove selected-message ancestry from the supplied prefix, or returns `sourceUnavailable`. For local acceptance only, the construction-time `controlledRunFixture` borrows this application's authenticated session, current asset registry and physical session-log owner. Its `startAttempt` returns the registry's real availability report after a fenced `attempt_started` append; callers release its scope in `finally`. The fixture selects one verified Run/attempt and the complete linear message chain in that session; an unselected or conflicting Run remains unavailable. It provides no CLI Run command or general Run owner. The CLI continues to make no-Run calls. A runner request must belong to the same Run as its durable model call.

Each turn accepts text input, no tools, no Run, `reasoningEffort: low`, and `maxOutputTokens: 16384`. The authenticated session binds the unified `createModelRuntime` service. The service opens and dispatches a call; its bounded, session-authorized observer delivers the stream to the terminal. The demo registers each call's host owner before sending and retains that owner through physical stop. Opening an existing conversation authenticates, checks session ownership, and reconciles the durable model log before any new call; it never resends automatically. The demo persists a completed reply and its model response in one durable batch before the next turn. Each request passes the complete validated message history, including prior reasoning and media blocks, to the invocation layer without a text-only whitelist. Visibility and model compatibility follow the shared contracts; the CLI currently accepts text input only. `/history` reads the actual session log. Restart with the same data path to authenticate again and resume the session; registration and source publication are not replayed.

Use `--max-output-tokens <positive-integer>` to change the per-response limit (default: 16,384). The selected model profile still enforces its maximum; the demo does not silently clamp an excessive value. This limit includes reasoning tokens counted in output usage. Restarting with the same `--data` and a different limit preserves the session history.
The current development format carries complete project input limits, upstream limit facts, and required MR9 input calibration in each response. Data created by an older incompatible development version is not guessed, rewritten, or converted; use a new explicit `--data` directory for this version and retain any old directory unchanged.

Both token margin options are explicit, required deployment choices. This example uses `ceil(estimatedTokens * 1.1) + 256` against the project input cap. The fixed DeepSeek meter currently measures the final input in full on every turn because that route has no accepted marginal meter. For later turns, the runtime checks the authenticated, actually selected no-Run JSONL message chain and its original response, dispatch, and reply relationships. It passes the newest usable accurate upstream input observation to the same transport planner, which may measure only the replayed output and new input when its basis and projection still apply; controlled Anthropic service tests exercise this path. A changed model or input prefix triggers full measurement; a turn without usable usage can leave an earlier legitimate observation available. This never changes historical responses or substitutes estimates for actual usage and cost. The margin is configurable and does not guarantee equality with upstream counting. Programmatic local callers use `openDemo(dataDirectory, tokenMargin, retirement, maxOutputTokens, credential?, testOptions?, observerBounds?, host?)`, which returns the actual application and authenticated actor. The CLI uses `createDemoSupervisor(...).open()` and a distinct remote facade with serializable commands and display identity; its worker calls that same local `openDemo` and verifies identity for each operation. The deployment `modelRequest.transport.retirement` requires a positive `waitMilliseconds`, `force`, and a replaceable `schedule`; a timed-out wait keeps the owner and does not claim resource cleanup. The CLI sets `force=false` and a configurable 10,000 ms retirement wait via `--transport-retirement-wait-ms <positive-integer>`.

The observer defaults to a finite 256 events and 262,144 bytes; programmatic callers can configure both positive bounds. Delivery diagnostics and backpressure never substitute for persisted history or settlement.

The CLI owns one long-lived worker process for the data root across turns. That worker owns Cordis, storage, the session log, credentials, model calls, and their close path; the CLI supervisor owns its child instance and IPC. It starts a successor only after observing the previous child process's actual `exit` and stream `close`. IPC disconnect or a kill request alone never proves exit. `--ipc-max-message-bytes` and `--ipc-max-commands` set finite IPC bounds; the byte bound applies to each complete IPC envelope in both processes. The key file is read inside the worker only after old durable calls are reconciled; its path, never its value, crosses IPC. A missing specified key can still make startup fail after recovery has committed. The deployment must reserve the data directory for this supervisor's worker chain.

Within one surviving supervisor, a worker killed after a durable dispatch can be replaced; the successor reconciles the original session log with zero new model HTTP requests. A newly started CLI cannot inherit another supervisor's exit evidence. If the old owner of an unfinished call is unknown, opening refuses before a new request. A clean log marker or an obtainable file lock does not prove that an old model effect stopped. Fully settled history can be reopened by a new CLI. The local HTTPS test covers an actual dispatch, SIGKILL, child exit, same-supervisor recovery, and refusal under a new supervisor; the remaining cold recovery and fault cases are tracked in the runtime realization.

The programmatic `AcceptanceDiagnostics.record` port now receives typed `settlement` and `observer` correlation on the applicable operation events. Settlement events retain tenant, session, call, dispatch, response, owner, policy and contention counts. Observer rejection events retain tenant, session, call, dispatch, position and buffer counts. The assembly projects only these existing fields; request text, credential values, tool data and configuration bodies stay out of this diagnostic port. A throwing or asynchronous sink increments `status().diagnosticFailures` independently of the model result; the counter remains readable after `close()`. This callback is synchronous and best-effort. The separate typed collectors described below provide bounded JSONL storage and query; neither interface guarantees lossless diagnostic delivery.

## Run

Use the Node and pnpm versions declared at the repository root. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build
umask 077
export OPENROUTER_API_KEY='your actual OpenRouter key'
node examples/model-invocation-minimal-demo/dist/cli.js --data "$PWD/tmp/my-model-demo" --token-margin-multiplier 1.1 --token-margin-reserve 256
```

If your shell is already in `examples/model-invocation-minimal-demo`, run the built file relative to that directory instead:

```sh
node dist/cli.js --data ../../tmp/my-model-demo --token-margin-multiplier 1.1 --token-margin-reserve 256
```

Use a **new** `--data` path for a new demo. The demo creates it with owner-only permissions. Use the same path to resume after `/exit` or end-of-file. An existing directory is accepted only when its authenticated session and durable log can be read and reconciled; unknown unfinished work is refused. Alternatively, place the credential in an owner-only file and pass `--key-file /absolute/private/key`; never pass a key value as a command-line argument. The file must have mode 0600 and contain only raw key bytes, not `.env` syntax; one final newline is ignored. After successful publication into the encrypted replica, a normal restart can omit the environment variable and `--key-file`. A supplied key on restart is a replacement through the actual credential publication API.

```text
You> Say hello.
Assistant> Hello!
Saved. {"outcome":"complete", ...}
Cumulative: input 5, output 3, cache read 4, cache write 0 tokens; actual USD 0.0000117
You> /models
* deepseek/deepseek-v4-pro-0813 [official] legal
  deepseek/deepseek-v4.1-flash [official] legal
You> /model deepseek/deepseek-v4.1-flash
Selected: deepseek/deepseek-v4.1-flash
Effective: deepseek/deepseek-v4.1-flash (session, official)
You> What did I ask?
Assistant> You asked me to say hello.
Cumulative: input 1e1, output 6, cache read 8, cache write 0 tokens; actual USD 234e-7
You> /history
user: Say hello.
assistant: Hello!
user: What did I ask?
assistant: You asked me to say hello.
You> /exit
Closed. Start again with the same --data path to resume.
```

The numbers in the transcript are illustrative; the exact answer, token usage and USD cost come from the upstream response. Each submitted message can incur OpenRouter charges. `/models`, `/model`, `/history`, and `/help` do not send an HTTP model request or incur model-call charges. After each durably settled response, including a failed one, the terminal rereads this authenticated session's persisted model responses and prints cumulative input/output and cache tokens plus actual USD. A missing value is shown as `known + N unknown`, with an `incomplete` marker; it is never estimated or counted as zero. Restarting with the same data path restores the same total. A durable failed model response prints a generic failure message and exits nonzero after closing; upstream error text is not printed. There is no automatic retry or fallback. Unknown slash commands are rejected locally. Ctrl+C during a call requests **system stop** and waits for actual settlement and application close; it is not the durable user interruption operation. Refused requests, unknown commits, and incomplete close remain visible. Never reset data or automatically resend an unknown call.

The data directory contains SQLite state, JSONL session history, generated signing keys, the replica encryption key, and `demo-state.json` with a local demo account password. Keep the directory private; back it up together if you need the history. The OpenRouter key is held by the encrypted replica and is not saved as plaintext in demo metadata. Interrupted initial setup remains marked incomplete and is not silently replayed. This example exercises a no-Run subset of the runtime operations; it does not implement complete Session/Inbound/Agent Loop, all official models, general Run failure history, an interactive recovery command, or model certification.

The public root also exports `createAcceptanceApplication`, its configuration and result types, and fixed stage fiber names for development consumers. The assembly owns its Cordis context and lifecycle. Its `currentTime()` is a narrow read of its existing lease Clock for this example's message and invocation timestamps; an unavailable clock prevents a send. Its `AcceptanceHooks` and `developmentTransport` are trusted test controls, not tenant input. The authentication-only stage sends no model request.

Validate with `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run build`, `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run typecheck`, `pnpm --filter @omne-harness-lite/model-invocation-minimal-demo run test`, and `python3 examples/model-invocation-minimal-demo/tests/pty-check.py` from the repository root. Tests use a local controlled TLS endpoint and never a production credential. The service, selection, observer, recovery, and calibration mapping follows [RT10](../../.meta_harness/design/spec/capabilities/model-request-runtime/v10/contract.md), [D107](../../.meta_harness/design/record/decisions/model-input-usage-calibration-adoption/decision.md), and the [runtime realization](../../.meta_harness/design/realization/packages/model/model-request-runtime/README.md); durable response semantics follow [MR9](../../.meta_harness/design/spec/data/model-response/v9/contract.md).

The preceding unified-service assembly has [bounded real OpenRouter PTY evidence for three turns](../../.meta_harness/design/record/evidence/2026-09-28-tests-model-invocation-demo-service/README.md). This model-switch revision is verified against controlled local TLS and PTY; it has not been certified by a paid cross-model request.

Programmatic callers can use `startServiceCall(actor, session, { user, parameters, host, observer? })` with a complete judged `UserMessage`, including image blocks. The assembly appends that exact message before opening the call and lets the chosen model and transport check compatibility. A controlled TLS test exercises two actual Flash service turns with different PNGs, persistent JSONL history, and the full second-turn wire request. The interactive CLI still accepts text only; this API does not add attachment syntax, tool execution, or a Run.

Trusted deployments may supply `modelRequest.assetRegistry` as a borrowed `AssetRegistryService.lookup` port. Then `startServiceCall` accepts `tools: ModelToolName[]`, resolved by the runtime against that session's real registry; absent registry plus nonempty tools returns unavailable. An external tool-result writer can call `appendServiceToolResult(actor, session, { message, host })` with a judged `ToolMessage` after a complete model tool call has been persisted. The application checks current identity, host ownership, and pairing against the full durable prefix before one conditional append. It does not execute the tool or invent a Run. The owner of the borrowed registry must keep it available until application close; the CLI does not configure one. A controlled TLS test covers actual registry/manifest/evaluation-input fill, tool declaration, persisted assistant call and response, paired result, subsequent wire history, rejection paths, and close.

### Local engineering journal

The demo authenticates first, opens separate owner-only local and verified-tenant JSONL collectors, then activates its model-request fibers in the same Cordis context. For programmatic assembly, `createAcceptanceApplication(...).ready` prepares identity and session-log access; call `activateModelRequest(actor, diagnostics, diagnostics.transports)` only after authenticating and opening both diagnostic owners. The argument supplies the `local` and `tenant` handles. A failed activation does not open model admission.

Each transport construction reserves a generation before creating the service. Its registry borrows a record-only port bound to the local collector and the fixed `transport:<generation>` execution ID; registration and retirement events come from the actual registry. A confirmed resource-free abort leaves a generation gap; an unknown construction retains its reservation. These events do not enter the tenant journal. The service's `inspect()` reports registry delivery failures and drops separately from network diagnostics and collector health, including on retained terminal snapshots.

The diagnostic wall clock reads the host source exported by `@omne-harness-lite/clock` and remains available to retained readers after the application's leased business Clock closes. Unreadable or backward time makes retention queries unavailable.

`openDemo(...).diagnostics.tenant` and `.local` expose bounded `query`, `exportPage`, and `health` to the trusted local host. `close()` stops business work before diagnostic writers and returns `complete`, `businessComplete`, diagnostic close results and transport health. Retain the same owner and retry when incomplete. Read handles remain usable after close. These engineering records are separate from session history.

Engineering read handles remain usable after an actual Cordis model-contribution unload and application close. Unload retires the registry registration and waits for outstanding call-host references; requesting disposal alone does not prove completion. If a diagnostic sink is still pending after business close, the close result remains incomplete with the pending count. Wait for the actual sink, then retry the same owner. The accepted, written and flushed sequence watermarks are distinct: a failed sync does not claim a flushed record or undo a durable session reply.

A trusted programmatic host can set `DemoDiagnosticConfig.journalFileSystem` for both diagnostic journals; omitting it uses Node's filesystem. This supports development fault injection and local embedding. There is no CLI filesystem override. Diagnostic write or sync failure leaves the business reply in the separate session log and reports the affected diagnostic close component.

Planning measurement records contain only a closed projection: mode, fallback, precision, predicted and admission tokens, signed contributions, safe basis revisions and the retained source prefix summary. They omit `configuration.values`. The journal owns a frozen copy before asynchronous writing, and uses the same validation when reopening, querying and exporting. Collector `planning` stage durations cover the whole planning boundary, including diagnostic projection; they are not tokenizer-only timings. Estimates never enter cumulative actual usage or billing.

`createDemoDiagnosticConfig` declares the example's limits; independent assembly callers can supply their own complete `DemoDiagnosticConfig`. Current, constructing, old live and terminal transport generations share one retention bound (four in the example configuration). A new construction first reserves capacity, evicting terminal snapshots when needed; if live owners occupy the bound, construction is refused. Physical TTL deletion runs only while an owner is active or maintenance is reopened, not while the process is absent.

```ts
import type { DemoConversation } from '@omne-harness-lite/model-invocation-minimal-demo'

export async function closeAndReadDiagnostics(demo: DemoConversation) {
  const closed = await demo.close()
  const tenant = demo.diagnostics.tenant
  const page = await tenant.query({ scope: tenant.scope, limit: 32, maxBytes: 65_536 })
  return { closed, page, health: tenant.health() }
}
```

`createDiagnosticJournal(config)` creates and exclusively owns a new collector directory under a private root; `openDiagnosticJournalReader(config)` reopens it read-only after close or restart. Supply `DiagnosticJournalConfig` explicitly, including scope, clocks, scheduler, retention and query/export limits. This provider is available independently and is wired into the CLI through the diagnostic assembly.

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

Queries and `exportPage(query, { maxRecords, maxBytes })` require the exact bound scope. Empty `through.sequence='0'` fixes an empty snapshot, not a record identity. Expired cursors, corruption, timeout and capacity exhaustion have explicit results. TTL cleanup runs while an owner is active; it does not continue after process exit. Retention health reports records and bytes, and failed deletion or unfinished I/O never counts as freed space. These engineering records are separate from session history.

A send result's `released` describes that stop attempt. If a terminal callback is still running it remains false; after the callback actually stops, an explicit `close()` retry can complete, and the supervisor waits for the worker's real exit. `currentTime()` remains readable for admitted work during close while the Clock is alive; it becomes unavailable after its fiber is disposed.

The supervisor's trusted fault controls can retain a completed worker reply and replay it with a colliding request ID against the successor; the original generation still prevents delivery. `inspect().nativeIpcBackpressureObserved` reports whether Node's actual IPC send buffer applied backpressure. These controls support local recovery tests and are not tenant operations.

## Development runner host

The local application returned by `createAcceptanceApplication()` also offers
`runExtensionPass(actor, session, request)` for explicitly supplied development
extensions. `DemoRunnerRequest` uses the runner package's existing pass, chain,
and non-storage ports. Supply real execution and waiting sources for the ports
you use; an `isActive()` result does not prove a Run or a waiting-card fact.
This entry does not register a production chain or add a model command.

The application authorizes the actor and session, and supplies the shared JSONL
binding, conclusion writes, reminder reads/writes, and physical task owner.
Callers cannot replace these storage ports or claim that the writer has stopped.
`subjectForCandidate` identifies the original positioned subject for each
conclusion, including nested passes; the runner adapter checks their relation.

Always await `app.close()`. It closes runner admission and cancels passes,
retains still-running contributions, stops other shared-log consumers, and then
closes the actual log. An uncertain append is resolved only by reopening the
same log through SL3 recovery admission and reading its original key. A writer
whose exit is still unknown remains unfinished; clearing an I/O fault alone does
not make that writer safe to reuse. Do not report `complete: false` as a clean
shutdown.

The executable example covers authenticated calls, reminder persistence,
replay, and close/reopen, together with local filesystem failure injection:

```sh
# From the repository root; no model credentials or paid requests are used.
pnpm --filter @omne-harness-lite/model-invocation-minimal-demo exec vitest run tests/runner-host.spec.ts --maxWorkers=1
```
