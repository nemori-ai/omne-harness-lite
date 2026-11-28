import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ChangeAbout,
  EndpointChangeListener,
  EndpointChanges,
} from '@omne-harness/mcp-contract'

export type ChangeFeed = EndpointChanges &
  Readonly<{ changed(tenant: TenantId, about?: ChangeAbout): void; close(): void }>

const told = (tell: () => void): void => {
  try {
    tell()
  } catch {}
}

/** Tells each subscriber that the endpoints of a tenant may have changed; a subscriber that throws is left alone. */
export function createChangeFeed(): ChangeFeed {
  const listeners = new Set<EndpointChangeListener>()
  let closed = false
  return {
    subscribe(listener) {
      if (closed) {
        told(() => listener.closed())
        return () => undefined
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    changed(tenant, about = 'endpoints') {
      for (const listener of listeners) told(() => listener.changed(tenant, about))
    },
    close() {
      closed = true
      const all = [...listeners]
      listeners.clear()
      for (const listener of all) told(() => listener.closed())
    },
  }
}
