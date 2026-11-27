import { pluginProtocol, type PluginProtocol } from '@omne-harness/plugin-protocol'
import { encodeTenantText, type TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'

export type Given = Readonly<{
  name: string
  version: string
  manifest: string
  files: readonly Readonly<{ path: string; digest: string; bytes: number }>[]
}>

type Member = Readonly<Record<string, unknown>>

function listed(name: string, version: string, written: Member): Given {
  const manifest = JSON.stringify({ schema: 1, name, summary: 'a look', ...written })
  return {
    name,
    version,
    manifest,
    files: [{ path: 'plugin.json', digest: version, bytes: manifest.length }],
  }
}

export function given(name: string, version: string, ...members: Member[]): Given {
  return listed(name, version, { client: { members } })
}

/** A plugin whose manifest says it is a skin. */
export function givenSkin(name: string, version: string, ...members: Member[]): Given {
  return listed(name, version, { kind: 'skin', client: { members } })
}

/** A source a case sets: each tenant has its own list; it says so on opening and each time one is set. */
const LIMITS = {
  maxBytes: 1_048_576,
  maxDepth: 32,
  maxItems: 65_536,
  maxMembers: 1024,
  maxStringLength: 1_048_576,
  maxNumberLength: 64,
}

export function fakeSource() {
  const lists = new Map<string, readonly Given[] | 'unavailable'>()
  const asked: string[] = []
  const opened: Readonly<Record<string, unknown>>[] = []
  const reports: Readonly<Record<string, unknown>>[] = []
  let delivering = true
  let knowsWaiting = true
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
    'report-loaded': async (body: Readonly<Record<string, unknown>>) => {
      // The server reads the body by the rule of the protocol: a body it cannot read is not kept.
      if (!pluginProtocol.operations['report-loaded'].body.write(body as never, LIMITS, 3).ok)
        return { outcome: 'invalid' }
      // A server before revision 3 of plugin/v1: the client finds a field it does not know and does not send.
      const told = body['plugins'] as readonly Readonly<Record<string, unknown>>[]
      if (!knowsWaiting && told.some(each => 'waiting' in each)) return { outcome: 'unavailable' }
      reports.push(body)
      return delivering ? { outcome: 'succeeded', body: {} } : { outcome: 'unavailable' }
    },
    observe: {
      'observe-wanted': async function* (
        open: Readonly<Record<string, unknown>>,
        options: { signal: AbortSignal },
      ) {
        opened.push(open)
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
    opened,
    reports,
    deliver(next: boolean): void {
      delivering = next
    },
    knowWaiting(next: boolean): void {
      knowsWaiting = next
    },
    set(tenant: string, plugins: readonly Given[] | 'unavailable'): void {
      lists.set(tenant, plugins)
      for (const push of pushes) push()
    },
  }
}
