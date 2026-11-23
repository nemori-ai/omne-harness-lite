import type { PluginProtocol } from '@omne-harness/plugin-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export type Given = Readonly<{
  name: string
  version: string
  manifest: string
  files: readonly Readonly<{ path: string; digest: string; bytes: number }>[]
}>

type Member = Readonly<Record<string, unknown>>

export function given(name: string, version: string, ...members: Member[]): Given {
  const manifest = JSON.stringify({ schema: 1, name, summary: 'a look', client: { members } })
  return {
    name,
    version,
    manifest,
    files: [{ path: 'plugin.json', digest: version, bytes: manifest.length }],
  }
}

/** A source a case sets: each tenant has its own list; it says so on opening and each time one is set. */
export function fakeSource() {
  const lists = new Map<string, readonly Given[] | 'unavailable'>()
  const asked: string[] = []
  const pushes = new Set<() => void>()
  const accountOf = (body: unknown): string => {
    try {
      return encodeTenantText((body as { tenant: TenantId }).tenant)
    } catch {
      return 'not a tenant'
    }
  }
  const client = {
    'list-wanted': async (body: unknown) => {
      asked.push(accountOf(body))
      const plugins = lists.get(accountOf(body)) ?? []
      return plugins === 'unavailable'
        ? { outcome: 'unavailable' }
        : { outcome: 'succeeded', body: { plugins } }
    },
    observe: {
      'observe-wanted': async function* (_open: unknown, options: { signal: AbortSignal }) {
        let pending = 1
        let wake: (() => void) | undefined
        const push = (): void => {
          pending += 1
          wake?.()
        }
        pushes.add(push)
        options.signal.addEventListener('abort', push)
        try {
          for (;;) {
            if (pending === 0) await new Promise<void>(resolve => (wake = resolve))
            if (options.signal.aborted) return { kind: 'aborted' as const }
            pending -= 1
            yield { kind: 'changed' as const }
          }
        } finally {
          pushes.delete(push)
        }
      },
    },
  } as unknown as ClientOf<PluginProtocol>
  return {
    client,
    asked,
    set(tenant: string, plugins: readonly Given[] | 'unavailable'): void {
      lists.set(tenant, plugins)
      for (const push of pushes) push()
    },
  }
}
