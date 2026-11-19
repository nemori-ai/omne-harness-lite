import type { AssetsProtocol } from '@omne-harness/assets-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export type TenantChanges = Readonly<{
  subscribe(tenant: TenantId, listener: () => void): () => void
}>

export type TenantChangesDeps = Readonly<{
  client: ClientOf<AssetsProtocol>
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
  backoff?: readonly number[]
}>

const BACKOFF = [1000, 2000, 5000, 10_000, 30_000]

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

type Watch = { readonly listeners: Set<() => void>; readonly controller: AbortController }

/** One observation per tenant, shared by every view of it; a broken one is opened again after a pause. */
export function createTenantChanges(deps: TenantChangesDeps): TenantChanges {
  const wait = deps.wait ?? delay
  const backoff = deps.backoff ?? BACKOFF
  const watches = new Map<string, Watch>()

  async function follow(tenant: TenantId, watch: Watch): Promise<void> {
    const { signal } = watch.controller
    for (let attempt = 0; !signal.aborted; attempt += 1) {
      try {
        const frames = deps.client.observe['observe-assets']({ tenant }, { signal })
        for (let next = await frames.next(); next.done !== true; next = await frames.next()) {
          attempt = 0
          for (const listener of watch.listeners) listener()
        }
      } catch {
        // An observation that throws is one that ended: it is opened again below.
      }
      if (signal.aborted) return
      await wait(backoff[Math.min(attempt, backoff.length - 1)] ?? 0, signal)
    }
  }

  return {
    subscribe(tenant, listener) {
      const key = encodeTenantText(tenant)
      let watch = watches.get(key)
      if (watch === undefined) {
        const made: Watch = { listeners: new Set(), controller: new AbortController() }
        watches.set(key, made)
        void follow(tenant, made)
        watch = made
      }
      const own = watch
      own.listeners.add(listener)
      return () => {
        own.listeners.delete(listener)
        if (own.listeners.size > 0) return
        own.controller.abort()
        if (watches.get(key) === own) watches.delete(key)
      }
    },
  }
}
