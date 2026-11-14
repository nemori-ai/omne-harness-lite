// The pair's `commands` are not wrapped: the host compares them with the injected `modelCommands`.
import type { Access } from '@omne-harness/legal-identity'
import type { ModelObservationSource, ModelObservationTiming } from '@omne-harness/model/commands'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { succeed } from '@omne-harness/operation-result'
import { monotonicClock } from '../shutdown.ts'

/** The pair the host plugin takes: both from one `model-records` activation. */
export type ModelObservationPair = Readonly<{
  commands: ModelCommands<unknown>
  source: ModelObservationSource<unknown>
}>

/** Captures `access` for the caller; the return releases this capture only. */
export type ObservationQualify = (access: Access<unknown>) => Promise<() => void>

export const observationTiming: ModelObservationTiming = Object.freeze({
  nowMs: () => monotonicClock.now(),
  waitUntil: (deadlineMs: number, signal: AbortSignal) => {
    if (signal.aborted) return Promise.resolve('cancelled' as const)
    const timer = monotonicClock.after(deadlineMs - monotonicClock.now())
    return new Promise<'elapsed' | 'cancelled'>(resolve => {
      const cancel = () => {
        timer.cancel()
        resolve('cancelled')
      }
      signal.addEventListener('abort', cancel, { once: true })
      void timer.promise.then(() => {
        signal.removeEventListener('abort', cancel)
        resolve('elapsed')
      })
    })
  },
})

type Host = Extract<ReturnType<ModelObservationSource<unknown>['openHost']>, { ok: unknown }>['ok']
type ObserveInput = Parameters<Host['observation']['observe']>[0]
type Frame = Host['observation']['observe'] extends (input: never) => AsyncIterable<infer F>
  ? F
  : never

/** The observation of `host` with a capture held while it runs and taken anew every `recheckMs`. */
async function* observeQualified(
  host: Host,
  input: ObserveInput,
  qualify: ObservationQualify,
  recheckMs: number,
): AsyncGenerator<Frame, void, undefined> {
  const holds = new Set<() => void>()
  const stop = new AbortController()
  const take = async (): Promise<void> => {
    const release = await qualify(input.access)
    if (stop.signal.aborted) release()
    else holds.add(release)
  }
  const recheck = async (): Promise<void> => {
    while (
      (await observationTiming.waitUntil(observationTiming.nowMs() + recheckMs, stop.signal)) ===
      'elapsed'
    ) {
      const previous = [...holds]
      await take()
      for (const release of previous) {
        holds.delete(release)
        release()
      }
    }
  }
  const releaseAll = (): void => {
    for (const release of holds) release()
    holds.clear()
  }
  try {
    await take()
    // A recheck that fails leaves no capture: the source's next check answers unavailable and ends
    // the observation, instead of the old capture going on as a lasting permission.
    void recheck().catch(releaseAll)
    yield* host.observation.observe(input)
  } finally {
    stop.abort()
    releaseAll()
  }
}

/** `source` with the application's admission point on `current` and on every observation. */
export function qualifyingObservation(
  source: ModelObservationSource<unknown>,
  qualify: ObservationQualify,
  recheckMs: number,
): ModelObservationSource<unknown> {
  return Object.freeze({
    close: () => source.close(),
    openHost() {
      const opened = source.openHost()
      if ('failure' in opened) return opened
      const host = opened.ok
      return succeed(
        Object.freeze({
          attach: publication => host.attach(publication),
          retire: publication => host.retire(publication),
          close: () => host.close(),
          references: Object.freeze({
            async current(input: Parameters<Host['references']['current']>[0]) {
              const release = await qualify(input.access)
              try {
                return await host.references.current(input)
              } finally {
                release()
              }
            },
          }),
          observation: Object.freeze({
            observe: (input: ObserveInput) => observeQualified(host, input, qualify, recheckMs),
          }),
        } satisfies Host),
      )
    },
  })
}
