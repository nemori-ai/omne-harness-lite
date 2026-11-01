import { admitRevision, judgeCallAccount } from '@omne-harness/call-account'
import type { ModelFailure, VisibleBlock } from '@omne-harness/model-contract'
import type {
  CallAccountReport,
  ProviderDiagnostic,
  TransportFact,
} from '@omne-harness/model-contract/provider'
import type { MemoryCall, MemoryDispatch } from './state.ts'
import {
  completionOf,
  encodedBytes,
  hasContent,
  MAX_TERMINATION_BYTES,
  sealed,
  sealsWhole,
  wellFormed,
} from '../commands/judge.ts'
import { decimal, digest, invalid } from './value.ts'

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
