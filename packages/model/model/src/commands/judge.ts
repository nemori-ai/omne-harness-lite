import type { FixedRequestHead } from '@omne-harness/model-contract/provider'
import { randomUUID } from 'node:crypto'
import { judgePart, parseMessageId } from '@omne-harness/message'
import { assembleStream } from '@omne-harness/stream-arrival'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { isReplayTag, REPLAY_PREFIX_MAX_LENGTH } from '@omne-harness/message'
import { parseInstant } from '@omne-harness/utc-instant'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeRevision } from '@omne-harness/model-contract'
import type {
  MaterializationReceipt,
  ModelBlock,
  ModelCallId,
  ModelFailure,
  ModelOperationId,
  ResultPage,
  ResultPart,
  RetryDecision,
  Revision,
  Settlement,
  Supplier,
  SettledReplay,
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
import { canonical, digest, invalid } from './value.ts'
import type { CallDocument, DispatchDocument, EvidenceContext, TenantDocuments } from './types.ts'
import { sentWithoutReplay } from './attempts.ts'

export const MAX_TERMINATION_BYTES = 4096
export const MAX_SETTLEMENT_BYTES = 8192
export const MAX_PAGE_CURSOR = String(Number.MAX_SAFE_INTEGER)

export function encodedBytes(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}

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
    requestDigest: call.requestDigest,
    execution: call.execution === null ? null : { ...call.execution },
  }
}

const NOT_RETRYABLE_CAUSES = [
  'input-over-limit',
  'excluded',
  'credential',
  'input-rejected',
  'modality',
]

// A prefix and the carried mark both describe reasoning in a replay format, so neither stands alone.
function replayMarksBind({ replayFormat, replayPrefix, replayCarried }: MaterializationReceipt) {
  if (replayFormat === undefined) return replayPrefix === undefined && replayCarried === undefined
  return (
    isReplayTag(replayFormat) &&
    (replayPrefix === undefined ||
      (replayPrefix.length > 0 && replayPrefix.length <= REPLAY_PREFIX_MAX_LENGTH)) &&
    (replayCarried === undefined || replayCarried === true)
  )
}

export function receiptBinds(
  receipt: MaterializationReceipt,
  supplier: Supplier,
  request: FixedRequestHead,
): boolean {
  return (
    digest(receipt.supplier) === digest(supplier.adoption) &&
    digest(receipt.representation) === digest(request.representation) &&
    /^[0-9a-f]{64}$/u.test(receipt.payloadDigest) &&
    replayMarksBind(receipt)
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
  request: FixedRequestHead,
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
    call.retry === null ||
    call.retry.kind === 'stop' ||
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
): Outcome<Readonly<{ request: FixedRequestHead; dispatch: DispatchDocument }>, ModelFailure> {
  if (!call.request || !call.retryPosition || digest(call.retryPosition) !== digest(input.position))
    return { failure: invalid('position', 'not-original') }
  const dispatch = dispatchOf(call, input.position.dispatch)
  if ('kind' in dispatch) return { failure: dispatch }
  const failure = retryable(call, dispatch)
  if (failure) return { failure }
  return { ok: { request: call.request, dispatch } }
}
// A resend answers a refusal of carried state, once per call, to the supplier that refused it.
function resendFailure(call: CallDocument, positioned: DispatchDocument, supplier: Supplier) {
  const terminal = positioned.logicalTerminal
  return terminal?.kind !== 'failed' ||
    terminal.fault.cause !== 'replay-rejected' ||
    sentWithoutReplay(call) ||
    digest(supplier) !== digest(positioned.record.supplier)
    ? invalid('decision', 'replay-resend')
    : null
}
export function retryChoiceFailure(
  call: CallDocument,
  request: FixedRequestHead,
  positioned: DispatchDocument,
  decision: RetryDecision,
): ModelFailure | null {
  if (decision.kind === 'resend-without-replay')
    return resendFailure(call, positioned, decision.supplier)
  if (decision.kind === 'retry') {
    // The resend does not take a place of the ordinary retries.
    const dispatchCount = call.dispatches.filter(d => d.record.withoutReplay !== 'resend').length
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

export function settlementFailure(
  call: CallDocument,
  termination: Termination,
): ModelFailure | null {
  if (encodedBytes(termination) > MAX_TERMINATION_BYTES)
    return invalid('termination', 'encoded-byte-limit')
  if (executionFailed(termination) || policyUnavailable(call, termination)) return null
  return settlementPendingFailure(call) ?? settlementActualFailure(call, termination)
}
function policyUnavailable(call: CallDocument, termination: Termination): boolean {
  return (
    termination.kind === 'failed' &&
    termination.fault.cause === 'policy-unavailable' &&
    call.retryPosition !== null &&
    call.retry === null &&
    call.state.control.kind === 'none'
  )
}
export function executionFailed(termination: Termination): boolean {
  return termination.kind === 'failed' && termination.fault.cause === 'persistence'
}
function settlementPendingFailure(call: CallDocument): ModelFailure | null {
  const latest = call.dispatches.at(-1)
  const awaited = call.retryPosition !== null && (call.retry === null || call.retry.kind !== 'stop')
  if (awaited && call.state.control.kind === 'none') return invalid('termination', 'retry-pending')
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
export type Completion =
  | Readonly<{ kind: 'formed' }>
  | Readonly<{ kind: 'refused' | 'replay-unknown'; failure: ModelFailure }>
type FinishReplay =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'range'; range: SettledReplay }>
  | Readonly<{ kind: 'unknown'; failure: ModelFailure }>
function finishReplay(
  call: CallDocument,
  dispatch: DispatchDocument,
  blocks: readonly ModelBlock[],
): FinishReplay {
  const state = blocks.some(block => block.kind === 'reasoning_state')
  if (!state && !blocks.some(block => block.kind === 'thinking')) return { kind: 'none' }
  const receipt = dispatch.record.materialization?.receipt
  if (receipt?.replayFormat === undefined)
    return state
      ? { kind: 'unknown', failure: invalid('termination', 'replay-format-unknown') }
      : { kind: 'none' }
  const { replayFormat: format, replayPrefix: prefix } = receipt
  const supplier = digest(dispatch.record.supplier)
  const index = call.request?.suppliers.findIndex(item => digest(item) === supplier) ?? -1
  const scope = call.request?.declarations[index]?.produces
  if (scope !== undefined)
    return { kind: 'range', range: { scope, format, ...(prefix === undefined ? {} : { prefix }) } }
  if (!state) return { kind: 'none' }
  throw new TypeError(
    'a completion with reasoning state found no replay declaration for its dispatch supplier: ' +
      'the request must declare every supplier, and cleanup must clear the blocks with the request',
  )
}
/** The replay range a settled result carries: the latest dispatch completed it. */
function settledReplay(call: CallDocument, termination: Termination): SettledReplay | undefined {
  const latest = call.dispatches.at(-1)
  if (termination.kind !== 'completed' || latest === undefined) return undefined
  const sealed = latest.blocks.flatMap(b => (b.kind === 'sealed' ? [b.block] : []))
  const replay = finishReplay(call, latest, sealed)
  return replay.kind === 'range' ? replay.range : undefined
}
/** The settlement a call records at a version: how it ended, where its output stops, its replay. */
export function settlementOf(
  call: CallDocument,
  input: Readonly<{ call: ModelCallId; termination: Termination }>,
  version: Settlement['version'],
): Settlement {
  const replay = settledReplay(call, input.termination)
  return {
    version,
    termination: structuredClone(input.termination),
    cursor: call.cursor,
    source: {
      owner: 'model-memory',
      record: `${input.call}/${version}`,
      revision: String(BigInt(call.state.revision) + 1n),
      digest: digest(input.termination),
    },
    ...(replay === undefined ? {} : { replay: { ...replay, call: String(input.call) } }),
  }
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
      : { step: 'finish', index, replay: replay.range },
  )
  if ('rejected' in assembleStream({ target: target(), steps }))
    return { kind: 'refused', failure: invalid('termination', 'invalid-completion') }
  return { kind: 'formed' }
}
const DIAGNOSTIC_FIELDS: Readonly<Record<ProviderDiagnostic['kind'], readonly string[]>> = {
  'replay-omitted': ['kind', 'message', 'scope', 'format', 'omittedParts', 'reason'],
  'reasoning-disabled': ['kind', 'reason'],
  'reasoning-state-dropped': ['kind', 'reason', 'length'],
  'usage-inconsistent': ['kind', 'field'],
  'upstream-transformed': ['kind', 'type', 'path', 'reason'],
}
const REPLAY_OMISSIONS: ReadonlySet<string> = new Set([
  'scope',
  'format',
  'resent',
  'no-prefix',
  'prefix-history',
  'prefix-system',
  'prefix-tools',
  'prefix-projection',
])
function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function isText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}
const UPSTREAM_WORD = /^[a-z][a-z0-9_.]{0,127}$/
function replayOmittedWellFormed(
  diagnostic: Extract<ProviderDiagnostic, { kind: 'replay-omitted' }>,
): boolean {
  return (
    parseMessageId(diagnostic.message).ok &&
    isText(diagnostic.scope) &&
    isText(diagnostic.format) &&
    isCount(diagnostic.omittedParts) &&
    REPLAY_OMISSIONS.has(diagnostic.reason)
  )
}
export function wellFormed(diagnostic: ProviderDiagnostic): boolean {
  const fields: readonly string[] | undefined = Object.hasOwn(DIAGNOSTIC_FIELDS, diagnostic.kind)
    ? DIAGNOSTIC_FIELDS[diagnostic.kind]
    : undefined
  const keys = Object.keys(diagnostic)
  if (fields === undefined || keys.length !== fields.length) return false
  if (!keys.every(key => fields.includes(key))) return false
  switch (diagnostic.kind) {
    case 'replay-omitted':
      return replayOmittedWellFormed(diagnostic)
    case 'reasoning-disabled':
      return diagnostic.reason === 'foreign-prefix'
    case 'reasoning-state-dropped':
      return diagnostic.reason === 'payload-too-long' && isCount(diagnostic.length)
    case 'usage-inconsistent':
      return isText(diagnostic.field)
    case 'upstream-transformed':
      return [diagnostic.type, diagnostic.path, diagnostic.reason].every(word =>
        UPSTREAM_WORD.test(word),
      )
    default: {
      const _exhaustive: never = diagnostic
      return _exhaustive
    }
  }
}
