import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type LedgerDomain } from '@omne-harness/tool'
import {
  judgeToolDelivery,
  resolveToolInvocationRef,
  type ConsumerRef,
  type Effect,
  type ToolFailure,
  type ToolResultData,
  type ToolResultReceiver,
  type ToolResultVersion,
  type ToolTerminal,
} from '@omne-harness/tool-contract'
import type { ToolChildren } from '@omne-harness/tool-contract/provider'
import { readIssued, sourceKey } from './invocation-forwarding.ts'
import type { LocalInvocationSourceInput } from './invocation-source.ts'
import { programPositionOf, TOOL_PROGRAM_OWNER } from './program-source.ts'

/** What a retained result gives the program that waits for it. The text of the result is not kept. */
export type ProgramArrival = Readonly<{
  result: ToolResultVersion
  terminal: ToolTerminal
  effect: Effect
  data: ToolResultData
}>

export type ProgramArrivals = Readonly<{
  wait(
    tenant: LedgerDomain['tenant'],
    consumer: ConsumerRef,
    signal: AbortSignal,
  ): Promise<ProgramArrival | null>
  arrived(tenant: LedgerDomain['tenant'], consumer: ConsumerRef, arrival: ProgramArrival): void
}>

export function createProgramArrivals(): ProgramArrivals {
  const waiting = new Map<string, Set<(arrival: ProgramArrival) => void>>()
  const keyOf = (tenant: LedgerDomain['tenant'], consumer: ConsumerRef) =>
    canonicalDigest([tenant.organization.text, tenant.account.text, consumer])
  return {
    wait(tenant, consumer, signal) {
      if (signal.aborted) return Promise.resolve(null)
      const key = keyOf(tenant, consumer)
      return new Promise(resolve => {
        const waiters = waiting.get(key) ?? new Set()
        waiting.set(key, waiters)
        const leave = () => {
          waiters.delete(arrive)
          if (waiters.size === 0) waiting.delete(key)
          signal.removeEventListener('abort', abandon)
        }
        const arrive = (arrival: ProgramArrival) => {
          leave()
          resolve(arrival)
        }
        const abandon = () => {
          leave()
          resolve(null)
        }
        waiters.add(arrive)
        signal.addEventListener('abort', abandon, { once: true })
      })
    },
    arrived(tenant, consumer, arrival) {
      for (const arrive of new Set(waiting.get(keyOf(tenant, consumer)))) arrive(arrival)
    },
  }
}

const retainedFailure = (failure: ToolFailure) => {
  if (failure.kind === 'commit-unknown') return fail({ kind: 'outcome-unknown' as const })
  if (failure.kind === 'denied') return fail({ kind: 'denied' as const })
  if (failure.kind === 'conflict') return fail({ kind: 'conflict' as const })
  return fail({ kind: 'unavailable' as const, dependency: 'program-positions' })
}

/** TL-73: saved means the position in the parent's domain recorded the result version. Nothing is copied. */
export function createProgramReceiver<P, B extends ContentBlock>(
  input: LocalInvocationSourceInput<P>,
  arrivals: ProgramArrivals,
): ToolResultReceiver<P, B> {
  type Push = Parameters<ToolResultReceiver<P, B>['push']>[0]
  type Saved = ReturnType<ToolResultReceiver<P, B>['push']>
  const placeOf = async ({ access, delivery }: Push) => {
    const judged = judgeToolDelivery({ tenant: access.tenant, delivery })
    if ('failure' in judged) return fail({ kind: 'invalid' as const, ...judged.failure })
    const place = programPositionOf(delivery.consumer)
    const reference = resolveToolInvocationRef(delivery.key.reference, access.tenant)
    if (place === null || 'failure' in reference) return fail({ kind: 'denied' as const })
    const found = await readIssued(input.store, access.tenant, delivery.consumer, 'program')
    const stored = 'ok' in found ? found.ok.stored : null
    if (stored === null)
      return fail({ kind: 'unavailable' as const, dependency: 'invocation-source' })
    const { call, admission } = reference.ok
    return stored.call === call && stored.admission === admission
      ? succeed(place)
      : fail({ kind: 'denied' as const })
  }
  const save = async (pushed: Push): Saved => {
    const { access, delivery } = pushed
    const place = await placeOf(pushed)
    if ('failure' in place) return place
    const children: ToolChildren<P> | undefined = input.programs?.children()
    if (children === undefined)
      return fail({ kind: 'unavailable', dependency: 'program-positions' })
    const at = { ...access, call: place.ok.parent, ordinal: place.ok.ordinal }
    const evidence = {
      owner: TOOL_PROGRAM_OWNER,
      record: `${sourceKey(delivery.consumer)}/position`,
      revision: '1',
      digest: canonicalDigest(delivery.key),
    }
    const saved = succeed({ key: delivery.key, evidence })
    if (delivery.kind === 'account') return saved
    if (delivery.kind === 'placeholder') {
      const moved = await children.background(at)
      return 'failure' in moved ? retainedFailure(moved.failure) : saved
    }
    const { terminal, effect } = delivery
    const result = delivery.key.result
    const kept = await children.retain({ ...at, result, terminal, effect })
    if ('failure' in kept) return retainedFailure(kept.failure)
    const data = structuredClone(delivery.value.data)
    arrivals.arrived(access.tenant, delivery.consumer, { result, terminal, effect, data })
    return saved
  }
  return {
    async push(pushed) {
      if (pushed.signal.aborted) return fail({ kind: 'cancelled-before-accept' })
      try {
        return await save(pushed)
      } catch {
        return fail({ kind: 'unavailable', dependency: 'program-positions' })
      }
    },
  }
}
