import { readTenantText } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { UsageProtocol } from '@omne-harness/usage-protocol'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { useEffect, useState } from 'react'
import type { RangeWindow } from '../model/range.ts'
import type { Occupancy, QueryBody, QueryResult } from '../model/shapes.ts'

export type UsageClient = ClientOf<UsageProtocol>

export type Loaded<T> =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; value: T }>
  | Readonly<{ kind: 'refused'; text: string }>

const REFUSALS: Readonly<Record<string, string>> = {
  denied: '没有权限，或登录已失效。',
  'basis-unavailable': '服务端暂时读不出用量，稍后再试。',
  'not-found': '没有这个会话。',
  invalid: '这次查询的条件不对。',
  limited: '这段时间的数据太多，换一个短一些的时间段。',
  unsupported: '不支持这个范围。',
  unavailable: '连不上服务，稍后再试。',
  uncertain: '结果不确定，稍后刷新。',
}

export const refusalOf = (outcome: string): string =>
  REFUSALS[outcome] ?? `读取没有成功（${outcome}）。`

const instantOf = (at: Date): Instant => {
  const parsed = parseInstant(at.toISOString())
  if (!parsed.ok) throw new TypeError('usage-ui: a Date that is not an instant')
  return parsed.value
}

export type QueryShape = Readonly<{
  session: string | null
  window: RangeWindow
  groupBy: QueryBody['groupBy']
}>

/** One read of the usage protocol per distinct question within one refresh; answers are shared. */
export type UsageReads = Readonly<{
  query: (tenant: string, shape: QueryShape) => Promise<Loaded<QueryResult>>
  occupancy: (tenant: string, session: string) => Promise<Loaded<Occupancy>>
  refresh: () => void
  generation: () => number
  subscribe: (listener: () => void) => () => void
}>

export function createUsageReads(client: UsageClient, zone: () => string): UsageReads {
  let generation = 0
  let cache = new Map<string, Promise<Loaded<unknown>>>()
  const listeners = new Set<() => void>()
  const once = <T>(key: string, read: () => Promise<Loaded<T>>): Promise<Loaded<T>> => {
    const known = cache.get(key) as Promise<Loaded<T>> | undefined
    if (known !== undefined) return known
    const pending = read().catch((): Loaded<T> => ({
      kind: 'refused',
      text: refusalOf('unavailable'),
    }))
    cache.set(key, pending)
    return pending
  }
  const answered = <T>(answer: { outcome: string; body?: unknown }): Loaded<T> =>
    answer.outcome === 'succeeded'
      ? { kind: 'ready', value: answer.body as T }
      : { kind: 'refused', text: refusalOf(answer.outcome) }
  return {
    query: (tenantText, shape) =>
      once(JSON.stringify(['query', tenantText, shape]), async () => {
        const tenant = readTenantText(tenantText)
        if (tenant === undefined) return { kind: 'refused', text: '外壳给的租户读不懂。' }
        const body: QueryBody = {
          tenant,
          scope:
            shape.session === null
              ? { kind: 'tenant' }
              : { kind: 'session', session: shape.session },
          range: { from: instantOf(shape.window.since), to: instantOf(shape.window.before) },
          zone: zone(),
          bucket: shape.window.bucket,
          groupBy: shape.groupBy,
        }
        return answered<QueryResult>(await client['query-usage'](body))
      }),
    occupancy: (tenantText, session) =>
      once(JSON.stringify(['occupancy', tenantText, session]), async () => {
        const tenant = readTenantText(tenantText)
        if (tenant === undefined) return { kind: 'refused', text: '外壳给的租户读不懂。' }
        return answered<Occupancy>(await client['read-context-occupancy']({ tenant, session }))
      }),
    refresh: () => {
      generation += 1
      cache = new Map()
      for (const listener of listeners) listener()
    },
    generation: () => generation,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The answer to one read, read again whenever the reads are refreshed. */
export function useLoaded<T>(
  reads: UsageReads,
  key: string,
  read: () => Promise<Loaded<T>>,
): Loaded<T> {
  const [generation, setGeneration] = useState(reads.generation)
  const [state, setState] = useState<Readonly<{ key: string; loaded: Loaded<T> }>>({
    key: '',
    loaded: { kind: 'loading' },
  })
  useEffect(() => reads.subscribe(() => setGeneration(reads.generation())), [reads])
  const token = `${generation}:${key}`
  useEffect(() => {
    let live = true
    void read().then(loaded => {
      if (live) setState({ key: token, loaded })
    })
    return () => {
      live = false
    }
  }, [token])
  return state.key === token ? state.loaded : { kind: 'loading' }
}
