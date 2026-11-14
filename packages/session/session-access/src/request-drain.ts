import { commitCall, UNAVAILABLE, type Answer } from './answers.ts'
import type { RequestJournal } from './ports.ts'
import {
  enqueue,
  headOf,
  isQueued,
  lanesOf,
  leave,
  restore,
  type QueuedRequest,
  type RequestCandidate,
} from './request-queue.ts'

type Settled = Answer<'send-input'>

export type Admission = Readonly<{ kind: 'settled'; answer: Settled }> | Readonly<{ kind: 'retry' }>

export type RequestDrain = Readonly<{
  enqueue(candidate: RequestCandidate): Promise<Settled>
  isQueued(tenant: string, session: string, acceptId: string): boolean
  stop(): void
}>

export type RequestDrainInput = Readonly<{
  journal: RequestJournal
  admit(request: QueuedRequest): Promise<Admission>
  limit: number
  retryDelaysMs: readonly number[]
}>

function delayAfter(delaysMs: readonly number[], failures: number): number {
  return delaysMs[Math.min(failures, delaysMs.length) - 1] ?? 0
}

export function createRequestDrain(input: RequestDrainInput): RequestDrain {
  const { journal, limit, retryDelaysMs } = input
  let queue = restore(journal.pending)
  let stopped = false
  const landing = new Set<QueuedRequest>()
  const waiters = new Map<QueuedRequest, ((answer: Settled) => void)[]>()
  const draining = new Set<string>()
  const timers = new Set<ReturnType<typeof setTimeout>>()

  function settled(request: QueuedRequest): Promise<Settled> {
    return new Promise(resolve => {
      waiters.set(request, [...(waiters.get(request) ?? []), resolve])
    })
  }

  function settle(request: QueuedRequest, answer: Settled): void {
    queue = leave(queue, request.tenant, request.session, request.acceptId)
    for (const resolve of waiters.get(request) ?? []) resolve(answer)
    waiters.delete(request)
  }

  function pause(delayMs: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, delayMs)
      timers.add(timer)
    })
  }

  async function drain(lane: string, tenant: string, session: string): Promise<void> {
    let failures = 0
    for (;;) {
      const head = headOf(queue, tenant, session)
      if (stopped || head === undefined || landing.has(head)) break
      const admitted = await commitCall(() => input.admit(head))
      if (admitted !== 'unknown' && admitted.kind === 'settled') {
        await journal.append({ kind: 'left', tenant, session, acceptId: head.acceptId })
        settle(head, admitted.answer)
        failures = 0
      } else {
        failures += 1
        await pause(delayAfter(retryDelaysMs, failures))
      }
    }
    draining.delete(lane)
  }

  function push(tenant: string, session: string): void {
    const lane = JSON.stringify([tenant, session])
    if (draining.has(lane)) return
    draining.add(lane)
    void drain(lane, tenant, session)
  }

  for (const [tenant, session] of lanesOf(queue)) push(tenant, session)

  return {
    async enqueue(candidate) {
      const decided = enqueue(queue, candidate, limit)
      if (decided.kind === 'limited')
        return { outcome: 'limited', body: { resource: 'pending-inputs', limit } }
      if (decided.kind === 'conflict') return { outcome: 'conflict', body: {} }
      const { request } = decided
      const answer = settled(request)
      if (decided.kind === 'same') return answer
      queue = decided.queue
      landing.add(request)
      const durable = await journal.append({ kind: 'enqueued', ...request })
      landing.delete(request)
      if (durable) push(request.tenant, request.session)
      else settle(request, UNAVAILABLE)
      return answer
    },
    isQueued: (tenant, session, acceptId) => isQueued(queue, tenant, session, acceptId),
    stop() {
      stopped = true
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    },
  }
}
