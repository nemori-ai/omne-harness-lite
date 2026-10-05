import type {
  ModelCallHost,
  RuntimeCloseResult,
} from '@omne-harness-lite/model-request-runtime-local'

/** One explicit lifetime for calls opened by this CLI session. */
export interface DemoCallHost {
  readonly host: ModelCallHost
  readonly stop: () => Promise<RuntimeCloseResult>
  /** True only after every registered container has actually released. */
  readonly released?: () => boolean
}
export function createDemoCallHost(): DemoCallHost {
  const controller = new AbortController()
  const registrations = new Set<() => Promise<RuntimeCloseResult>>()
  let stopping = false
  let released = false
  let closing: Promise<RuntimeCloseResult> | undefined

  const host: ModelCallHost = {
    signal: controller.signal,
    stopping: () => stopping,
    register(close) {
      // No await separates the stop check from registration.
      if (stopping) return { runtimeStopped: true }
      registrations.add(close)
      return {
        registration: {
          unregister() {
            registrations.delete(close)
          },
        },
      }
    },
  }

  /**
   * Containers of one Session share a settlement owner whose concurrency is a finite budget, so
   * closing several at once can lose that admission and answer `unavailable` ("close again")
   * while the loser stays registered. A pass retries only those clean refusals; the loop ends
   * when none is left or a whole pass released nothing, so it needs neither a timer nor a retry
   * count. An owner that threw is a defect: it stays registered for an explicit later stop.
   */
  async function releaseRegistrations(): Promise<RuntimeCloseResult> {
    let pending = [...registrations]
    while (pending.length !== 0) {
      const results = await Promise.allSettled(pending.map(close => Promise.resolve().then(close)))
      const refused: (typeof pending)[number][] = []
      let progressed = false
      results.forEach((result, index) => {
        const close = pending[index]
        if (close === undefined || result.status === 'rejected') return
        if ('released' in result.value) {
          registrations.delete(close)
          progressed = true
        } else refused.push(close)
      })
      if (!progressed) break
      pending = refused
    }
    released = registrations.size === 0
    return released ? { released: true } : { unavailable: true }
  }

  function stop(): Promise<RuntimeCloseResult> {
    if (!stopping) {
      stopping = true
      controller.abort()
    }
    closing ??= releaseRegistrations().finally(() => {
      closing = undefined
    })
    return closing
  }

  return { host, stop, released: () => released }
}
