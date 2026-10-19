import { randomUUID } from 'node:crypto'
import { judgePart, parseMessageId } from '@omne-harness/message'
import { assembleStream } from '@omne-harness/stream-arrival'
import { admitRevision, judgeCallAccount } from '@omne-harness/call-account'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type {
  ModelBlock,
  ModelFailure,
  TransportFact,
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
    if (block.kind === 'tool_call') {
      const parsed = readJsonText(prior.value, {
        maxBytes: Math.max(Buffer.byteLength(prior.value), 1),
        maxDepth: 256,
        maxItems: 100000,
        maxMembers: 100000,
        maxStringLength: Math.max(prior.value.length, 1),
        maxNumberLength: Math.max(prior.value.length, 1),
      })
      if (parsed.kind !== 'ok' || writeJsonText(parsed.value) !== writeJsonText(block.arguments))
        return invalid('block', 'tool-arguments')
    }
    if (filled) steps.push({ step: 'fill', index: '0', seq: '0', chunk: prior.value })
  }
  steps.push({ step: 'close', index: '0', block })
  const result = assembleStream({ target: target(), steps })
  return 'rejected' in result ? invalid('block', result.detail ?? result.rejected) : null
}
export function accountFact(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  event: string,
  value: Parameters<typeof judgeCallAccount>[0],
): ModelFailure | null {
  const judged = judgeCallAccount(value)
  if (
    'rejected' in judged ||
    !event ||
    judged.ok.subject.kind !== 'model_call' ||
    judged.ok.subject.id !== call.state.call
  )
    return invalid('account', 'shape-or-subject')
  const fingerprint = digest(judged.ok)
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
export function reduceFacts(
  call: MemoryCall,
  dispatch: MemoryDispatch,
  facts: readonly TransportFact[],
): ModelFailure | null {
  for (const fact of facts) {
    if (fact.kind !== 'account' && dispatch.record.terminal !== null)
      return invalid('facts', 'after-terminal')
    if (fact.kind === 'account') {
      const failure = accountFact(call, dispatch, fact.event, fact.value)
      if (failure) return failure
      continue
    }
    if (fact.kind === 'ended') {
      if (encodedBytes(fact.termination) > MAX_TERMINATION_BYTES)
        return invalid('termination', 'encoded-byte-limit')
      if (fact.termination.kind === 'completed' && fact.termination.reason !== 'limit') {
        if (dispatch.blocks.length === 0 || dispatch.blocks.some(b => b.kind !== 'sealed'))
          return invalid('termination', 'unsealed-or-empty')
        const steps: unknown[] = []
        for (const [i, visible] of dispatch.blocks.entries()) {
          if (visible.kind !== 'sealed') continue
          const block = visible.block
          steps.push({ step: 'open', index: String(i), mode: 'replace', head: head(block) })
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
            steps.push({ step: 'fill', index: String(i), seq: '0', chunk: body })
          steps.push({ step: 'close', index: String(i), block })
        }
        steps.push({ step: 'finish', index: String(dispatch.blocks.length) })
        if ('rejected' in assembleStream({ target: target(), steps }))
          return invalid('termination', 'invalid-completion')
      }
      const actual =
        fact.termination.kind === 'interrupted'
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
          : fact.termination
      dispatch.record = { ...dispatch.record, terminal: structuredClone(actual) }
      continue
    }
    if (!decimal(fact.index) || !Number.isSafeInteger(Number(fact.index)))
      return invalid('index', 'safe-integer')
    const prior = dispatch.blocks.find(b => b.index === fact.index)
    if (fact.kind === 'block-open') {
      const last = dispatch.blocks.at(-1)
      if (prior || (last && BigInt(fact.index) <= BigInt(last.index)))
        return invalid('index', 'order-or-duplicate')
      dispatch.blocks = [
        ...dispatch.blocks,
        { kind: 'growing', index: fact.index, mode: fact.mode, content: fact.content, value: '' },
      ]
      dispatch.nextSeq.set(fact.index, '0')
    } else if (fact.kind === 'block-delta' || fact.kind === 'block-replace') {
      if (!prior || prior.kind !== 'growing') return invalid('block', 'unopened-or-closed')
      if (prior.mode !== (fact.kind === 'block-delta' ? 'append' : 'replace'))
        return invalid('mode', 'changed')
      const value = fact.kind === 'block-delta' ? prior.value + fact.delta : fact.value
      dispatch.blocks = dispatch.blocks.map(b =>
        b.index === prior.index ? { ...prior, value } : b,
      )
      dispatch.nextSeq.set(fact.index, String(BigInt(dispatch.nextSeq.get(fact.index) ?? '0') + 1n))
      if ((fact.kind === 'block-delta' ? fact.delta : fact.value).length > 0) {
        dispatch.hadContent.add(fact.index)
        dispatch.record = { ...dispatch.record, firstContent: 'observed' }
      }
    } else if (fact.kind === 'block-seal') {
      if (!prior && fact.block.kind !== 'image' && fact.block.kind !== 'file')
        return invalid('block', 'unopened')
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
      const block = fact.block
      const nonempty =
        block.kind === 'text' || block.kind === 'thinking'
          ? block.text.length > 0
          : 'inline' in block
            ? block.inline.length > 0
            : true
      if (nonempty) dispatch.record = { ...dispatch.record, firstContent: 'observed' }
    } else {
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
    }
  }
  return null
}
