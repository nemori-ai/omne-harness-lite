import { describe, expect, it } from 'vitest'
import type {
  UsageConsumer,
  UsageFact,
  UsagePortFailure,
  UsageQuery,
  UsageSessionScope,
  UsageSource,
} from '@omne-harness/usage-contract'
import { createUsage, createUsageSources, type UsageLimits } from '@omne-harness/usage'

const tenant = { organization: { text: 'org' }, account: { text: 'acc' } } as never
const principal = { subject: 'someone' }
const FROM = '2026-11-19T00:00:00.000Z'
const TO = '2026-11-20T00:00:00.000Z'
const LIMITS: UsageLimits = { page: 100, pages: 50, buckets: 100 }

function fact(source: string, unit: string, at: string | null, work = 'exec-1'): UsageFact {
  return {
    source,
    subject: { kind: source === 'tool' ? 'tool_execution' : 'model_call', id: unit },
    unit,
    at,
    consumer: { owner: 'agent', work, position: 'p', purpose: 'main' },
    labels: { model: null, provider: null, profile: null, tool: null },
    outcome: 'completed',
    cause: null,
    usage: [],
    cost: null,
    durations: { toResponse: null, toFirstContent: null, total: null, generation: null },
    connectRetries: 0,
    window: null,
  }
}

const hour = (h: number) => new Date(Date.parse(FROM) + h * 3_600_000).toISOString()
const inScope = (item: UsageFact, consumer: UsageConsumer | null) =>
  consumer === null ||
  (item.consumer.owner === consumer.owner &&
    consumer.works.some(
      work => item.consumer.work === work || item.consumer.work.startsWith(`${work}/`),
    ))

/** A source over these facts that pages by position and records what it was asked. */
function source(
  name: string,
  facts: readonly UsageFact[],
  options: Readonly<{
    limits?: UsageSource<unknown>['limits']
    fails?: UsagePortFailure | 'throw'
  }> = {},
) {
  const asked: Parameters<UsageSource<unknown>['list']>[0][] = []
  const self: UsageSource<unknown> = {
    name,
    limits: options.limits ?? { page: 100, works: 100 },
    async list(input) {
      asked.push(input)
      if (options.fails === 'throw') throw new Error('down')
      if (options.fails !== undefined) return { failure: options.fails }
      const scoped = facts.filter(item => inScope(item, input.consumer))
      const dated = scoped
        .filter(
          item => item.at !== null && item.at >= input.range.from && item.at <= input.range.to,
        )
        .sort((a, b) => ((a.at ?? '') < (b.at ?? '') ? -1 : 1))
      const start = input.after === null ? 0 : Number(input.after)
      const entries = dated.slice(start, start + input.limit)
      const next = start + input.limit < dated.length ? String(start + input.limit) : null
      return { ok: { entries, undated: scoped.filter(item => item.at === null).length, next } }
    },
  }
  return { self, asked }
}

function scopeOf(answer: Awaited<ReturnType<UsageSessionScope<unknown>['resolve']>> | 'throw') {
  const asked: unknown[] = []
  const scope: UsageSessionScope<unknown> = {
    async resolve(input) {
      asked.push(input)
      if (answer === 'throw') throw new Error('down')
      return answer
    },
  }
  return { scope, asked }
}

const query = (changes: Partial<UsageQuery> = {}) => ({
  principal,
  tenant,
  scope: { kind: 'tenant' as const },
  range: { from: FROM, to: TO },
  zone: 'UTC',
  bucket: 'hour' as const,
  groupBy: [],
  ...changes,
})

function usageOver(
  sources: readonly UsageSource<unknown>[],
  scope?: UsageSessionScope<unknown>,
  limits: UsageLimits = LIMITS,
) {
  return createUsage<unknown>({ sources: () => sources, sessionScope: () => scope, limits })
}

describe('a usage query over the registered sources (C22)', () => {
  it('reads every source for the range with both ends, folds them together, and says who answered', async () => {
    const model = source('model', [
      fact('model', 'm1', hour(1)),
      fact('model', 'm2', null),
      fact('model', 'm3', TO),
    ])
    const tool = source('tool', [fact('tool', 't1', hour(2)), fact('tool', 't2', hour(30))])
    const answer = await usageOver([tool.self, model.self]).query(query())
    if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
    expect(answer.ok.total.units).toBe(2)
    expect(answer.ok.coverage).toMatchObject({ sources: ['model', 'tool'], undated: 1 })
    expect(model.asked[0]).toMatchObject({
      principal,
      tenant,
      range: { from: FROM, to: TO },
      consumer: null,
    })
  })

  it('answers unavailable naming the source that cannot answer, and gives no total', async () => {
    const good = source('model', [fact('model', 'm1', hour(1))])
    for (const [fails, failure] of [
      [
        { kind: 'unavailable', diagnostic: 'disk' },
        { kind: 'unavailable', dependency: { kind: 'source', name: 'tool' }, diagnostic: 'disk' },
      ],
      [{ kind: 'denied' }, { kind: 'denied', dependency: { kind: 'source', name: 'tool' } }],
      [
        'throw',
        {
          kind: 'unavailable',
          dependency: { kind: 'source', name: 'tool' },
          diagnostic: 'the source threw',
        },
      ],
    ] as const) {
      const broken = source('tool', [], { fails })
      expect(
        await usageOver([good.self, broken.self]).query(query()),
        JSON.stringify(fails),
      ).toEqual({ failure })
    }
  })

  it('answers an empty result naming no source when none is registered', async () => {
    const answer = await usageOver([]).query(query())
    expect(answer).toMatchObject({
      ok: { total: { units: 0 }, coverage: { sources: [], undated: 0 } },
    })
  })

  it('does not count or name a source that was withdrawn', async () => {
    const registry = createUsageSources<unknown>()
    const model = source('model', [fact('model', 'm1', hour(1))])
    const tool = source('tool', [fact('tool', 't1', hour(1))])
    registry.register(model.self)
    const registration = registry.register(tool.self)
    if (registration.kind !== 'registered') throw new Error('registration')
    registration.withdraw()
    const usage = createUsage<unknown>({
      sources: () => registry.current(),
      sessionScope: () => undefined,
      limits: LIMITS,
    })
    expect(await usage.query(query())).toMatchObject({
      ok: { total: { units: 1 }, coverage: { sources: ['model'] } },
    })
    expect(tool.asked).toEqual([])
  })

  it('reads page by page within the smaller page size and splits the works within the source limit', async () => {
    const works = ['exec-1', 'exec-2', 'exec-3', 'exec-4', 'exec-5']
    const facts = works.flatMap((work, at) => [
      fact('model', `${work}-a`, hour(at), work),
      fact('model', `${work}-b`, hour(at + 1), `${work}/step`),
      fact('model', `${work}-u`, null, work),
    ])
    const model = source('model', facts, { limits: { page: 3, works: 2 } })
    const scope = scopeOf({ ok: { kind: 'found', consumers: [{ owner: 'agent', works }] } })
    const answer = await usageOver([model.self], scope.scope, {
      page: 10,
      pages: 50,
      buckets: 100,
    }).query(query({ scope: { kind: 'session', session: 's-1' } }))
    expect(answer).toMatchObject({ ok: { total: { units: 10 }, coverage: { undated: 5 } } })
    expect(model.asked.map(item => [item.consumer?.works, item.after, item.limit])).toEqual([
      [['exec-1', 'exec-2'], null, 3],
      [['exec-1', 'exec-2'], '3', 3],
      [['exec-3', 'exec-4'], null, 3],
      [['exec-3', 'exec-4'], '3', 3],
      [['exec-5'], null, 3],
    ])
    expect(scope.asked).toEqual([{ principal, tenant, session: 's-1' }])
  })

  it('reads each consumer scope of a session, owner by owner, and counts what falls under any of them', async () => {
    const facts = [
      fact('model', 'main', hour(1), 'exec-1/step-1'),
      {
        ...fact('model', 'summary', hour(2), '{"task":"compaction/k"}'),
        consumer: {
          owner: 'compactor',
          work: '{"task":"compaction/k"}',
          position: '1',
          purpose: 'summary',
        },
      },
      fact('model', 'other', hour(3), 'exec-9'),
    ]
    const model = source('model', facts)
    const scope = scopeOf({
      ok: {
        kind: 'found',
        consumers: [
          { owner: 'agent', works: ['exec-1'] },
          { owner: 'compactor', works: ['{"task":"compaction/k"}'] },
        ],
      },
    })
    expect(
      await usageOver([model.self], scope.scope).query(
        query({ scope: { kind: 'session', session: 's-1' } }),
      ),
    ).toMatchObject({ ok: { total: { units: 2 } } })
    expect(model.asked.map(item => item.consumer?.owner)).toEqual(['agent', 'compactor'])
  })

  it('makes no empty batch when the works fill the last one exactly', async () => {
    const model = source('model', [fact('model', 'm1', hour(1), 'exec-1')], {
      limits: { page: 10, works: 2 },
    })
    const works = ['exec-1', 'exec-2', 'exec-3', 'exec-4']
    const scope = scopeOf({ ok: { kind: 'found', consumers: [{ owner: 'agent', works }] } })
    await usageOver([model.self], scope.scope).query(
      query({ scope: { kind: 'session', session: 's-1' } }),
    )
    expect(model.asked.map(item => item.consumer?.works)).toEqual([
      ['exec-1', 'exec-2'],
      ['exec-3', 'exec-4'],
    ])
  })

  it('answers too-large when a query needs more pages than the limit, and reads exactly the limit otherwise', async () => {
    const facts = [1, 2, 3, 4].map(h => fact('model', `m${h}`, hour(h)))
    const model = source('model', facts, { limits: { page: 1, works: 10 } })
    expect(
      await usageOver([model.self], undefined, { page: 1, pages: 3, buckets: 100 }).query(query()),
    ).toEqual({
      failure: { kind: 'too-large', limit: 'pages' },
    })
    expect(
      await usageOver([model.self], undefined, { page: 1, pages: 4, buckets: 100 }).query(query()),
    ).toMatchObject({
      ok: { total: { units: 4 } },
    })
  })
})

describe('a usage query of a session', () => {
  const session = query({ scope: { kind: 'session', session: 's-1' } })
  const scoped = { kind: 'session-scope' } as const

  it('answers as the session scope does when it is missing, refuses, cannot answer, or throws', async () => {
    const model = source('model', [fact('model', 'm1', hour(1))])
    expect(await usageOver([model.self]).query(session)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: scoped,
        diagnostic: 'no session scope is registered',
      },
    })
    expect(
      await usageOver([model.self], scopeOf({ failure: { kind: 'denied' } }).scope).query(session),
    ).toEqual({
      failure: { kind: 'denied', dependency: scoped },
    })
    expect(
      await usageOver(
        [model.self],
        scopeOf({ failure: { kind: 'unavailable', diagnostic: 'log' } }).scope,
      ).query(session),
    ).toEqual({ failure: { kind: 'unavailable', dependency: scoped, diagnostic: 'log' } })
    expect(await usageOver([model.self], scopeOf('throw').scope).query(session)).toEqual({
      failure: { kind: 'unavailable', dependency: scoped, diagnostic: 'the session scope threw' },
    })
    expect(model.asked).toEqual([])
  })

  it('answers not-found for a session that is absent, as for one of another tenant', async () => {
    const model = source('model', [fact('model', 'm1', hour(1))])
    expect(
      await usageOver([model.self], scopeOf({ ok: { kind: 'absent' } }).scope).query(session),
    ).toEqual({
      failure: { kind: 'not-found', what: 'session' },
    })
    expect(model.asked).toEqual([])
  })

  it('reads no source for a session with no execution yet, and names the sources it would have read', async () => {
    const model = source('model', [fact('model', 'm1', hour(1))])
    const scope = scopeOf({ ok: { kind: 'found', consumers: [] } })
    expect(await usageOver([model.self], scope.scope).query(session)).toMatchObject({
      ok: { total: { units: 0 }, coverage: { sources: ['model'] } },
    })
    expect(model.asked).toEqual([])
  })
})

describe('a usage query refused before anything is read', () => {
  it('reads no source and asks no session scope for a query of the wrong shape or too many buckets', async () => {
    const model = source('model', [])
    const scope = scopeOf({ ok: { kind: 'absent' } })
    const usage = usageOver([model.self], scope.scope, { page: 10, pages: 10, buckets: 24 })
    expect(
      await usage.query(query({ zone: '+08:00', scope: { kind: 'session', session: 's' } })),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'zone' },
    })
    expect(await usage.query(query({ scope: { kind: 'organization' } }))).toEqual({
      failure: { kind: 'unsupported', field: 'scope' },
    })
    expect(await usage.query(query({ range: { from: FROM, to: hour(25) } }))).toEqual({
      failure: { kind: 'too-large', limit: 'buckets' },
    })
    expect(model.asked).toEqual([])
    expect(scope.asked).toEqual([])
  })

  it('will not start with a limit that is not a positive integer', () => {
    for (const limits of [
      { page: 0, pages: 1, buckets: 1 },
      { page: 1, pages: 1.5, buckets: 1 },
      { page: 1, pages: 1, buckets: -1 },
    ])
      expect(() => usageOver([], undefined, limits), JSON.stringify(limits)).toThrow(
        /^usage limit (page|pages|buckets) must be a positive integer$/,
      )
  })
})
