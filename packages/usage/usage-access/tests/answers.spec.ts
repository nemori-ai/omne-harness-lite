import { describe, expect, it } from 'vitest'
import type { JsonLimits } from '@omne-harness/json-text'
import { checkUsageQuery, fold, type UsageFact } from '@omne-harness/usage-contract'
import { usageProtocol } from '@omne-harness/usage-protocol'
import { encodeInstant } from '@omne-harness/utc-instant'
import { BODIES, createWorld, LOGIN } from './fixtures/world.ts'

const limits: JsonLimits = {
  maxBytes: 4_000_000,
  maxDepth: 64,
  maxItems: 100_000,
  maxMembers: 1_000,
  maxStringLength: 100_000,
  maxNumberLength: 100,
}
const call = { principal: LOGIN, messageId: 'm-1', signal: new AbortController().signal }
const known = (name: string, lexeme: string) => ({
  name,
  state: 'known' as const,
  lexeme,
  unit: 'token',
})
const fact = (unit: string, at: string | null): UsageFact => ({
  source: 'model',
  subject: { kind: 'model_call', id: `c-${unit}` },
  unit,
  at,
  consumer: { owner: '@omne-harness/agent', work: 'exec-1', position: '1', purpose: 'main' },
  labels: { model: 'm-a', provider: 'p-a', profile: null, tool: null },
  outcome: 'completed',
  cause: null,
  usage: [
    known('input', '1000'),
    known('cache-read', '500'),
    known('cache-write', '0'),
    known('output', '30'),
  ],
  cost: { state: 'known', lexeme: '0.01', unit: 'USD' },
  durations: { toResponse: 120, toFirstContent: 310, total: 900, generation: 600 },
  connectRetries: 0,
  window: { tokens: '200000', compactAtPercent: '80' },
  accounted: true,
})
const facts = [fact('u1', '2026-11-19T10:00:00.120Z'), fact('u2', null)]
const range = { from: '2026-11-19T00:00:00.000Z', to: '2026-11-20T00:00:00.000Z' }

async function answered(name: keyof typeof usageProtocol.operations, reply: unknown) {
  const world = createWorld()
  world.state.reply = { ok: reply }
  const answer = (await world.contribution.operations[name](call, BODIES[name] as never)) as {
    outcome: string
    body: unknown
  }
  expect(answer.outcome).toBe('succeeded')
  const written = usageProtocol.operations[name].outcomes.succeeded.write(
    answer.body as never,
    limits,
  )
  expect(written.ok).toBe(true)
  return answer.body as Record<string, unknown>
}

describe('what a succeeded read carries', () => {
  it('a folded result in the protocol shape: ratios as decimal text, instants as instants', async () => {
    const checked = checkUsageQuery(
      { scope: { kind: 'tenant' }, range, zone: 'UTC', bucket: 'day', groupBy: ['model'] },
      { buckets: 10 },
    )
    if (!('ok' in checked)) throw new Error('fixture query')
    const result = fold(facts, checked.ok, { sources: ['model'], undated: 1 })
    const body = (await answered('query-usage', result)) as {
      total: { rates: { cacheHit: unknown }; duration: { toFirstContent: unknown } }
      buckets: { start: unknown }[]
    }
    expect(body.total.rates.cacheHit).toEqual({ kind: 'known', value: String(500 / 1500) })
    expect(body.total.duration.toFirstContent).toEqual({ count: 1, p50: 310, p90: 310 })
    expect(body.buckets.map(bucket => encodeInstant(bucket.start as never))).toEqual([range.from])
  })

  it('a page of facts with the dated instant', async () => {
    const body = (await answered('list-usage-records', { entries: facts, next: 'ur1.x' })) as {
      entries: { at: unknown; durations: unknown }[]
      next: unknown
    }
    expect(
      body.entries.map(entry => (entry.at === null ? null : encodeInstant(entry.at as never))),
    ).toEqual(['2026-11-19T10:00:00.120Z', null])
    expect(body.entries[0]?.durations).toEqual(facts[0]?.durations)
    expect(body.next).toBe('ur1.x')
  })

  it('the occupancy as it is, with the moment of the dispatch as an instant', async () => {
    const known = {
      kind: 'known',
      used: '1500',
      window: '200000',
      percent: '0.75',
      compactAtPercent: '80',
      asOf: { at: '2026-11-19T10:00:00.120Z', model: 'm-a' },
    }
    const body = await answered('read-context-occupancy', known)
    expect({
      ...body,
      asOf: { ...(body.asOf as object), at: encodeInstant((body.asOf as { at: never }).at) },
    }).toEqual(known)
    for (const other of [{ kind: 'none-yet' }, { kind: 'unknown', reason: 'window-unknown' }])
      expect(await answered('read-context-occupancy', other)).toEqual(other)
  })

  it('an instant the service cannot have written answers basis-unavailable', async () => {
    const world = createWorld()
    world.state.reply = { ok: { entries: [fact('u3', 'not an instant')], next: null } }
    expect(
      await world.contribution.operations['list-usage-records'](
        call,
        BODIES['list-usage-records'] as never,
      ),
    ).toEqual({
      outcome: 'basis-unavailable',
    })
  })
})
