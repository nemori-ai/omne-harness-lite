# w3-mcp-call context map

Read-only research. Source tree at HEAD 60124023657: `ROOT=/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-lifecycle`.
Paths below are relative to `ROOT`. `C/` = `packages/mcp/mcp-contract/`, `M/` = `packages/mcp/mcp/`.
Wave spec: `/data/qiwei/repos/omne-harness-lite/.worktrees/skill-mcp/tmp/skill-mcp-domain/waves/w3/mcp/spec.md` (`WS`).
Grep scope: `git grep` for tracked files; plain `grep -rn` where noted (dist is build output, not tracked).

---

## 1. Contract call surface

### 1.1 services.ts (`C/src/services.ts`)

- `:92-101` `export type InvokeRequest = Readonly<{ ref: EndpointRef; action: ActionName; args: JsonValue; expectedDefinition: DefinitionDigest; correlationKey: CorrelationKey; signal: AbortSignal; connectBound?: Millis; observe?: (notification: PeerNotification) => void }>`
  - No `continuation`, no `issuedAt`.
- `:103-114` `export type ContinueRequest = Readonly<{ ref; action; args: JsonValue; requestState?: RequestState; inputResponses: JsonValue; issuedAt: Generation; correlationKey; signal; connectBound?: Millis; observe? }>`
  - **`inputResponses` is REQUIRED** (`:108`, `inputResponses: JsonValue`). `requestState` is optional (`:107`).
- `:116` `export type CancelAnswer = 'signalled' | 'no-call-in-flight' | 'unknown'`
- `:118-123` `export interface ActionCalls<P>`
  - `:119` `invoke(access: Access<P>, request: InvokeRequest): Promise<InvokeResult>`
  - `:120` `continueWithInput(access: Access<P>, request: ContinueRequest): Promise<InvokeResult>`
  - `:122` `cancel(access: Access<P>, correlationKey: CorrelationKey): Promise<CancelAnswer>`; comment `:121`: finds by tenant, principal, key; no eligibility check.
- `:125-130` `export type TaskRef = Readonly<{ ref: EndpointRef; taskId: TaskId; issuedAt: Generation; connectBound?: Millis }>`
- `:132-136` TaskControl doc: open only to the tenant+principal that started the task in this run; others and unknown tasks get `unknown`.
- `:137-154` `export interface TaskControl<P>`
  - `:138-141` `queryTask(access: Access<P>, task: TaskRef): Promise<Outcome<TaskReport | 'expired', OperationFailure>>`
  - `:142-145` `taskResult(access: Access<P>, task: TaskRef): Promise<Outcome<CallOutcome | 'not-finished' | 'expired' | 'cancelled', OperationFailure>>`
  - `:147-151` `provideTaskInput(access: Access<P>, task: TaskRef, inputResponses: JsonValue): Promise<Outcome<'accepted', OperationFailure>>`
  - `:152` comment: "Does not check adoption or eligibility. A terminal state is learned through `queryTask`."
  - `:153` `cancelTask(access: Access<P>, task: TaskRef): Promise<Outcome<'requested', OperationFailure>>`
- `:156` `export type ActionInvoker<P> = ActionCalls<P> & TaskControl<P>`
- `:221-230` `export type McpPorts<P, S> = Readonly<{ adoption: AdoptionView<P, S>; eligibility: UseEligibility<P>; credentials: CredentialUse<P>; landing: ProcessLanding<P>; store: CatalogStore; transports: McpTransportFactory; clock?: McpClock }>`
  - `:228` comment: absent means the implementation takes the host clock. `clock?` at `:229`.
- `:236-245` `export type McpConfig<P> = Readonly<{ principalKey: (principal: P) => string; maxListingPages: number; maxActions: number; instructionsByteLimit: number }>`
  - All four required (`:238`, `:240`, `:242`, `:244`). No defaults.
- `:247-253` `export type McpServices<P, S> = Readonly<{ inspection: EndpointInspection; discovery: ActionDiscovery<P>; invoker: ActionInvoker<P>; status: EndpointStatus<P, S>; connections: Connections<P> }>`
- `:76-79` `ActionDiscovery.refresh(access, request: Readonly<{ ref: EndpointRef; connectBound?: Millis; signal?: AbortSignal }>): Promise<Outcome<RefreshResult, OperationFailure>>`
- `:63` `KeptReason` includes `{ kind: 'listing-incomplete'; defect: ListingDefect }`.
- `:168`, `:162-170` `LostReason`, `:175-178` `ConnectionState`, `:184-189` `EndpointStatusView`, `:203-205` `ReleaseReport`, `:207-219` `Connections<P>` (`release`, `closeAll`).

### 1.2 outcomes.ts (`C/src/outcomes.ts`)

- `:200-202` `export type InvokeResult = Readonly<{ kind: 'not-sent'; reason: NotSentReason }> | Readonly<{ kind: 'sent'; outcome: CallOutcome }>`
- `:71-87` `export type CallOutcome` (camelCase kinds as written):
  - `:72-77` `{ kind: 'complete'; content: readonly DeliveredContent[]; structured?: JsonValue; output: OutputCheck }`
  - `:78` `{ kind: 'toolError'; content: readonly DeliveredContent[]; structured?: JsonValue }`
  - `:79-84` `{ kind: 'inputRequired'; inputRequests?: Untrusted<JsonValue>; requestState?: RequestState; issuedAt: Generation }`
  - `:85` `(Readonly<{ kind: 'task'; taskId: TaskId; issuedAt: Generation }> & TaskHints)`
  - `:86` `{ kind: 'protocolError'; fault: ProtocolFault }`
  - `:87` `{ kind: 'unknown'; cause: NoAnswerCause }`
- `:89` `TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'`
- `:96-100` `TaskHints = Readonly<{ pollIntervalMs?: number; ttlMs?: number; statusMessage?: Untrusted<string> }>`
- `:103-104` `TaskReport = Readonly<{ status: TaskStatus; inputRequests?: Untrusted<JsonValue> }> & TaskHints`
- `:55` `NoAnswerCause = 'stream-broken' | 'process-exited' | 'abandoned'`
- `:58-61` `PeerAnswer` = `result` (`result: JsonValue`) | `error` (`error: JsonValue`) | `no-answer` (`cause`)
- `:64-68` `ProtocolFault` = `peer-error` (code, message, data?) | `result-type-unknown` | `result-malformed` | `error-malformed`
- `:42-45` `OutputCheck` = `conforms` | `violates` (reason: string) | `no-schema`; `:52` `OutputValidator = (structured: JsonValue, outputSchema: JsonValue) => OutputCheck`
- `:9-19` `ContentDefect`; `:26-39` `DeliveredContent` = `block` | `protocol` | `invalid`
- `:129-134` `Refusal` = `not-available-to-you` | `blocked` (reason: BlockedReason) | `unknown` | `config-missing` (item: ConfigItem) | `config-invalid` (item: Exclude<ConfigItem, env.*>)
- `:107` `BlockedReason = 'local-command-not-enabled' | 'disabled'`; `:123` `ConfigItem = 'connect-timeout' | 'target' | 'credential' | env.${string}`
- `:137-141` `ConnectionFailure` = `credential-unavailable` (cause: missing|rejected|unknown) | `authorization-required` (discovery: AuthorizationDiscovery) | `landing-unavailable` | `connection-unavailable`
- `:144-149` `ErrorAnswer` = `{ kind: 'error-answer'; code: number; message: string; data?: JsonValue }`
- `:155-158` `EffectUnknown` = `{ kind: 'effect-unknown'; cause: NoAnswerCause | 'no-connection' }`
- `:164-175` `AnswerMalformed` = `{ kind: 'answer-malformed'; what: 'status-unknown' | 'input-requests-missing' | 'result-missing' | 'error-missing' | 'error-shape' | 'tools-missing' | 'cursor-invalid' | 'discover-shape' }`
- `:178-183` `OperationFailure = Refusal | ConnectionFailure | EffectUnknown | ErrorAnswer | AnswerMalformed`
- `:186-189` `ReadFailure = Exclude<OperationFailure, effect-unknown | error-answer | answer-malformed>`
- `:192-198` `NotSentReason` (closed set, complete list):
  1. `Refusal`: `not-available-to-you`, `blocked` (+reason), `unknown`, `config-missing` (+item), `config-invalid` (+item)
  2. `{ kind: 'correlation-key-in-use' }` (`:194`)
  3. `{ kind: 'cancelled' }` (`:195`)
  4. `{ kind: 'definition-changed' }` (`:196`)
  5. `{ kind: 'action-unavailable' }` (`:197`)
  6. `ConnectionFailure`: `credential-unavailable`, `authorization-required`, `landing-unavailable`, `connection-unavailable`
  - No `effect-unknown`, no `session-ended`, no `error-answer`.
- `:111-120` `AuthorizationDiscovery`; `:96` `TaskHints`; `:21-25` comment on DeliveredContent.

### 1.3 transport.ts (`C/src/transport.ts`)

- `:25-36` `TransportFailure`:
  - `:26` `{ kind: 'not-sent'; cause: 'connection-unavailable' }`
  - `:28` `{ kind: 'not-sent'; cause: 'session-ended' }`
  - `:29-33` `{ kind: 'not-sent'; cause: 'authorization-required'; discovery: AuthorizationDiscovery }`
  - `:34` `{ kind: 'no-answer'; cause: NoAnswerCause }`
  - `:35` `ErrorAnswer`; `:36` `AnswerMalformed`
- `:39` `WithheldReason = 'header-invalid'`
- `:46-51` `ListingPage = Readonly<{ tools: readonly JsonValue[]; nextCursor?: string; ttlMs?: number; withheld?: readonly Readonly<{ name: Untrusted<string>; reason: WithheldReason }>[] }>`
- `:58-62` `CallRequest = Readonly<{ action: ActionName; args: JsonValue; continuation?: Readonly<{ requestState?: RequestState; inputResponses?: JsonValue }> }>`
  - `inputResponses` optional here (`:61`). No progress token field (transport-internal, SPEC T3 `C/SPEC.md:449`).
- `:65-68` `PeerNotification = Readonly<{ kind: 'progress' | 'log'; notification: Untrusted<JsonValue> }>`
- `:71` `SentCall = Readonly<{ requestId: string; answer: Promise<PeerAnswer> }>`
- `:74-78` `TaskAnswer` = `finished` (answer: PeerAnswer) | `cancelled` | `not-finished` | `expired`
- `:80-106` `export interface McpTransport`:
  - `:82` `readonly generation: Generation`
  - `:84` `discover(): Promise<Outcome<PeerIdentity, TransportFailure>>`
  - `:85` `listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>>`
  - `:87-91` `call(request: CallRequest, signal: AbortSignal, observe?: (notification: PeerNotification) => void): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>>`
  - `:93` `cancelRequest(requestId: string): Promise<void>`
  - `:95` `getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>>`
  - `:97-100` `updateTask(taskId: TaskId, inputResponses: JsonValue): Promise<Outcome<'accepted', TransportFailure>>`
  - `:101` `getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>>`
  - `:103` `cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>>`
  - `:105` `close(): Promise<void>`
  - **No `markSent` / `markEnded` here.** Those are on member `InFlightCalls` (`M/src/internal/in-flight.ts:40`, `:54`).
- `:112-125` `TransportMaterial` = `stdio` (process: ProcessHandle, generation, instructionsByteLimit) | `streamable-http` (target, credential?: HttpCredentialHandle, generation, instructionsByteLimit)
- `:127-131` `export interface McpTransportFactory { open(material: TransportMaterial, signal: AbortSignal): Promise<Outcome<McpTransport, TransportFailure>> }`
- `:18-24` header comment: transport implementations hand over the peer answer and do not classify it.

### 1.4 ports.ts (relevant bits)

- `:101-104` `export interface McpClock { now(): Date }`
- `:107` `StopScope = 'tree-confirmed' | 'root-only' | 'unconfirmed'`
- `:110-121` `ProcessHandle` (`stdin`, `stdout`, `stderr`, `exited`, `stop(): Promise<StopScope>`)
- `:129-135` `ProcessLanding<P>.start(access, launch, env): Promise<Outcome<ProcessHandle, 'landing-invalid' | 'facility-missing' | 'unknown'>>`
- `:52-54` `UseEligibility<P>.check(access, endpoint): Promise<EligibilityVerdict>`; `:47-50` `EligibilityVerdict` = granted | refused (not-eligible | BlockedReason) | unknown
- `:24-30` `AdoptedEndpoint` (ref, revision, body, settings, processEnv); `:32-40` `AdoptionView<P,S>.endpoints/endpoint`
- `:86-99` `CredentialUse<P>.acquire` (two overloads: process / http purpose)
- `:137-145` `CatalogStore.read/write`

### 1.5 Pure functions the call path needs (root exports)

Root exports: `C/src/index.ts:53-96` (exact list at `:83-85` for the call-relevant ones).

- `classifyOutcome(answer: PeerAnswer, context: ClassifyContext): CallOutcome` — `C/src/classify.ts:137-150`. Total, no throw; `no-answer` -> `{kind:'unknown', cause}` (`:143-144`). Doc `:130-136`.
- `ClassifyContext = Readonly<{ issuedAt: Generation; outputSchema?: JsonValue; checkOutput: OutputValidator }>` — `C/src/classify.ts:14-20`. Output validator called only when schema declared and structured present (`:27-31`).
  - Exported but NOT from root: `countOf` (`classify.ts:67`), `taskHintsOf` (`classify.ts:77`).
- `toContentBlocks(items: readonly JsonValue[]): readonly DeliveredContent[]` — `C/src/content.ts:127-129`.
- `canonical(value: JsonValue): JsonValue` — `C/src/json.ts:41-62` (root export `index.ts:83`).
- `sameJson(left: JsonValue, right: JsonValue): boolean` — `C/src/json.ts:65-67` (root export `index.ts:83`).
- `isActionArgs(value: JsonValue): value is ActionArgs` — `C/src/args.ts:10` (root `index.ts:81`). `ActionArgs = JsonObject` (`args.ts:7`).
- `classifyWireEvent(event: WireEvent, context: WireContext): WireClassification` — `C/src/wire.ts:357` (root `index.ts:89-95`). Transport-side only.
- `boundInstructions(text: string, byteLimit: number): BoundedInstructions` — `C/src/instructions.ts:19`.
- `digestDefinition(definition: ActionDefinition): DefinitionDigest` — `C/src/listing.ts:77-89`.
- `mergeListing(current: CatalogState, listing: CompleteListing): Outcome<ActionCatalogRecord, MergeRefusal>` — `C/src/catalog.ts:88-91`; `markUnavailable` `C/src/catalog.ts:120`; `actionPermissionItems` `C/src/catalog.ts:139`.
- Keys: `peerAccountOf(auth: AuthKind, binding: CredentialBinding | undefined): Outcome<PeerAccount, 'credential-missing'>` — `C/src/keys.ts:13-18`; `catalogKeyOf(tenant, endpoint: AdoptedEndpoint, account: PeerAccount): CatalogKey` — `C/src/keys.ts:23-28`; `connectionKeyOf(tenant, endpoint: AdoptedEndpoint, account: PeerAccount): ConnectionKey` — `C/src/keys.ts:32-37`.
- Brand guards: `isActionName` `C/src/brands.ts:82`; `isCorrelationKey` `:106`; `isRequestState` `:111`; `isTaskId` `:115`; `isGeneration` `:98`; `isMillis` `:123`.
- In-flight helpers in the contract: none (in-flight table is member-only, section 4).

### 1.6 Root-export gaps for the call path

- `ListingPage`, `TransportFailure`, `McpTransport`, `CallRequest`, `McpTransportFactory`, `TransportMaterial`, `SentCall`, `TaskAnswer` are NOT in root `C/src/index.ts`. They are only on `@omne-harness/mcp-contract/provider` (`C/src/provider.ts:21-31`; `ports` types `:3-20`).
- `PeerNotification` IS root (`index.ts:147-148`); `ConnectionKey` type is in `values.ts:76` and root-exported (`index.ts:43`? — check: `ConnectionKey` listed at `index.ts:40`).

---

## 2. Contract SPEC clauses (`C/SPEC.md`, 675 lines)

Headings: `:138` 结果与不变量; `:142` 值与不可信内容; `:188` 清单与已知动作; `:215` 结局分类; `:233` 内容交付; `:250` 拒绝、连接失败、未发出与不可用; `:293` 应用服务接口; `:349` 所有权、失败与生命周期; `:424` McpTransport 与 McpTransportFactory（T）; `:599` 失败码索引; `:630` 组合与验证; `:666` 未封闭项.

- **S1** `:297` — every operation checks adoption (`AdoptionView.endpoint`) then eligibility (`UseEligibility.check`), except `ActionInvoker.cancel` and `Connections.closeAll`; the four task ops follow S2's connect rule.
- **S2** `:298-305` — call and task control.
  - `:299` `cancel`: looks up the in-flight table by (tenant, principal, key); no adoption/eligibility; placed-but-not-sent cancel gives `cancelled` for the call.
  - `:300` continuation after generation change: `unknown` (not sent), no resend. `continuation.requestState`/`inputResponses` each optional (`:300`).
  - `:301` task table keyed by (tenant, principal, holding, taskId), in-run only, no restart persistence.
  - `:302` task ops answer `unknown` to non-initiator, post-restart, and not-in-table tasks, regardless of existence.
  - `:303` connect rule for the four task ops, "`cancelTask` 也一样" (cancelTask too): reuse connection without adoption/eligibility; new connection requires `AdoptionView.endpoint` + `UseEligibility` = `granted`, else `effect-unknown` (`no-connection`).
  - `:304` `no-answer` -> `effect-unknown` for task ops; `error-answer`/`answer-malformed` passed through.
  - `:305` `taskResult` cancelled -> `cancelled`; `provideTaskInput` -> `accepted`; `cancelTask` -> `requested`; terminal via `queryTask`.
- **S3** `:306-313` — four required config fields; `createMcp` throws `RangeError` on bad config (`:309`); `acquiredAt` from `McpPorts.clock` (`:311`); `instructions` bounded via `boundInstructions` (`:313`).
- **S4** `:315-329` — config values table (`:317-322`); defect order target, credential, connect-timeout, env (`:315`); connect-timeout falls back to `connectBound` (`:326`); task ops give `effect-unknown` (`no-connection`) (`:329`).
- **S5** `:331-336` — refresh outcomes: `published`, `kept` superseded/cancelled/listing-incomplete, failure. `listing-incomplete` with `page-failed` for `no-answer|error-answer|answer-malformed` pages (`:335`).
- **S6** `:337` — progress/log via caller `observe`, untrusted, observer throws do not affect outcome.
- **S7** `:338-345` — connection states (`none|preparing|ready|degraded|lost`); `:339` "协商/会话" only for legacy; `:342` transport unavailable -> `lost` + `markUnavailable(connection-unavailable)`.
- **S8** `:346` — release/closeAll reporting; in-flight landing -> `unconfirmed`; after `closeAll` invoke answers `connection-unavailable`; task ops answer `effect-unknown (no-connection)` after the initiator check.
- **S9** `:347` — credential handle release; `closeAll` releases process handle immediately if landing pending.
- **R2** `:263-270` — `NotSentReason` list (`:264-267`); non-object `args` -> `TypeError` reject, not a reason (`:269`).
- **R4** `:272-279` — authorization discovery; `:273` root fallback `/.well-known/oauth-protected-resource`; `:278` 401 or 403 with `insufficient_scope`.
- **R5** `:280` — `CallOutcome` only for sent calls.
- **R6** `:281-285` — `ConnectionFailure` conditions.
- **R7** `:286-292` — `OperationFailure` composition; `effect-unknown` (`:287`), `answer-malformed` (`:289`).
- **T1** `:428` — transport failure by peer effect (four kinds).
- **T2** `:429-438` — answer criteria (`classifyWireEvent`). `:437` **"C1 不变：交出的页里一项非法，整份仍拒绝。"** (the page-level C1 whole-reject statement).
- **T3** `:439-449` — request composition; `_meta` keys; `:449` `progressToken`; `:447` `-32022` retry (`discover-retry`); `:448` requests from peer -> `-32601` (ping -> empty).
- **T4** `:450` — authorization failure on T8 S05.
- **T5** `:451-454` — cancel vs close ordering; `:453` `cancelRequest` per transport; `:454` `close()` only closes transport, does not stop process; stdio close order (stdin then stdout).
- **T6** `:455-460` — task ops: `getTask`/`getTaskResult` both send `tasks/get` (`:456`); `tasks/update` and `tasks/cancel` params (`:456`); `getTask` gives no result (`:457`); `getTaskResult` mapping (`:458`); `updateTask`/`cancelTask` ack only (`:459`); `no-answer` -> `effect-unknown` (`:460`). No `tasks/list`.
- **T7** `:461-468` — `answer-malformed.what` per T8 row.
- **T8** `:469-544` — decision table.
- **T9** `:545-546` — port failure handling for transport methods.
- **V1** `:144-146` — brands guarded by public-root guards only; request-state text may be empty (`:144`).
- **V2** `:145`, **V3** `:146`, **V4** `:147` (untrusted list).
- **O1** `:217`; **O2** `:218-222` — `result` classification by `resultType`; `:222` `task` outcome carries `taskId`, `issuedAt`, and TaskHints (`pollIntervalMs`, `ttlMs`, `statusMessage`); `:227` `result-malformed` conditions. **O3** `:223`; **O4** `:224`; **O5** `:225-228`; **O6** `:229`.
- **D1** `:235` — one-for-one, peer order, nothing dropped.
- **D2** `:236` — text/image/audio mapping, base64 standard with padding.
- **D3** `:237` — resource_link / resource keep protocol type.
- **D4** `:238-245` — `invalid` items, reasons `:242`-`:245`.
- **D5** `:246` — block ids `content-<index>`, unique per outcome; annotations untrusted; `_meta` separate.
- **C1** `:190-196` — `completeListing` constructs only if all of the following hold, else the first failing defect:
  - `:191` `page-failed`
  - `:192` `page-limit-exceeded`
  - `:193` `pages-unfinished`
  - `:194` `action-limit-exceeded`
  - `:195` **`action-invalid`**: "某一项不是对象，`name` 不是非空文本，`inputSchema` 不是对象，或 `outputSchema`、`annotations` 存在但不是对象。" (no `type: "object"` condition)
  - `:196` `duplicate-action-name`
- **C2** `:197` — `basedOn`, `acquiredAt` from caller, `ttlMs` min, `changedNotified` false.
- **C3** `:198`; **C4** `:199`; **C5** `:200`; **C6** `:201-209`; **C7** `:210`; **C8** `:211`.
- **Open item (quote, exact):** `:669` — "- C1 对 `inputSchema` 的容错：本组不比协议与官方 SDK 更严，「`inputSchema` 必须是 `type` 为 `"object"` 的对象」不作为 C1 的拒绝条件；不符的工具怎样处置还没有决定。拥有者：`@omne-harness/mcp` 的调用口实现。"
  - Section `未封闭项` `:666-675`. Other open items at `:667` (组页 601 deriveDeclarations) and `:670-675` (line-classification boundaries).
- **Deviation table:** `:572-578` (`与协议的偏离`), `:580` `理由`.
- **Port reject clauses (WS decision 4, already present):** AV7 `:367`; UE6 `:380`; CU8 `:393`; PL6 `:406`; `:353-355` ownership-rejects; CS and T clauses `:410-` and `:546`.
- `completeListing` specified at: `:190-196` (C1); `:197` (C2); `:335` (S5 listing-incomplete); `:625` (lifecycle note, C4); `:637`-`:642` tests row for C1-C8 (`:642`).

---

## 3. `completeListing`

- Source: `C/src/listing.ts:125-147`.
- Signature (exact): `export function completeListing(read: ListingRead): Outcome<CompleteListing, ListingDefect> {`
- Input: `ListingRead` at `C/src/listing.ts:91-98`: `pages: readonly Outcome<ListingPage, TransportFailure>[]`, `basis`, `acquiredAt: string`, `limits: Readonly<{ maxPages: number; maxActions: number }>`, `basedOn: ExpectedRevision`.
- Defect union (closed): `C/src/listing.ts:28-34`: `page-failed | pages-unfinished | page-limit-exceeded | action-limit-exceeded | action-invalid | duplicate-action-name`.
- Output shape: `CompleteListing = ListingFields & { readonly [complete]: true }` (`:25`); `ListingFields` at `:16-22`: `actions: readonly ListedAction[]`, `basis`, `freshness`, `basedOn`. `ListedAction` (`:14`) = `{ definition: ActionDefinition; digest: DefinitionDigest }`. There is no slot for dropped tools.
- Current behavior on an invalid tool: loop at `:132-138`; `actionDefinitionOf(tool)` returns `undefined` -> `return fail('action-invalid')` at `:134`. **Whole listing rejected** (defect kind `action-invalid`). Also `duplicate-action-name` at `:135-136` rejects the whole listing.
- `actionDefinitionOf` (`:55-71`) checks: object (`:56`), `name` valid `isActionName` and `inputSchema` is object (`:60`), `outputSchema` object if present (`:61`), `annotations` object if present (`:62`). It does NOT check `inputSchema.type === "object"`.
- Other whole-listing rejections: `pagesDefect` `:100-110`; `action-limit-exceeded` `:130`.

Callers (`git grep -n completeListing`, tracked files):
- Definition: `C/src/listing.ts:125`.
- Root export: `C/src/index.ts:60`.
- Contract src: `C/src/testing-catalog-store.ts:4` (import), `:25` (sample record builder); `C/src/testing-listing-cases.ts:13` (import), `:38` (listing builder, throws on failure).
- Contract tests: `C/tests/catalog.spec.ts:5, 40, 76 (describe), 78, 97, 102, 105, 110, 117, 121, 129, 138, 145, 164, 296, 303`; `C/tests/public-entry.spec.ts:33` (expected root key list).
- Member: `M/src/discovery.ts:8` (import), `:170` (call inside refresh); `M/tests/doubles/world.ts:17` (import), `:209` (test helper).
- Docs (not code): `C/docs/object-model.md:37`, `C/docs/flows.md:18`, `C/README.md:17`, `M/docs/flows.md:27`, `C/src/catalog.ts:81`, `C/src/listing.ts` comments `:1,:24,:36,:45,:47`.
- Also `dist/listing.d.ts:23` lists `action-invalid` (build output; do not edit).

Tests asserting whole-listing rejection on invalid tools:
- `C/tests/catalog.spec.ts:152-160` — `const invalid` table (7 rows, including `['not an object', json('a')]` at `:153`, `['no name', ...]` `:154`, `['an empty name', tool('')]` `:155`, `['no input schema', json({name:'a'})]` `:156`, `['an input schema that is not an object', ...]` `:157`, `['an output schema that is not an object', ...]` `:158`, `['annotations that are not an object', ...]` `:159`).
- `C/tests/catalog.spec.ts:163-169` — `it('refuses an action definition with ${name}')` expects `{ failure: 'action-invalid' }` at `:165`.
- `C/tests/catalog.spec.ts:101-105`? — `pages-unfinished` tests (not invalid-tool); not affected.
- `C/tests/catalog.spec.ts:145-149` — duplicate-name test is an inline `completeListing` call in "refuses a repeated action name across pages" block (`:111-120` region; the `duplicate-action-name` assertion at `:117` area). Not an invalid-tool case; still whole-reject, unchanged by the request unless duplicates are also changed.
- `C/src/closed-sets` test: `C/tests/closed-sets.ts:40` lists `'action-invalid'` in the closed set; `C/tests/spec-closed-sets.spec.ts` checks it (grep).
- `M/tests/refresh.spec.ts:184` — `['action-invalid', [{ listActions: { tools: [json({ inputSchema: {} })] } }]]` in `it.each` at `:177-` (test title `listing-incomplete (%s): the listing is not adopted`, `:187`); expects `kept` + `listing-incomplete` + `defect` and `record` absent (`:190-196`). Note the tool has no `name`, so it is invalid for the name reason too.

---

## 4. Member today (`M/src/`)

### 4.1 `index.ts` exports (complete list)

- `M/src/index.ts:18` `export { createInMemoryCatalogStore } from './store/memory.ts'` (value)
- `M/src/index.ts:19` `export type { McpDiscovery, RefreshRequest } from './discovery.ts'`
- `M/src/index.ts:25-30` `export type McpCore<P, S> = Readonly<{ inspection; discovery: McpDiscovery<P>; status; connections }>` (no invoker)
- `M/src/index.ts:32-35` `export type McpCoreOptions = Readonly<{ now?: () => Date }>`
- `M/src/index.ts:47` `export function createMcpCore<P, S>(` with params `ports: McpPorts<P, S>, config: McpConfig<P>, options: McpCoreOptions = {}`; return `McpCore<P, S>` (`:47-51`).
- Non-exported helper: `localNow` `M/src/index.ts:38-40`.
- Runtime-value exports: `createInMemoryCatalogStore`, `createMcpCore`. Test `M/tests/public-entry.spec.ts:6-7` asserts exactly those keys; `:13` asserts `Connection`, `InFlightCalls`, `admit`, `createConnectionTable` are not exported.

### 4.2 `createMcpCore` callers (`git grep -n createMcpCore`)

- Definition: `M/src/index.ts:47`.
- Member tests: `M/tests/core.spec.ts:6` (import), `:12` (describe), `:15, :16, :17, :21, :28, :47, :59, :78, :90`. `:47` passes `{ now: () => new Date('2026-11-03T08:00:00Z') }`.
- `M/tests/public-entry.spec.ts:6-7` (string keys).
- `M/tests/doubles/core.ts:1` (comment only; the helper duplicates the assembly, see section 5).
- Docs/README (must follow the change): `M/README.md:15, 27, 29, 81, 89`; `M/README_ZH.md:15, 27, 29, 81, 89`; `M/SPEC.md:26, 61, 118, 179`; `M/docs/architecture.md:9, 45`; `M/docs/context.md:7`; `M/docs/cordis.md:7`; `M/docs/public-api.md:9, 17`; `M/src/index.md:12`; `M/tests/index.md:13`.

### 4.3 In-flight table (`M/src/internal/in-flight.ts`, 93 lines)

- Exports: `export type InFlightKey` (`:8-13`: `tenant: TenantId`, `principalKey: string`, `correlationKey: CorrelationKey`) and `export class InFlightCalls` (`:24`). No free functions.
- Key text: `textOf(key)` `:20-22` = `JSON.stringify([tenantTextOf(key.tenant), key.principalKey, key.correlationKey])`. Keyed by (tenant, principal text, correlation key).
- Methods:
  - `reserve(key: InFlightKey): 'reserved' | 'in-use'` `:28-34` (duplicate check + placeholder in one step; ended key is free again).
  - `markSent(key: InFlightKey, requestId: string, generation: Generation): 'sent' | 'cancelled'` `:40-51`. Throws `TypeError` if not reserved (`:43-44`). Returns `cancelled` and sets ended if a cancel arrived during reserve (`:45-48`).
  - `markEnded(key: InFlightKey): void` `:54-56`.
  - `release(key: InFlightKey): void` `:59-62` (deletes only if reserved).
  - `cancel(key: InFlightKey, currentGeneration: Generation): CancelAnswer` `:69-86` (no entry -> `unknown`; ended -> `no-call-in-flight`; reserved -> sets cancelled, `signalled`; sent -> `signalled` iff generation equals current, else `unknown`).
  - `requestIdOf(key: InFlightKey): string | undefined` `:89-92`.
- Currently used only by `M/tests/in-flight.spec.ts:6`; no `src` consumer yet (`in-flight.ts:3` says "the call port of the next wave uses it").
- Not in `public-entry` (`M/tests/public-entry.spec.ts:13`).

### 4.4 Connection table (`M/src/internal/table.ts`, 468 lines)

- `export interface ConnectionTable<P>` `:74-110`.
- `ensure` `:76-80` exact: `ensure(admitted: AdmittedEndpoint, access: Access<P>, options?: EnsureOptions): Promise<Outcome<Ensured, EnsureFailure>>`
  - `EnsureOptions = Readonly<{ connectBound?: Millis }>` `:64`.
  - `AdmittedEndpoint` from `M/src/internal/gate.ts:31` (branded; only `judge`/`admit` grant it, `gate.ts:73-`).
- `settle` `:82-86`; `lose` `:91-96` (returns `Promise<CatalogMark | 'not-current'>`); `current(key: ConnectionKey): Ensured | undefined` `:98`; `stateOf(tenant, holding): ConnectionState` `:100`; `close(tenant, holding): Promise<ReleaseReport>` `:102`; `closeAll(): Promise<readonly ClosedEndpoint[]>` `:107`; `readonly runtime: TableRuntime` `:109`.
- `TableRuntime = Readonly<{ scope: TaskScope; startBound: StartBound }>` `:70`.
- `createConnectionTable<P, S>(ports: McpPorts<P, S>, config: McpConfig<P>, runtime: TableRuntime = { scope: createTaskScope(), startBound: startTimeout }): ConnectionTable<P>` `:144-148`.
- `Ensured` (what `ensure` returns on success), `M/src/internal/entry.ts:40-49`:
  - `transport: McpTransport` — **yes, hands back the transport**
  - `generation: Generation` — **yes**
  - `connection: ConnectionView` (`:31-35`: `generation`, `isCurrent(generation)`)
  - `peer: PeerIdentity`
  - `catalogKey: CatalogKey`
  - `adoptionRevision: AdoptionRevision`
  - `bound: Millis`
  - **No `ConnectionKey` field.** Recompute with `connectionKeyOf` (contract `keys.ts:32`).
- `EnsureFailure` `M/src/internal/entry.ts:73-76`:
  - `{ stage: 'settings'; reason: EnsureRefusal }` where `EnsureRefusal = SettingsFailure | AdoptionRefusal | ConnectionUnavailable` (`:71`)
  - `{ stage: 'connect'; reason: ConnectionFailure | EffectUnknown; catalog: CatalogMark }` (`:75`)
- `CatalogMark` `:54-59`: `marked | revision-conflict | unavailable | not-acquired | pending`.
- `CONNECTION_UNAVAILABLE` `:63`.
- `ensuredOf(entry)` `:217-230`.
- Discovery's usage of `ensure`: `M/src/discovery.ts:212` `within(table.ensure(admitted.ok, access, options), request.signal, scope)`.

Other member internals (for the call path):
- `admitForUse(gate: UseGate<P,S>, access, ref): Promise<Outcome<AdmittedEndpoint, GateRefusal>>` — `M/src/internal/guard.ts:37-44`. `UseGate = { ports; table }` `:19`. Closes the connection on `not-adopted`/`blocked` (`:22-24`, `:28-33`).
- `stillAdmitted` `M/src/internal/guard.ts:52-`.
- `GateRefusal` `M/src/internal/gate.ts:34`; `AdoptionRefusal` `:37`.
- `within`/`ask`/`startTimeout`/`StartBound` `M/src/internal/port.ts:9, 27, 29, 44`.
- `createTaskScope` `M/src/internal/scope.ts:23`; `TaskScope` type `:9` (name collides in spirit with a "task table"; it is a background-work scope, not a task table).
- `prepareSettings` `M/src/internal/settings.ts:100`; `readAccountOf` `:135`.
- `teardown` `M/src/internal/teardown.ts:26`; `narrowest` `:19`.
- `createTurns` `M/src/internal/turns.ts:9`.
- `validateConfig` `M/src/config.ts:27-33` (throws `RangeError`).
- `createStatus` `M/src/status.ts:68`; `createConnections` `M/src/connections.ts:16`; `createInspection` `M/src/inspection.ts:13`.
- `createInMemoryCatalogStore` `M/src/store/memory.ts:8`.

### 4.5 `discovery.ts` public shape (`M/src/discovery.ts`, 276 lines)

- `:38-42` `export type RefreshRequest = Readonly<{ ref: EndpointRef; connectBound?: Millis; signal?: AbortSignal }>` (same shape as contract's refresh request).
- `:44-49` `export interface McpDiscovery<P> extends ActionDiscovery<P> { refresh(access: Access<P>, request: RefreshRequest): Promise<Outcome<RefreshResult, OperationFailure>> }`
- `:51-57` `export type DiscoveryDependencies<P, S> = Readonly<{ ports; config; table; now: () => Date }>`; `now` at `:56`.
- `:95` `export function createDiscovery<P, S>(deps: DiscoveryDependencies<P, S>): McpDiscovery<P>`
- Clock use: `:173` `acquiredAt: deps.now().toISOString()` (not `ports.clock`).
- Canonical use: `:27` import `sameJson` from `./internal/canonical.ts`; `:229` `sameJson(record.basis.capabilities, connected.peer.capabilities)`.
- Contract-provider imports: `:26` `ListingPage, TransportFailure` from `@omne-harness/mcp-contract/provider`.
- `:59-62` constants `SUPERSEDED`, `CANCELLED`, `UNKNOWN`, `ABANDONED`.
- `:68-87` `afterMarking`.

### 4.6 Connections (`M/src/connections.ts`)

- `:11-14` `ConnectionsDependencies<P,S> = Readonly<{ ports; table }>`; `:16` `createConnections`; `:19-26` `release` via `admitForUse` then `table.close`; `:27` `closeAll: () => deps.table.closeAll()`.

---

## 5. Detours to delete (WS decision 26, line 77)

| Detour | Exists? | Definition | References (git grep / grep) |
|---|---|---|---|
| `McpDiscovery` | yes | `M/src/discovery.ts:44-49` (interface), `:95` (factory return type) | `M/src/index.ts:13` (import), `:19` (re-export), `:27` (`McpCore.discovery`); `M/tests/doubles/core.ts:4` (import), `:13` (type) |
| third arg `{ now }` | yes | `M/src/index.ts:32-35` (`McpCoreOptions`), `:38-40` (`localNow`), `:47-51` (3rd param), `:54` (`now: options.now ?? localNow`); `M/src/discovery.ts:56` (dep field), `:173` (use) | `M/tests/core.spec.ts:47`; `M/tests/doubles/core.ts:25`; `M/README.md:81`; `M/README_ZH.md:81`; `M/SPEC.md:118` (departure table row), `:61` (MC-7 text); `M/docs/architecture.md:45` |
| `internal/canonical.ts` | yes, 36 lines | `M/src/internal/canonical.ts:34` `export function sameJson(left: JsonValue, right: JsonValue): boolean` (private `canonical` at `:11`, `compareKeys` at `:5`) | `M/src/discovery.ts:27`, `:229`; `M/README.md:81` (departure text) |
| `tests/doubles/values.ts` | yes, 94 lines | exports `Principal` `:30`, `json` `:41`, `tenantOf` `:47`, `ref` `:54`, `adoptionRevision` `:59`, `binding` `:64`, `target` `:69`, `millis` `:74`, `generation` `:79`, `peerIdentity` `:84`, `home` `:89`, `away` `:90`, `alice` `:91`, `bob` `:92`, `mallory` `:93`, `principalKey` `:94` | importers (spec): `tests/entry.spec.ts:7`, `status.spec.ts:7`, `core.spec.ts:7`, `teardown.spec.ts:11`, `memory-store.spec.ts:11`, `shutdown.spec.ts:12`, `races.spec.ts:21`, `in-flight.spec.ts:8`, `refresh.spec.ts:9`, `config.spec.ts:6`, `gate.spec.ts:19`, `release.spec.ts:5`, `ensure.spec.ts:17`, `port-breach.spec.ts:11`, `connection.spec.ts:6`; importers (helpers): `tests/doubles/world.ts:44-45`, `ports.ts:21`, `faults.ts:13`, `stalls.ts:15`, `handles.ts:16`, `core.ts:8`; `tests/model/ports.ts:33`; `tests/model/explore.ts:49` |
| `tests/doubles/scripted-transport.ts` | yes, 125 lines | `Scripted<T>` `:18`; `Step` `:20-24` (`open`, `discover`, `listActions`, `close`); `Call` `:26-30`; `ScriptedTransports` `:32-37` (adds `calls`, `remaining()`); `scriptedTransports(script, trace)` `:68-71` | `tests/doubles/world.ts:32` (value import `scriptedTransports`), `:55` (type), `:92` (call with `record` trace); `tests/refresh.spec.ts:8` (type `Step`) |

Note: `tests/doubles/world.ts` imports the scripted transport, so the 12 specs that import `world.ts` reach it transitively: `gate`, `port-breach`, `memory-store`, `refresh`, `core`, `release`, `ensure`, `status`, `entry`, `shutdown`, `teardown`, `races`.

### 5.1 Contract replacements

- **Clock:** `McpClock` `C/src/ports.ts:101-104`; `McpPorts.clock?` `C/src/services.ts:229`; root type export `C/src/index.ts:147`. Contract test `C/tests/additive-shapes.spec-d.ts:39-41`. Member does not read `ports.clock` (grep: no `clock` in `M/src`).
- **canonical / sameJson:** root `C/src/index.ts:83`; implementation `C/src/json.ts:41` and `:65`. Member copy uses `<`/`>` string compare (`M/src/internal/canonical.ts:5-9`); contract uses `compareCodeUnits` (`C/src/json.ts:69-72`). Same ordering in practice; not a spec mismatch.
- **`./testing` sample builders:** `C/src/testing.ts:43-52` re-exports from `C/src/testing-values.ts`. Only 8 builders exist there: `jsonTextOf` `:29`, `jsonOf` `:36`, `generationOf` `:42`, `revisionOf` `:47`, `actionNameOf` `:52`, `protocolVersionOf` `:57`, `requestStateOf` `:62`, `taskIdOf` `:67`. No tenant/access/ref/millis/binding/target/adoptionRevision/peerIdentity/principal builders. Also `C/src/testing-case.ts:67` `tenantText` (text only, not a sample).
- **`createScriptedTransportFactory`:** `C/src/testing-scripted-transport.ts:1191-1194`:
  `export function createScriptedTransportFactory(script: PeerScript, options: ScriptedTransportOptions = {}): ScriptedTransportFactory`
  - Type `ScriptedTransportFactory = McpTransportFactory & Readonly<{ received(): readonly PeerReceived[] }>` at `:67-71` (only `received`; no `calls`, no `remaining`, no trace).
  - `ScriptedTransportOptions` `:53-65`: `protocolVersions?`, `clientInfo?`, `probeTimeoutMs?`, `pace?: (received) => Promise<void> | void`.
  - `open(material, signal)` `:1202-1204`: only failure is an already-aborted signal -> `not-sent connection-unavailable`. No scripted open failure step.
  - Exported from `C/src/testing.ts:84-88`.
- **Script type:** `PeerScript` `C/src/testing-transport.ts:90-112`: `discover?`, `initialize?`, `listing?: {[cursor]: Replies}`, `calls?: {[tool]: Replies}`, `tasks?: {[taskId]: TaskScript}`, `peerRequests?`, `notifications?`, `wellKnown?`.
  - `TaskScript` `:82`: `get?`, `update?`, `cancel?`.
  - `PeerReply` `:60-77`: `result` (PlainJson, optional notifications/headers) | `error` (PlainJson) | `unsent` | `silent` | `stream-breaks` | `process-exits` | `http` (status, headers?, body?).
  - `Replies` `:80`: one reply or list (last repeats).
  - Expressibility for `tools/call` (`calls[tool]` -> `result`/`error`):
    - completed: `result` with `content` list and no/`resultType: "complete"` (no `isError`) -> `complete`.
    - tool error: `result` with `isError: true` -> `toolError`.
    - input_required: `result` with `resultType: "input_required"` plus `inputRequests` and/or `requestState`.
    - task: `result` with `resultType: "task"` plus `taskId` (plus hints).
    - protocol error: `error`.
    - Default unknown tool: `-32602 'Unknown tool'` (`testing-scripted-transport.ts:182-187`).
  - `tasks/get` (= `getTask` AND `getTaskResult`, SPEC `C/SPEC.md:456`): `tasks[taskId].get`. Result object with `taskId`, `status` (checked against `TASK_STATUSES` `:80-86`), `inputRequests`, `result`, `error`.
  - `tasks/update`: `tasks[taskId].update` (`:190-194`); `tasks/cancel`: `tasks[taskId].cancel` (`:190-194`). Default for listed task with no script: `{result: {}}`; missing task: `-32602 'Task not found'` (`:188-192`).
  - **There is no separate `tasks/result` method.** `getTaskResult` sends `tasks/get`.
  - Failure kinds available: `unsent` (`not-sent`), `silent` (`no-answer abandoned`), `stream-breaks`, `process-exits`, `http` (status), `error`.
  - Missing from script: `open` failure step, deferred ordering (only `pace` hook at `:64`), `close` deferral, and `cancelRequest`/`close` scripting.

---

## 6. Member tests (`M/tests/`)

Top-level spec files with first header line (verified by reading headers):

- `config.spec.ts` (40): McpConfig validation, S3 (RangeError).
- `connection.spec.ts` (207): Connection aggregate transitions under both generation policies.
- `core.spec.ts` (111): `createMcpCore` config check, four services share table; passes `{ now }` at `:47`.
- `ensure.spec.ts` (661): table `ensure` reuse/rebuild/single flight, S4 setting defects.
- `entry.spec.ts` (106): forget predicate (decision 20).
- `gate.spec.ts` (275): `admitForUse` composition (adoption, eligibility, close).
- `in-flight.spec.ts` (138): `InFlightCalls` reserve/cancel isolation.
- `memory-store.spec.ts` (68): production in-memory catalog store runs the contract's conformance suite.
- `port-breach.spec.ts` (159): ports breaching contract (MC-15), via `ask`.
- `port.spec.ts` (89): `ask` and bounded wait.
- `public-entry.spec.ts` (15): root keys are exactly `createInMemoryCatalogStore`, `createMcpCore`; internals (`Connection`, `InFlightCalls`, `admit`, `createConnectionTable`) not exported.
- `races.spec.ts` (672): interleavings across publish boundary, build, close.
- `refresh.spec.ts` (547): `refresh` publish under S5; `listing-incomplete` table at `:177-200` (includes `action-invalid` row `:184`).
- `release.spec.ts` (151): `connections.release` close order and report.
- `shutdown.spec.ts` (249): `closeAll`, landings in flight.
- `status.spec.ts` (181): status port (credential states, use).
- `teardown.spec.ts` (304): one-entry teardown order and rejects.
- `turns.spec.ts` (51): one run at a time per key; each caller gets its own result.
- `types.spec-d.ts` (35): type tests for gate capability tokens.
- `model/lifecycle.spec.ts`: P1-P8 bounded explorer over the real table (`tests/model/*.ts` helpers: `explore.ts`, `ports.ts`, `properties.ts`, `scenarios.ts`).

Import of doubles:
- Import `tests/doubles/scripted-transport.ts`: `tests/refresh.spec.ts:8` (type `Step`); `tests/doubles/world.ts:32` (value; transitive to 12 specs, see section 5).
- Import `tests/doubles/values.ts`: 15 spec files (`entry`, `status`, `core`, `teardown`, `memory-store`, `shutdown`, `races`, `in-flight`, `refresh`, `config`, `gate`, `release`, `ensure`, `port-breach`, `connection`) plus helpers `doubles/world.ts:44`, `ports.ts:21`, `faults.ts:13`, `stalls.ts:15`, `handles.ts:16`, `core.ts:8`, and `model/ports.ts:33`, `model/explore.ts:49`.
- No test imports `doubles/core.ts` except through specs; `doubles/core.ts` builds the four services the `createMcpCore` way (`core.ts:19-33`), so it must move with `createMcpCore` removal.

---

## 7. Mismatches (wave spec decisions 27-34, plus 26 and the requested contract changes)

Decision text is at `WS:79-97` (decisions 27-34 at `WS:81-97`; 26 at `WS:77`). Item numbers below are mine.

### Decision 27 (`createMcp`, detours)

- M-01. `createMcp` does not exist. Only `createMcpCore` (`M/src/index.ts:47`). Expected, closure work.
- M-02. `McpPorts.clock` is ignored. Member reads `options.now` (`M/src/index.ts:34, 54`) and `deps.now` (`M/src/discovery.ts:56, 173`). WS decision 2 (`WS:46`) and SPEC S3 (`C/SPEC.md:311`) say `acquiredAt` comes from `McpPorts.clock`. Contract side is done (`C/src/services.ts:229`, `C/src/ports.ts:101-104`).
- M-03. Detours still present: `McpDiscovery`, `{ now }`, `internal/canonical.ts`, `tests/doubles/values.ts`, `tests/doubles/scripted-transport.ts` (section 5).
- M-04. `public-entry.spec.ts:6-7` pins exactly two root keys; adding `createMcp` requires updating this test. It also forbids exporting `InFlightCalls`, `Connection`, `admit`, `createConnectionTable` (`:13`), which the closure must keep.

### Decision 28 (`invoke` order)

- M-05. Step 5 (`ensure` connect failure -> R2 connection-class reason): `EnsureFailure` `stage:'connect'` can carry `EffectUnknown` (`M/src/internal/entry.ts:75`); the build produces it from a `discover` `no-answer` (`M/src/internal/build.ts:117`). `NotSentReason` has no `effect-unknown` (`C/src/outcomes.ts:192-198`). WS does not say how invoke maps it. Gap; decide the mapping.
- M-06. Step 7 (`transport.call` `not-sent` -> R2): `TransportFailure` `not-sent` has `session-ended` (`C/src/transport.ts:28`), which has no `NotSentReason` counterpart (`C/src/outcomes.ts:192-198`). WS says only "`not-sent` 映射到 R2". Gap; decide the mapping (candidate: `connection-unavailable`, per SPEC S7 `C/SPEC.md:342`).
- M-07. Step 9 (task table records "代际与连接键"): `Ensured` has `generation` and `catalogKey` but no `ConnectionKey` (`M/src/internal/entry.ts:40-49`). Compute with `connectionKeyOf(tenant, endpoint, account)` (`C/src/keys.ts:32-37`), which needs `AdoptedEndpoint` and `PeerAccount` (`peerAccountOf`, `C/src/keys.ts:13-18`). Design note, not a contract conflict.
- M-08. Step 7 "带进度令牌": `CallRequest` has no progress token field (`C/src/transport.ts:58-62`); transport adds it (`C/SPEC.md:449`). Consistent; no change needed.

### Decision 29 (`continueWithInput`)

- M-09. Decision 15 (`WS:63`) says `inputResponses` is optional. `CallRequest.continuation.inputResponses` is optional (`C/src/transport.ts:61`), but **`ContinueRequest.inputResponses: JsonValue` is required** (`C/src/services.ts:108`). Mismatch on the service-level type; closure must change `services.ts` (additive: make it optional) or document why not.
- M-10. Generation check: `InputRequired.issuedAt` exists (`C/src/outcomes.ts:83`) and `ContinueRequest.issuedAt` exists (`C/src/services.ts:109`). OK.

### Decision 30 (`cancel`)

- No mismatch. `C/src/services.ts:122`; in-flight `cancel` (`M/src/internal/in-flight.ts:69-86`) matches.

### Decision 31 (task operations)

- M-11. `cancelTask` conflict, three-way:
  - WS decision 31 (`WS:94`): "`cancelTask` 不为取消启动新进程" (does not start a new process to cancel).
  - WS MC3-7 (`WS:175`): "`cancelTask` 不建连" (does not build a connection).
  - SPEC S2 (`C/SPEC.md:303`): "`cancelTask` 也一样" (same connect rule as the other three: may build a connection when none exists and the endpoint is `granted`).
  - Contract comment `C/src/services.ts:152`: "Does not check adoption or eligibility." (applies to `cancelTask`, which sits at `:153`).
  - The contract comment contradicts SPEC S2:303 on eligibility; WS contradicts SPEC on building. Owner ruling needed.
- M-12. `taskResult` cancelled answer exists (`C/src/services.ts:145`). OK.
- M-13. `no-answer` -> `effect-unknown` (`EffectUnknown` cause `NoAnswerCause | 'no-connection'`, `C/src/outcomes.ts:155-158`). OK.

### Decision 32 (`observe`)

- No mismatch. `C/src/services.ts:100` (`InvokeRequest.observe`), `:113` (`ContinueRequest.observe`); `C/src/transport.ts:90` (`call` observe).

### Decision 33 (content)

- No mismatch. `C/src/content.ts:127` `toContentBlocks`.

### Decision 34 (no restart persistence)

- No mismatch; SPEC `C/SPEC.md:301`.

### Decision 26 and the detour replacements

- M-14. Sample builders (decision 3, `WS:47`; decision 27 "改用契约的 ... `./testing` 样本构造器", `WS:81`): `C/src/testing-values.ts` provides 8 builders only (section 5.1). `tests/doubles/values.ts` also supplies tenant/access (`alice`, `bob`, `mallory`, `home`, `away`), `ref`, `millis`, `binding`, `target`, `adoptionRevision`, `peerIdentity`, `principalKey`, `Principal`. No replacement exists in the contract. Deleting `values.ts` needs either new contract samples (additive, allowed by decision 3) or a member-local helper, which decision 26 forbids.
- M-15. Scripted transport (decision 19, `WS:67`: "`B 段的 w3-mcp-call` 用它代替 ... `tests/doubles/scripted-transport.ts`"). Not a drop-in:
  - No `calls` log, `remaining()`, or `trace` callback (`C/src/testing-scripted-transport.ts:67-71`; member needs them at `M/tests/doubles/scripted-transport.ts:32-37, 68-71` and `world.ts:92`).
  - No scripted `open` failure step (`C/src/testing-scripted-transport.ts:1202-1204`).
  - No deferred steps; only `pace` hook (`:64`).
  - `refresh.spec.ts` uses `Step` arrays with `listActions` (`M/tests/refresh.spec.ts:184`); expressible only via `listing[cursor]` replies, not as the same steps.
  - Expect large test rewrites, or a contract addition (WS decision 19 says the factory must pass `mcpTransportConformance()`; that is a separate check).
- M-16. Decision 17 "`open` 不在 MCP" is ambiguous: `McpTransportFactory.open` exists (`C/src/transport.ts:127-131`) and member uses it (`M/src/internal/build.ts:86`). Ask the author what it means before implementing.
- M-17. `McpDiscovery` removal: contract `ActionDiscovery.refresh` already has `signal?` (`C/src/services.ts:76-79`), so `McpDiscovery` adds nothing and can be removed; `McpServices.discovery` is `ActionDiscovery<P>` (`C/src/services.ts:249`). OK.

### Decision 16 (`C1` inputSchema) and the requested C1 change

- M-18. Decision 16 (`WS:64`) says C1 gains "`inputSchema` 必须是 `type` 为 `"object"` 的对象" and a non-conforming tool gets `action-invalid`. C1 item 5 (`C/SPEC.md:195`) does NOT contain the `type` condition. Open item (`C/SPEC.md:669`) says the same condition is NOT a C1 rejection condition and disposition is undecided. Three texts disagree.
- M-19. The requested change (drop one invalid tool, report it, do not reject the listing) contradicts accepted text:
  - `C/SPEC.md:195` (C1 item 5 "否则答第一个成立的缺陷" = whole reject),
  - `C/SPEC.md:190` (C1 header "否则答第一个成立的缺陷"),
  - `C/SPEC.md:437` (T2 "C1 不变：交出的页里一项非法，整份仍拒绝"),
  - `WS:64` (decision 16 "按 C1 使整份拒绝").
  - `C/SPEC.md:669` says disposition is undecided, so the change needs an owner decision recorded in SPEC, not only code.
- M-20. Code/type impact of drop-and-report:
  - `ListingFields` has no slot for dropped tools (`C/src/listing.ts:16-22`); add a field (e.g. `withheld`/`invalid`) to `CompleteListing`.
  - `action-invalid` in `ListingDefect` (`C/src/listing.ts:33`, `:134`) would become unused; closed-set test pins it (`C/tests/closed-sets.ts:40`); public `ListingDefect` export (`C/src/index.ts:64`).
  - Duplicate name check stays whole-reject unless also changed (`C/src/listing.ts:135-136`).
  - Tests to change: `C/tests/catalog.spec.ts:152-169` (invalid table and loop, expects `failure: 'action-invalid'` at `:165`); `M/tests/refresh.spec.ts:184` (row) and `:187-196`; `C/tests/conformance.spec.ts` if it uses `mergeListingCases` with invalid tools (not checked).
  - `WithheldReason`/`ListingPage.withheld` (`C/src/transport.ts:39, 46-51`) is a separate, transport-level drop already accepted in decision 8; the new drop is at the service/contract level. Keep them distinct in the SPEC.
- M-21. Catalog record fields are not affected by invalid tools: `mergeListing` consumes `CompleteListing.actions` only (`C/src/catalog.ts:88-118`).

### Other checks that match (no action)

- Decision 1 `refresh` signal: `C/src/services.ts:78`; member `RefreshRequest` `M/src/discovery.ts:38-42`.
- Decision 4 port reject clauses: present (`C/SPEC.md:353-406`, AV7 `:367`, UE6 `:380`, CU8 `:393`, PL6 `:406`).
- Decision 5 and 6 (S8 `:346`, S9 `:347`): present.
- Decision 7 (T3 `_meta`, `-32022`, legacy requests `-32601`): present (`C/SPEC.md:439-449`, D05 at `:490`).
- Decision 8 (`withheld`): `C/src/transport.ts:46-51`; SPEC `C/SPEC.md:437`.
- Decision 9 (`cancelRequest` per transport): `C/src/transport.ts:93`; SPEC `C/SPEC.md:453`.
- Decision 10 (deviation, reads only retry): `C/SPEC.md:572-576` table.
- Decision 11 (R4 root fallback, 403 insufficient_scope): `C/SPEC.md:273`, `:278`.
- Decision 12 (TaskReport and task outcome hints): `C/src/outcomes.ts:85, 96-104`.
- Decision 13 (`changedNotified` false): `C/SPEC.md:197`.
- Decision 14 (progress only): `C/SPEC.md:449`.
- Decision 18/19 (`mcpTransportConformance`): `C/src/testing-transport.ts:2450`; root `./testing` export `C/src/testing.ts:55-70`.

### Five-line summary of the biggest mismatches

1. `ContinueRequest.inputResponses` is required (`C/src/services.ts:108`); decision 15 says optional.
2. `McpPorts.clock` is unused: member takes `now` through `createMcpCore`'s third argument (`M/src/index.ts:34, 54`; `M/src/discovery.ts:173`); SPEC S3 (`C/SPEC.md:311`) says the clock comes from ports.
3. `cancelTask` conflicts three ways: decision 31 and MC3-7 say no connect/no process; SPEC S2 (`C/SPEC.md:303`) says the connect rule applies; contract comment (`C/src/services.ts:152`) says no adoption/eligibility check.
4. Invoke mapping gaps: `effect-unknown` from ensure's connect stage (`M/src/internal/build.ts:117`) and `not-sent session-ended` (`C/src/transport.ts:28`) have no `NotSentReason` (`C/src/outcomes.ts:192-198`); decision 28 does not say how to map them. Also `tests/doubles/values.ts` (tenant/ref/peer samples) and the scripted transport (`calls`, `remaining`, trace, open failure, deferred steps) have no contract replacement, so decision 26's deletions are not yet possible.
5. The requested drop-and-report for an invalid tool reverses C1 (`C/SPEC.md:195`), T2 (`C/SPEC.md:437`) and decision 16 (`WS:64`); the only open text (`C/SPEC.md:669`) says disposition is undecided, and it says the `type: "object"` check is NOT a C1 rejection condition, which contradicts decision 16.
