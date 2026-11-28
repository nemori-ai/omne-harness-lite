import type { ReadBody } from '../../src/endpoint-state.tsx'
import type { McpStatus } from '../../src/index.ts'

type Endpoint = ReadBody['endpoint']
type ReadAnswer = Awaited<ReturnType<McpStatus['read-endpoint']>>
type RefreshAnswer = Awaited<ReturnType<McpStatus['refresh-endpoint']>>

export const stood = (overrides: Partial<Endpoint> = {}): Endpoint => ({
  name: 'context7',
  connection: { state: 'ready', reason: null },
  credential: 'not-required',
  use: { kind: 'usable' },
  catalog: { kind: 'acquired', actions: 0 },
  ...overrides,
})

export const answered = (endpoint: Endpoint, actions: ReadBody['actions']): ReadAnswer =>
  ({ outcome: 'succeeded', body: { endpoint, actions } }) as ReadAnswer

export const action = (name: string, summary: string, reason: string | null = null) => ({
  name,
  summary,
  available: reason === null,
  reason,
})

const PUBLISHED = { outcome: 'succeeded', body: { refreshed: 'published', reason: null } }

/** Answers the reads in order, the last one from then on; a refresh answers what it is handed. */
export function fakeStatus(...reads: ReadAnswer[]) {
  const calls: string[] = []
  let refreshed: Promise<RefreshAnswer> = Promise.resolve(PUBLISHED as RefreshAnswer)
  const status: McpStatus = {
    'read-endpoint': body => {
      calls.push(`read ${body.name}`)
      return Promise.resolve(reads.length > 1 ? reads.shift()! : reads[0]!)
    },
    'refresh-endpoint': body => {
      calls.push(`refresh ${body.name}`)
      return refreshed
    },
  }
  return {
    status,
    calls,
    refreshWith(answer: Promise<RefreshAnswer>) {
      refreshed = answer
    },
  }
}

type Observe = NonNullable<McpStatus['observe']>['observe-endpoints']
type Frame = Awaited<ReturnType<ReturnType<Observe>['next']>>

/** Adds `observe-endpoints` to a fake: each opening is one stream, fed by the test. */
export function observed(status: McpStatus) {
  const streams: ((next: Frame) => void)[] = []
  const queued: Frame[][] = []
  const opens: Readonly<{ tenant: unknown; signal: AbortSignal | undefined }>[] = []
  const observe: Observe = (open, options) => {
    const index = streams.length
    opens.push({ tenant: open.tenant, signal: options.signal })
    const waiting: Frame[] = []
    queued.push(waiting)
    let wake: (() => void) | undefined
    streams.push(next => {
      waiting.push(next)
      wake?.()
    })
    options.signal?.addEventListener('abort', () => {
      waiting.push({ done: true, value: { kind: 'aborted' } })
      wake?.()
    })
    return (async function* () {
      for (;;) {
        const next = queued[index]!.shift()
        if (next === undefined) {
          await new Promise<void>(resolve => (wake = resolve))
          continue
        }
        if (next.done === true) return next.value
        yield next.value
      }
    })()
  }
  return {
    status: { ...status, observe: { 'observe-endpoints': observe } } satisfies McpStatus,
    opened: () => streams.length,
    opens,
    frame: (about: 'endpoints' | 'events' = 'endpoints') =>
      streams.at(-1)!({ done: false, value: { kind: 'changed', about } }),
    end: (value: Extract<Frame, { done: true }>['value']) => streams.at(-1)!({ done: true, value }),
  }
}
