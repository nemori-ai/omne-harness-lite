import { randomUUID } from 'node:crypto'
import { judgePart, parseMessageId } from '@omne-harness/message'
import { assembleStream } from '@omne-harness/stream-arrival'
import { admitRevision, judgeCallAccount } from '@omne-harness/call-account'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type {
  CallAccountReport,
  ModelBlock,
  ModelFailure,
  ProviderDiagnostic,
  TransportFact,
  Termination,
  VisibleBlock,
} from '@omne-harness/model-contract'
import type { MemoryCall, MemoryDispatch } from './state.ts'
import { encodedBytes, MAX_TERMINATION_BYTES } from './pages.ts'
import { decimal, digest, invalid } from './value.ts'

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
function sealed(
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
/**
 * Keeps the account that a provider reported for a dispatch. The runtime adds the subject (this
 * call) and the receipt (`received` in the stream, `late` through `recordLateFact`). A report that
 * names a subject or a receipt itself is refused. The same event with the same report is accepted
 * once on either path; the same event with another report is a conflict.
 */
export function accountFact(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  input: Readonly<{ event: string; report: CallAccountReport; receipt: 'received' | 'late' }>,
): ModelFailure | null {
  const { event, report, receipt } = input
  if (!event || Object.hasOwn(report, 'subject') || Object.hasOwn(report, 'receipt'))
    return invalid('account', 'shape-or-subject')
  const judged = judgeCallAccount({
    ...report,
    subject: { kind: 'model_call', id: call.state.call },
    receipt,
  })
  if ('rejected' in judged) return invalid('account', 'shape-or-subject')
  const { receipt: _receipt, ...reported } = judged.ok
  const fingerprint = digest(reported)
  const seen = dispatch.events.get(`account:${event}`)
  if (seen !== undefined) return seen === fingerprint ? null : invalid('event', 'conflict')
  if (dispatch.record.account) {
    const previous = dispatch.record.account
    if (BigInt(judged.ok.revision) <= BigInt(previous.revision))
      return invalid('account.revision', 'not-increasing')
    const next = admitRevision(previous, judged.ok)
    if ('rejected' in next) return invalid('account', next.rejected)
  }
  dispatch.events.set(`account:${event}`, fingerprint)
  dispatch.record = { ...dispatch.record, account: structuredClone(judged.ok) }
  return null
}
function completionBlockSteps(
  dispatch: MemoryDispatch,
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
  call: MemoryCall,
  dispatch: MemoryDispatch,
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
  call: MemoryCall,
  dispatch: MemoryDispatch,
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
function endDispatch(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  termination: Extract<TransportFact, { kind: 'ended' }>['termination'],
): ModelFailure | null {
  if (encodedBytes(termination) > MAX_TERMINATION_BYTES)
    return invalid('termination', 'encoded-byte-limit')
  const completion = completionOf(call, dispatch, termination)
  if (completion.kind !== 'formed') return completion.failure
  const actual =
    termination.kind === 'interrupted'
      ? call.state.control.kind === 'requested'
        ? { kind: 'interrupted' as const, control: call.state.control.operation }
        : {
            kind: 'failed' as const,
            fault: {
              cause: 'stream-lost' as const,
              diagnostic: 'unmanaged-interruption',
              upstreamStatus: null,
            },
          }
      : termination
  dispatch.logicalTerminal = structuredClone(actual)
  dispatch.record = { ...dispatch.record, terminal: structuredClone(actual) }
  return null
}
function openBlock(
  dispatch: MemoryDispatch,
  fact: Extract<TransportFact, { kind: 'block-open' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  const last = dispatch.blocks.at(-1)
  if (prior || (last && BigInt(fact.index) <= BigInt(last.index)))
    return invalid('index', 'order-or-duplicate')
  dispatch.blocks = [
    ...dispatch.blocks,
    { kind: 'growing', index: fact.index, mode: fact.mode, content: fact.content, value: '' },
  ]
  dispatch.nextSeq.set(fact.index, '0')
  return null
}
function fillBlock(
  dispatch: MemoryDispatch,
  fact: Extract<TransportFact, { kind: 'block-delta' | 'block-replace' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (!prior || prior.kind !== 'growing') return invalid('block', 'unopened-or-closed')
  if (prior.mode !== (fact.kind === 'block-delta' ? 'append' : 'replace'))
    return invalid('mode', 'changed')
  const value = fact.kind === 'block-delta' ? prior.value + fact.delta : fact.value
  dispatch.blocks = dispatch.blocks.map(b => (b.index === prior.index ? { ...prior, value } : b))
  dispatch.nextSeq.set(fact.index, String(BigInt(dispatch.nextSeq.get(fact.index) ?? '0') + 1n))
  if ((fact.kind === 'block-delta' ? fact.delta : fact.value).length > 0) {
    dispatch.hadContent.add(fact.index)
    dispatch.record = { ...dispatch.record, firstContent: 'observed' }
  }
  return null
}
function hasContent(block: ModelBlock): boolean {
  if (block.kind === 'text' || block.kind === 'thinking') return block.text.length > 0
  return 'inline' in block ? block.inline.length > 0 : true
}
/** Media blocks and reasoning state parts may arrive sealed, without an open before them. */
function sealsWhole(block: ModelBlock): boolean {
  return block.kind === 'image' || block.kind === 'file' || block.kind === 'reasoning_state'
}
function sealBlock(
  dispatch: MemoryDispatch,
  fact: Extract<TransportFact, { kind: 'block-seal' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (!prior && !sealsWhole(fact.block)) return invalid('block', 'unopened')
  if (!prior && dispatch.blocks.some(b => BigInt(b.index) >= BigInt(fact.index)))
    return invalid('index', 'order')
  const failure = sealed(
    fact.block,
    prior,
    dispatch.trims.has(fact.index),
    dispatch.nextSeq.get(fact.index) !== undefined && dispatch.nextSeq.get(fact.index) !== '0',
  )
  if (failure) return failure
  const next: VisibleBlock = {
    kind: 'sealed',
    index: fact.index,
    block: structuredClone(fact.block),
  }
  dispatch.blocks = prior
    ? dispatch.blocks.map(b => (b.index === fact.index ? next : b))
    : [...dispatch.blocks, next]
  if (hasContent(fact.block)) dispatch.record = { ...dispatch.record, firstContent: 'observed' }
  return null
}
function trimBlock(
  dispatch: MemoryDispatch,
  fact: Extract<TransportFact, { kind: 'trim' }>,
  prior: VisibleBlock | undefined,
): ModelFailure | null {
  if (
    !prior ||
    prior.kind !== 'growing' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(fact.removed) ||
    fact.reason.length === 0
  )
    return invalid('trim', 'shape-or-closed')
  dispatch.trims.set(fact.index, [
    ...(dispatch.trims.get(fact.index) ?? []),
    { removed: fact.removed, reason: fact.reason },
  ])
  return null
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
function wellFormed(diagnostic: ProviderDiagnostic): boolean {
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
/** Keeps a diagnostic on the dispatch. It changes no block, no first content and no terminal. */
function diagnosticFact(
  dispatch: MemoryDispatch,
  diagnostic: ProviderDiagnostic,
): ModelFailure | null {
  if (!wellFormed(diagnostic)) return invalid('diagnostic', 'shape')
  dispatch.diagnostics = [...dispatch.diagnostics, structuredClone(diagnostic)]
  return null
}
function reduceFact(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  fact: TransportFact,
): ModelFailure | null {
  if (fact.kind !== 'account' && dispatch.logicalTerminal !== null)
    return invalid('facts', 'after-terminal')
  if (fact.kind === 'account')
    return accountFact(call, dispatch, {
      event: fact.event,
      report: fact.value,
      receipt: 'received',
    })
  if (fact.kind === 'diagnostic') return diagnosticFact(dispatch, fact.value)
  if (fact.kind === 'ended') return endDispatch(call, dispatch, fact.termination)
  return reduceBlock(dispatch, fact)
}
function reduceBlock(
  dispatch: MemoryDispatch,
  fact: Exclude<TransportFact, { kind: 'account' | 'diagnostic' | 'ended' }>,
): ModelFailure | null {
  if (!decimal(fact.index) || !Number.isSafeInteger(Number(fact.index)))
    return invalid('index', 'safe-integer')
  const prior = dispatch.blocks.find(b => b.index === fact.index)
  if (fact.kind === 'block-open') return openBlock(dispatch, fact, prior)
  if (fact.kind === 'block-delta' || fact.kind === 'block-replace')
    return fillBlock(dispatch, fact, prior)
  if (fact.kind === 'block-seal') return sealBlock(dispatch, fact, prior)
  return trimBlock(dispatch, fact, prior)
}
export function reduceFacts(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  facts: readonly TransportFact[],
): ModelFailure | null {
  for (const fact of facts) {
    const failure = reduceFact(call, dispatch, fact)
    if (failure) return failure
  }
  return null
}
