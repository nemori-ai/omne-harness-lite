import type { ModelCallHost, RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'

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
   * closing several at once can lose that admission and leave the loser registered ("close
   * again"). A pass retries only the registrations that stayed; the loop ends when everything is
   * released or a whole pass made no progress, so it needs neither a timer nor a retry count.
   */
  async function releaseRegistrations(): Promise<RuntimeCloseResult> {
    let pending = [...registrations]
    while (pending.length !== 0) {
      const results = await Promise.allSettled(pending.map(close => Promise.resolve().then(close)))
      const kept = pending.filter((close, index) => {
        const result = results[index]
        if (result?.status === 'fulfilled' && 'released' in result.value) {
          registrations.delete(close)
          return false
        }
        return true
      })
      if (kept.length === pending.length) break
      pending = kept
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
