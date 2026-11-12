// The public Model stream of the release (#1214, RFC-0015 §8「会话观察」, model-host-local SPEC
// 「首次执行与公共观察接线」): what the application adds between the confirming observation source of
// the `model-records` activation and the host plugin that publishes `modelStreamReferences` and
// `modelStreamObservation`.
//
// - `observationTiming`: the timing the source waits with, over the monotonic clock of the process.
// - `qualifyingObservation`: the source with the application's admission point. The source asks the
//   synchronous authority of the qualification registry at every check, and that authority knows
//   only a principal an admission point captured. So `current` runs inside one capture, and an
//   observation holds a capture for as long as it runs and takes it anew every `recheckMs`: an old
//   allowed is no lasting permission (model-contract SPEC「current 的失败与读取顺序」step 4), and a
//   standing or login that is no longer valid ends the observation at the source's next check.
//   Ending, returning or aborting an observation releases only its own captures; the Model call goes
//   on (RFC-0015 §8「会话观察只管自己的订阅」).
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
