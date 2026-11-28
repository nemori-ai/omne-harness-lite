import type {
  InspectionAsked,
  InspectionNow,
  InspectionResult,
  SeenResult,
} from '@omne-harness/interface-protocol'
import type { TimeSource } from '@omne-harness/time-source'
import {
  EMPTY_LEDGER,
  stepLedger,
  type Answer,
  type Channel,
  type InspectionFrame,
  type LedgerEffect,
  type LedgerEvent,
  type LedgerPolicy,
} from './ledger.ts'

export type Asked = Omit<InspectionAsked, 'request'> | Omit<InspectionNow, 'request'>

/** One client observing for its tenant: the frames waiting for it, and how to wake its reader. */
type Watcher = { readonly frames: InspectionFrame[]; wake: (() => void) | undefined }

export type Inspections = Readonly<{
  /** Asks a client of the tenant once; answers when it has an outcome, or with cancelled when the signal ends it first. */
  inspect(
    tenant: string,
    asked: Asked,
    signal?: AbortSignal,
  ): Promise<Answer | { kind: 'cancelled' }>
  watch<C extends Channel>(
    tenant: string,
    client: string,
    channel: C,
    revision: number,
    signal: AbortSignal,
  ): AsyncGenerator<C extends 'look' ? InspectionAsked : InspectionNow, 'unavailable'>
  deliver(
    tenant: string,
    client: string,
    request: string,
    result: InspectionResult,
  ): 'succeeded' | 'not-found'
  deliverSeen(
    tenant: string,
    client: string,
    request: string,
    result: SeenResult,
    met: boolean,
  ): 'succeeded' | 'not-found'
}>

const watcherKey = (tenant: string, client: string, channel: Channel) =>
  JSON.stringify([tenant, client, channel])

const outcomeOf = (effects: readonly LedgerEffect[]): 'succeeded' | 'not-found' => {
  const told = effects.find(effect => effect.kind === 'delivered')
  return told?.kind === 'delivered' ? told.outcome : 'not-found'
}

/** Runs the ledger: each step's effects are done here, and only here. */
export function createInspections(
  input: Readonly<{ time: TimeSource; policy: LedgerPolicy; newId?: () => string }>,
): Inspections {
  const { time, policy } = input
  const newId = input.newId ?? (() => crypto.randomUUID())
  let ledger = EMPTY_LEDGER
  const watchers = new Map<string, Watcher>()
  const callers = new Map<string, (answer: Answer) => void>()
  const timers = new Map<string, () => void>()

  function run(effect: LedgerEffect): void {
    if (effect.kind === 'send') {
      const watcher = watchers.get(watcherKey(effect.tenant, effect.client, effect.channel))
      watcher?.frames.push(effect.asked)
      watcher?.wake?.()
      const { request } = effect.asked
      timers.set(
        request,
        time.after(policy.dueMs, () => dispatch({ kind: 'expire', request })),
      )
    } else if (effect.kind === 'settle') {
      timers.get(effect.request)?.()
      timers.delete(effect.request)
      callers.get(effect.request)?.(effect.answer)
      callers.delete(effect.request)
    }
  }

  function dispatch(event: LedgerEvent): readonly LedgerEffect[] {
    const step = stepLedger(ledger, event, policy)
    ledger = step.ledger
    for (const effect of step.effects) run(effect)
    return step.effects
  }

  return {
    inspect(tenant, asked, signal) {
      const request = newId()
      return new Promise(resolve => {
        if (signal?.aborted === true) return resolve({ kind: 'cancelled' })
        const cancel = (): void => {
          callers.delete(request)
          dispatch({ kind: 'cancel', request })
          timers.get(request)?.()
          timers.delete(request)
          resolve({ kind: 'cancelled' })
        }
        signal?.addEventListener('abort', cancel, { once: true })
        callers.set(request, answer => {
          signal?.removeEventListener('abort', cancel)
          resolve(answer)
        })
        dispatch({
          kind: 'ask',
          tenant,
          asked: { ...asked, request } as InspectionFrame,
          now: time.now(),
        })
      })
    },
    async *watch(tenant, client, channel, revision, signal) {
      const key = watcherKey(tenant, client, channel)
      const watcher: Watcher = { frames: [], wake: undefined }
      watchers.set(key, watcher)
      dispatch({ kind: 'arrive', tenant, client, channel, revision })
      const stop = (): void => watcher.wake?.()
      signal.addEventListener('abort', stop)
      try {
        for (;;) {
          const next = watcher.frames.shift()
          if (next !== undefined) {
            yield next as never
            continue
          }
          if (signal.aborted) return 'unavailable'
          await new Promise<void>(resolve => (watcher.wake = resolve))
        }
      } finally {
        signal.removeEventListener('abort', stop)
        if (watchers.get(key) === watcher) {
          watchers.delete(key)
          dispatch({ kind: 'leave', tenant, client, channel })
        }
      }
    },
    deliver(tenant, client, request, result) {
      return outcomeOf(dispatch({ kind: 'deliver', tenant, client, request, result }))
    },
    deliverSeen(tenant, client, request, result, met) {
      return outcomeOf(dispatch({ kind: 'deliver-seen', tenant, client, request, result, met }))
    },
  }
}
