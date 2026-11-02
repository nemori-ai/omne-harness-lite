import { randomUUID } from 'node:crypto'
import { judgePart, parseMessageId } from '@omne-harness/message'
import { assembleStream } from '@omne-harness/stream-arrival'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { isReplayTag } from '@omne-harness/message'
import { parseInstant } from '@omne-harness/utc-instant'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeRevision } from '@omne-harness/model-contract'
import type {
  FixedModelRequest,
  MaterializationReceipt,
  ModelBlock,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  ResultCapacity,
  ResultPage,
  ResultPart,
  RetryDecision,
  Revision,
  Settlement,
  Supplier,
  Termination,
  VisibleBlock,
} from '@omne-harness/model-contract'
import type {
  ActorRef,
  ExecutionRef,
  ModelCommands,
  ProviderDiagnostic,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import { canonical, decimal, digest, invalid } from './value.ts'
import type { CallDocument, DispatchDocument, EvidenceContext, TenantDocuments } from './types.ts'

// Pure judgments over call documents. Nothing here writes a document or calls a port.

export const MAX_TERMINATION_BYTES = 4096
export const MAX_SETTLEMENT_BYTES = 8192
export const MAX_CUSTODY_BYTES = 12288
export const MAX_CONTROL_BYTES = 1024
export const MAX_PAGE_CURSOR = String(Number.MAX_SAFE_INTEGER)

export function encodedBytes(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}

// --- Result parts, pages and the bounded material of one call.

export function resultParts(call: CallDocument): readonly ResultPart[] {
  return call.dispatches.flatMap(dispatch =>
    dispatch.blocks.flatMap((block): ResultPart[] => {
      const trims = dispatch.trims.get(block.index) ?? []
      if (block.kind === 'sealed') return [{ kind: 'sealed', block: block.block, trims }]
      return dispatch.hadContent.has(block.index) || trims.length > 0
        ? [{ kind: 'partial', content: block.content, value: block.value, trims }]
        : []
    }),
  )
}
export function pageEnd(
  parts: readonly ResultPart[],
  offset: number,
  limit: number,
  target: number,
): number {
  let end = Math.min(offset + 1, parts.length)
  while (
    end < parts.length &&
    end - offset < limit &&
    encodedBytes(parts.slice(offset, end + 1)) <= target
  )
    end += 1
  return end
}
export function makePage(
  parts: readonly ResultPart[],
  offset: number,
  limit: number,
  target: number,
  settlement: Settlement,
): ResultPage {
  const end = pageEnd(parts, offset, limit, target)
  return {
    parts: parts.slice(offset, end),
    next: end < parts.length ? String(end) : null,
    settlement,
  }
}

function receiveReserve(call: CallDocument): number {
  return call.dispatches.reduce((total, dispatch) => {
    const open = [...dispatch.windows].filter(([, state]) => state === 'open')
    const futureWindow = dispatch.logicalTerminal === null && open.length === 0
    const confirmations = open.length + Number(futureWindow)
    const snapshot =
      encodedBytes({
        call: call.state.call,
        cursor: MAX_PAGE_CURSOR,
        blocks: dispatch.blocks,
        state: { ...call.state, revision: MAX_PAGE_CURSOR, firstContent: 'none-proven' },
      }) + Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control))
    const closedWindows = open.reduce(
      (bytes, [id, state]) => bytes + encodedBytes([id, 'unproven']) - encodedBytes([id, state]),
      0,
    )
    const newWindow = futureWindow ? encodedBytes(['x'.repeat(254), 'unproven']) + 1 : 0
    return total + confirmations * (snapshot + 1) + closedWindows + newWindow
  }, 0)
}

export function materialBytes(call: CallDocument): bigint {
  const settlement = call.state.phase === 'settled' ? call.state.settlement : null
  const reads = [...call.reads.values()].map(r => ({
    id: r.id,
    lastProgress: r.lastProgress,
    furthest: MAX_PAGE_CURSOR,
    state: r.state.kind === 'reading' ? { kind: 'reading', offset: MAX_PAGE_CURSOR } : r.state,
  }))
  const stored = encodedBytes({
    request: call.request,
    initiator: call.initiator,
    owner: call.owner,
    capacity: call.capacity,
    resultPaging: call.resultPaging,
    state: {
      ...call.state,
      phase: 'settled',
      revision: MAX_PAGE_CURSOR,
      settlement,
      dispatch: 'x'.repeat(256),
      firstContent: 'none-proven',
    },
    output: call.dispatches.map(d => ({
      record: d.record,
      logicalTerminal: d.logicalTerminal,
      blocks: d.blocks,
      nextSeq: [...d.nextSeq],
      trims: [...d.trims],
      hadContent: [...d.hadContent],
      windows: [...d.windows],
      events: [...d.events],
    })),
    snapshots: [...call.snapshots.values()],
    reads,
    retry: call.retry,
    retryPosition: call.retryPosition,
    retrySource: call.retrySource,
    finalParts: resultParts(call),
  })
  const terminalReserve = call.dispatches.reduce(
    (sum, d) =>
      sum +
      Math.max(0, MAX_TERMINATION_BYTES - encodedBytes(d.record.terminal)) +
      (d.logicalTerminal === null ? MAX_TERMINATION_BYTES - encodedBytes(null) : 0),
    0,
  )
  return BigInt(
    stored +
      // Reserve the entire bounded configuration from admission, including keys and wrapping.
      encodedBytes({
        resultPageParts: Number.MAX_SAFE_INTEGER,
        resultPageTargetBytes: Number.MAX_SAFE_INTEGER,
      }) -
      encodedBytes(call.resultPaging) +
      terminalReserve +
      receiveReserve(call) +
      Math.max(0, MAX_SETTLEMENT_BYTES - encodedBytes(settlement)) +
      Math.max(0, MAX_CUSTODY_BYTES - encodedBytes(call.state.custody)) +
      Math.max(0, MAX_CONTROL_BYTES - encodedBytes(call.state.control)) +
      Math.max(0, 1024 - encodedBytes(reads)) +
      64,
  )
}
export function capacityValid(value: ResultCapacity): boolean {
  return decimal(value.bytes, true) && decimal(value.blocks, true) && decimal(value.attachmentBytes)
}

// --- Recovery: unresolved operations and the tasks a call still owes.

export function unresolved(state: TenantDocuments, call: ModelCallId): ModelOperationId[] {
  return [...state.operations].flatMap(([id, op]) =>
    op.call === call && op.status === 'unknown' ? [id] : [],
  )
}
type RecoveryTask = 'execute' | 'control' | 'handoff' | 'cleanup' | 'account'
function producerTasks(call: CallDocument): RecoveryTask[] {
  const result: RecoveryTask[] = []
  if (call.state.phase !== 'settled') result.push('execute')
  if (call.state.control.kind === 'requested' && call.state.control.propagation !== 'sent')
    result.push('control')
  if (call.state.phase === 'settled') result.push('handoff')
  return result
}
export function tasks(call: CallDocument, pending: readonly ModelOperationId[]): RecoveryTask[] {
  const result = call.state.custody.kind === 'producer' ? producerTasks(call) : []
  if (call.state.custody.kind === 'acknowledged' && call.state.custody.cleanup !== 'released')
    result.push('cleanup')
  if (pending.length > 0 || call.dispatches.some(d => d.record.send === 'unknown'))
    result.push('account')
  return result
}
/**
 * Whether a call still owes recovery work: one of its tasks, or an operation that stays unknown.
 * `pending` is the operations of the call that stay unknown, as `unresolved` reads them. This is the
 * rule that `scanPending` applies to every call of a tenant, so a storage that selects pending
 * calls itself asks the same question.
 */
export function hasRecoveryWork(
  call: CallDocument,
  pending: readonly ModelOperationId[] = [],
): boolean {
  return tasks(call, pending).length > 0
}
export function pendingCalls(root: TenantDocuments): readonly ModelCallId[] {
  return [
    ...new Set([
      ...[...root.calls.values()]
        .filter(call => hasRecoveryWork(call, unresolved(root, call.state.call)))
        .map(call => call.state.call),
      ...[...root.operations.values()]
        .filter(operation => operation.status === 'unknown')
        .map(operation => operation.call),
    ]),
  ].sort()
}

// --- Write preconditions shared by the methods.

export function expected(
  call: CallDocument,
  value: Revision,
  operation: ModelOperationId,
): ModelFailure | null {
  return 'failure' in decodeRevision(value) || value !== call.state.revision
    ? { kind: 'conflict', operation, revision: call.state.revision }
    : null
}
export function authFailure(result: Outcome<ActorRef, ModelFailure>): ModelFailure | null {
  return 'failure' in result ? result.failure : null
}
export function missingReceipt(): never {
  throw new TypeError('inconsistent memory Model receipt')
}
export function evidenceContext(
  tenant: ExecutionRef['tenant'],
  call: CallDocument,
): EvidenceContext | ModelFailure {
  if (call.request === null) return invalid('call', 'recovery-material-released')
  return {
    tenant,
    call: call.state.call,
    consumer: call.state.consumer,
    request: structuredClone(call.request),
    execution: call.execution === null ? null : { ...call.execution },
  }
}

// --- Dispatch and retry legality.

const NOT_RETRYABLE_CAUSES = [
  'input-over-limit',
  'excluded',
  'credential',
  'input-rejected',
  'modality',
]

/** The receipt names the dispatch supplier and the request representation, in valid shapes. */
export function receiptBinds(
  receipt: MaterializationReceipt,
  supplier: Supplier,
  request: FixedModelRequest,
): boolean {
  return (
    digest(receipt.supplier) === digest(supplier.adoption) &&
    digest(receipt.representation) === digest(request.representation) &&
    /^[0-9a-f]{64}$/u.test(receipt.payloadDigest) &&
    (receipt.replayFormat === undefined || isReplayTag(receipt.replayFormat))
  )
}
export function dispatchOf(call: CallDocument, id: string): DispatchDocument | ModelFailure {
  return call.dispatches.find(d => d.record.dispatch === id) ?? invalid('dispatch', 'not-found')
}
export function ready(call: CallDocument): ModelFailure | null {
  return call.state.phase === 'settled' || call.state.control.kind !== 'none'
    ? invalid('call', 'controlled-or-settled')
    : null
}
export function retryable(call: CallDocument, dispatch: DispatchDocument): ModelFailure | null {
  const failure = ready(call)
  if (failure) return failure
  if (
    dispatch.record.firstContent !== 'none-proven' ||
    [...dispatch.windows.values()].includes('open')
  )
    return invalid('firstContent', 'not-none-proven')
  const termination = dispatch.logicalTerminal
  if (termination?.kind !== 'failed' || NOT_RETRYABLE_CAUSES.includes(termination.fault.cause))
    return invalid('dispatch', 'not-retryable')
  return null
}
type DispatchPlan = Pick<
  Parameters<ModelCommands<never>['prepareDispatch']>[0],
  'supplier' | 'policyDecision'
>
export function prepareSupplierFailure(
  call: CallDocument,
  request: FixedModelRequest,
  input: DispatchPlan,
): ModelFailure | null {
  if (!request.suppliers.some(s => digest(s) === digest(input.supplier)))
    return invalid('supplier', 'outside-request')
  const prior = call.dispatches.at(-1)
  if (prior) return retrySupplierFailure(call, prior, input)
  if (digest(input.supplier) !== digest(request.suppliers[0]) || input.policyDecision !== null)
    return invalid('supplier', 'first-supplier')
  return null
}
function retrySupplierFailure(
  call: CallDocument,
  prior: DispatchDocument,
  input: DispatchPlan,
): ModelFailure | null {
  const canRetry = retryable(call, prior)
  if (canRetry) return canRetry
  if (
    call.retry?.kind !== 'retry' ||
    !call.retrySource ||
    digest(call.retry.supplier) !== digest(input.supplier) ||
    digest(call.retrySource) !== digest(input.policyDecision)
  )
    return invalid('policyDecision', 'not-decided')
  return null
}
export function positionedRetryRequest(
  call: CallDocument,
  input: Pick<Parameters<ModelCommands<never>['decideRetry']>[0], 'position'>,
): Outcome<FixedModelRequest, ModelFailure> {
  if (!call.request || !call.retryPosition || digest(call.retryPosition) !== digest(input.position))
    return { failure: invalid('position', 'not-original') }
  const dispatch = dispatchOf(call, input.position.dispatch)
  if ('kind' in dispatch) return { failure: dispatch }
  const failure = retryable(call, dispatch)
  if (failure) return { failure }
  return { ok: call.request }
}
export function retryChoiceFailure(
  request: FixedModelRequest,
  dispatchCount: number,
  decision: RetryDecision,
): ModelFailure | null {
  if (decision.kind === 'retry') {
    if (
      !parseInstant(decision.notBefore).ok ||
      digest(decision.basis) !== digest(request.retryPolicy)
    )
      return invalid('decision', 'basis-or-time')
    const index = request.fallback ? dispatchCount : 0
    const supplier = request.suppliers[index]
    if (
      !supplier ||
      (!request.fallback && dispatchCount >= 2) ||
      digest(supplier) !== digest(decision.supplier)
    )
      return invalid('supplier', 'retry-bound')
  }
  return null
}

// --- Settlement legality.

export function settlementFailure(
  call: CallDocument,
  termination: Termination,
): ModelFailure | null {
  const pending = settlementPendingFailure(call)
  if (pending) return pending
  const actual = settlementActualFailure(call, termination)
  if (actual) return actual
  if (encodedBytes(termination) > MAX_TERMINATION_BYTES)
    return invalid('termination', 'encoded-byte-limit')
  return null
}
function settlementPendingFailure(call: CallDocument): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  if (call.retryPosition && call.retry === null) return invalid('termination', 'retry-pending')
  if (call.retry?.kind === 'retry') return invalid('termination', 'retry-pending')
  if (latest && [...latest.windows.values()].includes('open'))
    return invalid('termination', 'receive-pending')
  return undecidedRetryFailure(call)
}
function settlementActualFailure(
  call: CallDocument,
  termination: Termination,
): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  const terminal = latest?.logicalTerminal
  const stopped = call.retry?.kind === 'stop' ? { kind: 'failed', fault: call.retry.fault } : null
  const actual = stopped ?? terminal
  const beforeSendControl =
    !latest &&
    call.state.control.kind === 'requested' &&
    termination.kind === 'interrupted' &&
    termination.control === call.state.control.operation
  if (
    !beforeSendControl &&
    (actual === null || actual === undefined || digest(actual) !== digest(termination))
  )
    return invalid('termination', 'not-actual')
  return null
}
function undecidedRetryFailure(call: CallDocument): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  const terminal = latest?.logicalTerminal
  if (
    terminal?.kind === 'failed' &&
    latest?.record.firstContent === 'none-proven' &&
    !NOT_RETRYABLE_CAUSES.includes(terminal.fault.cause) &&
    call.retry === null &&
    call.state.control.kind === 'none'
  )
    return invalid('termination', 'retry-not-decided')
  return null
}

// --- Stream facts: block shapes, completion and diagnostics.

function target() {
  const parsed = parseMessageId(`msg_${randomUUID()}`)
  if (!parsed.ok) throw new TypeError('internal stream target')
  return { id: parsed.value, role: 'assistant' as const }
}
function head(block: ModelBlock) {
  if (block.kind === 'text' || block.kind === 'thinking') {
    const { text: _text, ...value } = block
    return value
  }
  if (block.kind === 'tool_call') {
    const { arguments: _arguments, ...value } = block
    return value
  }
  if ('inline' in block) {
    const { inline: _inline, ...value } = block
    return value
  }
  return { kind: block.kind, id: block.id, visibility: block.visibility }
}
function toolArgumentsFailure(block: ModelBlock, value: string): ModelFailure | null {
  if (block.kind !== 'tool_call') return null
  const parsed = readJsonText(value, {
    maxBytes: Math.max(Buffer.byteLength(value), 1),
    maxDepth: 256,
    maxItems: 100000,
    maxMembers: 100000,
    maxStringLength: Math.max(value.length, 1),
    maxNumberLength: Math.max(value.length, 1),
  })
  return parsed.kind !== 'ok' || writeJsonText(parsed.value) !== writeJsonText(block.arguments)
    ? invalid('block', 'tool-arguments')
    : null
}
/** Whether a seal of `block` over `prior` forms a valid closed block. */
export function sealed(
  block: ModelBlock,
  prior: VisibleBlock | undefined,
  trimmed: boolean,
  filled: boolean,
): ModelFailure | null {
  const judged = judgePart(block)
  if ('rejected' in judged) return invalid('block', judged.rejected)
  if (prior?.kind === 'sealed') return invalid('block', 'closed')
  const steps: unknown[] = [
    { step: 'open', index: '0', mode: prior?.mode ?? 'replace', head: head(block) },
  ]
  if (prior?.kind === 'growing') {
    const expectedKind = prior.content === 'tool-arguments' ? 'tool_call' : prior.content
    if (block.kind !== expectedKind || (trimmed && block.kind === 'tool_call'))
      return invalid('block', 'seal-kind-or-trim')
    const failure = toolArgumentsFailure(block, prior.value)
    if (failure) return failure
    if (filled) steps.push({ step: 'fill', index: '0', seq: '0', chunk: prior.value })
  }
  steps.push({ step: 'close', index: '0', block })
  const result = assembleStream({ target: target(), steps })
  return 'rejected' in result ? invalid('block', result.detail ?? result.rejected) : null
}
export function hasContent(block: ModelBlock): boolean {
  if (block.kind === 'text' || block.kind === 'thinking') return block.text.length > 0
  return 'inline' in block ? block.inline.length > 0 : true
}
/** Media blocks and reasoning state parts may arrive sealed, without an open before them. */
export function sealsWhole(block: ModelBlock): boolean {
  return block.kind === 'image' || block.kind === 'file' || block.kind === 'reasoning_state'
}
function completionBlockSteps(
  dispatch: DispatchDocument,
  visible: Extract<VisibleBlock, { kind: 'sealed' }>,
  index: string,
): unknown[] {
  const block = visible.block
  const steps: unknown[] = [{ step: 'open', index, mode: 'replace', head: head(block) }]
  const body =
    block.kind === 'text' || block.kind === 'thinking'
      ? block.text
      : 'inline' in block
        ? block.inline
        : null
  if (
    body !== null &&
    (block.kind === 'text' ||
      block.kind === 'thinking' ||
      (block.kind === 'voice' && dispatch.nextSeq.get(visible.index) !== '0'))
  )
    steps.push({ step: 'fill', index, seq: '0', chunk: body })
  steps.push({ step: 'close', index, block })
  return steps
}
/**
 * Whether the blocks of a completed dispatch form one assistant message. `formed`: they do, or the
 * termination does not complete. `refused`: the content does not form a message, so the logical
 * terminal stays open. `replay-unknown`: the content holds reasoning state parts, but the replay
 * `format` of this dispatch is unknown, so the message cannot be written.
 */
export type Completion =
  | Readonly<{ kind: 'formed' }>
  | Readonly<{ kind: 'refused' | 'replay-unknown'; failure: ModelFailure }>
type FinishReplay =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'range'; scope: string; format: string }>
  | Readonly<{ kind: 'unknown'; failure: ModelFailure }>
/**
 * The replay of the finish. `scope` is the `produces` of the request declaration of the dispatch
 * supplier; `format` is the `replayFormat` of the dispatch receipt. Content without reasoning
 * leaves the finish without replay. Thinking alone without a known range does too (RS-03: the
 * origin of the reasoning text is unknown). Reasoning state parts need both: a missing `format`
 * fails named (`replay-format-unknown`); a missing `scope` breaks an invariant and throws.
 */
function finishReplay(
  call: CallDocument,
  dispatch: DispatchDocument,
  blocks: readonly ModelBlock[],
): FinishReplay {
  const state = blocks.some(block => block.kind === 'reasoning_state')
  if (!state && !blocks.some(block => block.kind === 'thinking')) return { kind: 'none' }
  const format = dispatch.record.materialization?.receipt.replayFormat
  if (format === undefined)
    return state
      ? { kind: 'unknown', failure: invalid('termination', 'replay-format-unknown') }
      : { kind: 'none' }
  const supplier = digest(dispatch.record.supplier)
  const index = call.request?.suppliers.findIndex(item => digest(item) === supplier) ?? -1
  const scope = call.request?.declarations[index]?.produces
  if (scope !== undefined) return { kind: 'range', scope, format }
  if (!state) return { kind: 'none' }
  // Unreachable while the invariants hold: the request declares every supplier it may dispatch
  // to; the cleanup clears the request and the blocks in one step; and a late terminal of a
  // settled call forms no message. Reaching here is a program defect, not a failure of the write.
  throw new TypeError(
    'a completion with reasoning state found no replay declaration for its dispatch supplier: ' +
      'the request must declare every supplier, and cleanup must clear the blocks with the request',
  )
}
export function completionOf(
  call: CallDocument,
  dispatch: DispatchDocument,
  termination: Termination | Extract<TransportFact, { kind: 'ended' }>['termination'],
): Completion {
  if (termination.kind !== 'completed' || termination.reason === 'limit') return { kind: 'formed' }
  const sealed = dispatch.blocks.flatMap(b => (b.kind === 'sealed' ? [b] : []))
  if (sealed.length === 0 || sealed.length !== dispatch.blocks.length)
    return { kind: 'refused', failure: invalid('termination', 'unsealed-or-empty') }
  const replay = finishReplay(
    call,
    dispatch,
    sealed.map(visible => visible.block),
  )
  if (replay.kind === 'unknown') return { kind: 'replay-unknown', failure: replay.failure }
  const steps: unknown[] = []
  for (const [i, visible] of sealed.entries())
    steps.push(...completionBlockSteps(dispatch, visible, String(i)))
  const index = String(dispatch.blocks.length)
  steps.push(
    replay.kind === 'none'
      ? { step: 'finish', index }
      : { step: 'finish', index, replay: { scope: replay.scope, format: replay.format } },
  )
  if ('rejected' in assembleStream({ target: target(), steps }))
    return { kind: 'refused', failure: invalid('termination', 'invalid-completion') }
  return { kind: 'formed' }
}
const DIAGNOSTIC_FIELDS: Readonly<Record<ProviderDiagnostic['kind'], readonly string[]>> = {
  'replay-omitted': ['kind', 'message', 'scope', 'format', 'omittedParts'],
  'reasoning-disabled': ['kind', 'reason'],
  'reasoning-state-dropped': ['kind', 'reason', 'length'],
  'usage-inconsistent': ['kind', 'field'],
}
function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function isText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}
/** True when the diagnostic has exactly the fields of its kind, each of the right type. */
export function wellFormed(diagnostic: ProviderDiagnostic): boolean {
  const fields: readonly string[] | undefined = Object.hasOwn(DIAGNOSTIC_FIELDS, diagnostic.kind)
    ? DIAGNOSTIC_FIELDS[diagnostic.kind]
    : undefined
  const keys = Object.keys(diagnostic)
  if (fields === undefined || keys.length !== fields.length) return false
  if (!keys.every(key => fields.includes(key))) return false
  switch (diagnostic.kind) {
    case 'replay-omitted':
      return (
        parseMessageId(diagnostic.message).ok &&
        isText(diagnostic.scope) &&
        isText(diagnostic.format) &&
        isCount(diagnostic.omittedParts)
      )
    case 'reasoning-disabled':
      return diagnostic.reason === 'foreign-prefix'
    case 'reasoning-state-dropped':
      return diagnostic.reason === 'payload-too-long' && isCount(diagnostic.length)
    case 'usage-inconsistent':
      return isText(diagnostic.field)
    default: {
      const _exhaustive: never = diagnostic
      return _exhaustive
    }
  }
}
