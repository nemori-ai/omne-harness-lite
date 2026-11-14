import type {
  AgentCheckpoint,
  DurableEvidence,
  PendingCall,
  ProducedResult,
  Failure,
  LoopFacts,
  StepId,
  VoidedIntent,
} from '@omne-harness/agent-contract'
import { faultIsTransient } from '@omne-harness/model-contract'
import type * as M from '@omne-harness/model-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { replyMessageId } from './identities.ts'

type Message = LoopFacts['inputs'][number]
export type ModelOutcome = Readonly<{
  produced: ProducedResult
  settlement: Pick<M.Settlement, 'termination' | 'source'>
}> &
  (
    | Readonly<{ kind: 'reply'; reply: Extract<Message, { role: 'assistant' }> }>
    | Readonly<{ kind: 'interrupted' }>
    | Readonly<{ kind: 'unusable'; nature: 'transient' | 'permanent' }>
  )
export type ModelResult = ModelOutcome &
  Readonly<{
    parts: readonly M.ResultPart[]
  }>

function sealedReasoning(part: M.ResultPart): boolean {
  return (
    part.kind === 'sealed' &&
    (part.block.kind === 'reasoning_state' || part.block.kind === 'thinking')
  )
}

function truncated(parts: readonly M.ResultPart[]): boolean {
  return parts.some(part => part.kind === 'partial')
}

export function consumeModelResult(
  input: Parameters<typeof replyMessageId>,
  value: Omit<ModelResult, 'kind'>,
): Outcome<ModelResult, Failure> {
  const content = value.parts.filter(part => !sealedReasoning(part))
  const terminal = value.settlement.termination
  if (terminal.kind === 'interrupted') return succeed({ ...value, kind: 'interrupted' })
  if (terminal.kind === 'failed')
    return succeed({
      ...value,
      kind: 'unusable',
      nature: faultIsTransient(terminal.fault.cause) ? 'transient' : 'permanent',
    })
  const blocks: M.ModelBlock[] = []
  for (const part of content) {
    if (part.kind === 'sealed') blocks.push(part.block)
  }
  const [first, ...rest] = blocks
  if (first === undefined || truncated(content))
    return succeed({ ...value, kind: 'unusable', nature: 'permanent' })
  return succeed({
    ...value,
    kind: 'reply',
    reply: { id: replyMessageId(...input), role: 'assistant', blocks: [first, ...rest] },
  })
}

export const LOST_CONTACT = 'lost-contact'

export function lostModelResult(call: M.ModelCallId, evidence: DurableEvidence): ModelResult {
  const fault: M.ModelFault = {
    cause: 'runtime-lost',
    diagnostic: LOST_CONTACT,
    upstreamStatus: null,
  }
  return {
    kind: 'unusable',
    nature: faultIsTransient(fault.cause) ? 'transient' : 'permanent',
    produced: {
      producer: { kind: 'model', call },
      version: LOST_CONTACT,
      delivery: null,
      source: evidence,
    },
    settlement: { termination: { kind: 'failed', fault }, source: evidence },
    parts: [],
  }
}

export function lostIntent(
  at: Pick<AgentCheckpoint, 'voided'>,
  call: Readonly<{
    step: StepId
    pending: Extract<PendingCall, { kind: 'model' }> | null
    lost: DurableEvidence | null
  }>,
): Partial<Pick<AgentCheckpoint, 'voided'>> {
  const { step, pending, lost } = call
  if (pending === null || lost === null) return {}
  const { action, reference } = pending
  const record = { kind: 'model' as const, step, action, reference, cause: 'lost' as const }
  return { voided: [...at.voided, { ...record, basis: lost }] }
}

export function unacceptedIntent(
  step: StepId,
  pending: Extract<PendingCall, { kind: 'model' }>,
  basis: DurableEvidence,
): VoidedIntent {
  const { action, reference } = pending
  return { kind: 'model', step, action, reference, cause: 'not-accepted', basis }
}

export function voidedModelIntents(voided: readonly VoidedIntent[], step: StepId): number {
  return voided.filter(item => item.kind === 'model' && item.step === step).length
}

const DIAGNOSTIC_LIMIT = 120

export function noReplyReason(result: Pick<ModelResult, 'settlement' | 'parts'>): string {
  const terminal = result.settlement.termination
  if (terminal.kind !== 'failed') return truncated(result.parts) ? 'model-truncated' : 'no-reply'
  const diagnostic = encodeURIComponent(terminal.fault.diagnostic.slice(0, DIAGNOSTIC_LIMIT))
  return `model-failed/${terminal.fault.cause}/${diagnostic === '' ? '-' : diagnostic}`
}
