import type { ModelCallHost, RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'

/** One explicit lifetime for calls opened by this CLI session. */
export interface DemoCallHost {
  readonly host: ModelCallHost
  readonly stop: () => Promise<RuntimeCloseResult>
}
export function createDemoCallHost(): DemoCallHost {
  const controller = new AbortController()
  const registrations = new Set<() => Promise<RuntimeCloseResult>>()
  let stopping = false
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

  function stop(): Promise<RuntimeCloseResult> {
    if (!stopping) {
      stopping = true
      controller.abort()
    }
    if (closing !== undefined) return closing
    const callbacks = [...registrations]
    closing = Promise.allSettled(callbacks.map(close => Promise.resolve().then(close)))
      .then(results => {
        for (const [index, result] of results.entries()) {
          if (result.status === 'fulfilled' && 'released' in result.value) {
            const close = callbacks[index]
            if (close !== undefined) registrations.delete(close)
          }
        }
        return registrations.size === 0
          ? ({ released: true } as const)
          : ({ unavailable: true } as const)
      })
      .finally(() => {
        closing = undefined
      })
    return closing
  }

  return { host, stop }
}
