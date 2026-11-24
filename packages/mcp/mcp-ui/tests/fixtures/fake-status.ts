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
