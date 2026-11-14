import type { AgentCheckpoint, VoidedIntent } from '@omne-harness/agent-contract'
import type { FactOf } from './facts.ts'
import type { ExecutionView } from './fold.ts'

type Voided = FactOf<'intent.voided'>
type Closing = Pick<ExecutionView, 'voided' | 'requests' | 'adopted'>

export function voidedFacts(
  view: Pick<ExecutionView, 'requests'>,
  added: readonly VoidedIntent[],
): Voided[] | null {
  const facts: Voided[] = []
  for (const item of added) {
    const basis = structuredClone(item.basis)
    const closed = { kind: 'intent.voided' as const, step: item.step, basis }
    if (item.kind === 'tool') {
      facts.push({ ...closed, intent: 'tool', action: item.action, cause: item.cause })
      continue
    }
    const request = view.requests.findLast(request => request.reference === item.reference)
    if (request === undefined) return null
    const { step, attempt } = request
    facts.push({ ...closed, intent: 'model', step, attempt, cause: item.cause })
  }
  return facts
}

export function modelAttempt(checkpoint: Pick<AgentCheckpoint, 'step' | 'voided'>): number {
  const { step, voided } = checkpoint
  return voided.filter(item => item.kind === 'model' && item.step === step).length
}

export function foldVoided(view: Closing, fact: Voided): Closing {
  const voided = [...view.voided, fact]
  if (fact.intent === 'tool') return { voided, requests: view.requests, adopted: view.adopted }
  const requests = view.requests.map(item =>
    item.step === fact.step && item.attempt === fact.attempt
      ? { ...item, voided: { cause: fact.cause, basis: fact.basis } }
      : item,
  )
  return { voided, requests, adopted: requests.findLast(item => item.voided === null) ?? null }
}
