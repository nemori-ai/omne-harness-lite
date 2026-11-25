import type { AgentOperationId, DurableEvidence, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ExecutionDrive } from './loop/coordinator.ts'

export type HandoverAnswer = Outcome<DurableEvidence, Failure>

/** A reload's request to hand the execution over at its next safe point, and who waits for the answer. */
export type PlannedHandover = Readonly<{
  operation: AgentOperationId
  reason: DurableEvidence
  waiters: Array<(answer: HandoverAnswer) => void>
}>

type Asked = Readonly<{
  operation: AgentOperationId
  reason: DurableEvidence
  settle(handed: boolean): void
}>

/** The part of a drive that hands its execution over: a reload's request, a quiesce's, and a pass to run again. */
export type Held = {
  wait: AbortController | null
  poked: boolean
  asked: Asked | null
  planned: PlannedHandover | null
}

/** Answers whoever waits on the request the drive holds, and lets it go. */
export function settlePlanned(own: Pick<Held, 'planned'>, answer: HandoverAnswer): void {
  const planned = own.planned
  own.planned = null
  for (const wake of planned?.waiters.splice(0) ?? []) wake(answer)
}

/** The same operation joins the request held; another one is busy; a drive that is not this execution's is not current. */
export function askPlanned(
  own: Held | null,
  input: Readonly<{ operation: AgentOperationId; reason: DurableEvidence }>,
): Promise<HandoverAnswer> {
  if (own === null) return Promise.resolve(fail({ kind: 'stale-advance' }))
  const held = own.planned
  if (held !== null && held.operation !== input.operation)
    return Promise.resolve(fail({ kind: 'busy' }))
  return new Promise(settle => {
    if (held !== null) {
      held.waiters.push(settle)
      return
    }
    own.planned = { operation: input.operation, reason: input.reason, waiters: [settle] }
    own.wait?.abort()
  })
}

async function handOverPlanned(
  own: Held,
  planned: PlannedHandover,
  coordinator: Pick<ExecutionDrive, 'handOver'>,
): Promise<boolean> {
  const { operation, reason } = planned
  const handed = await coordinator.handOver({ operation, reason, at: 'safe-point' })
  if ('failure' in handed) {
    own.poked = true
    settlePlanned(own, fail(handed.failure.failure))
    return false
  }
  const evidence = handed.ok
  if (evidence === null) return false
  settlePlanned(own, succeed(evidence))
  own.asked?.settle(true)
  own.asked = null
  return true
}

/** After a pass: a reload's request at its safe point first, then a quiesce's; true once the execution is handed over. */
export async function handOverAsked(
  own: Held,
  coordinator: Pick<ExecutionDrive, 'handOver'>,
  handed: () => void,
): Promise<boolean> {
  if (own.planned !== null && (await handOverPlanned(own, own.planned, coordinator))) {
    handed()
    return true
  }
  const asked = own.asked
  if (asked === null) return false
  own.asked = null
  const answer = await coordinator.handOver(asked)
  const done = 'ok' in answer && answer.ok !== null
  if (done) handed()
  asked.settle(done)
  return done
}
