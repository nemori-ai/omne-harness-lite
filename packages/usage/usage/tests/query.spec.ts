import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant as composeTenant,
} from '@omne-harness/legal-identity'
import type {
  UsageConsumer,
  UsageFact,
  UsagePortFailure,
  UsageQuery,
  UsageSessionScope,
  UsageSource,
} from '@omne-harness/usage-contract'
import { createUsage, createUsageSources, type UsageLimits } from '@omne-harness/usage'

const SUFFIX = 'abcdefghjkmnpqrstvwxyz2345'
const parsed = <T>(read: { ok: true; value: T } | { ok: false }): T => {
  if (!read.ok) throw new Error('fixture identity did not parse')
  return read.value
}
const tenant = composeTenant(
  parsed(organizationCodec.parse(`org_${SUFFIX}`)),
  parsed(accountCodec.parse(`acc_${SUFFIX}`)),
)
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
    accounted: true,
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
          item =>
            item.at !== null &&
            (input.range === null || (item.at >= input.range.from && item.at <= input.range.to)),
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

describe('the records of a scope, page by page (C24)', () => {
  const records = (usage: ReturnType<typeof usageOver>, changes: Record<string, unknown> = {}) =>
    usage.records({
      principal,
      tenant,
      scope: { kind: 'tenant' },
      range: { from: FROM, to: TO },
      after: null,
      limit: 2,
      ...changes,
    } as never)

  it('reads source after source in name order, a page at a time, and ends with no next', async () => {
    const tool = source('tool', [
      fact('tool', 't1', hour(1)),
      fact('tool', 't2', hour(2)),
      fact('tool', 't3', TO),
    ])
    const model = source('model', [fact('model', 'm1', hour(3)), fact('model', 'm2', null)])
    const usage = usageOver([tool.self, model.self])
    const seen: string[] = []
    let after: string | null = null
    for (let page = 0; page < 5; page += 1) {
      const answer = await records(usage, { after })
      if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
      for (const item of answer.ok.entries) seen.push(item.unit)
      after = answer.ok.next
      if (after === null) break
    }
    expect(seen).toEqual(['m1', 't1', 't2'])
    expect(after).toBeNull()
  })

  it('refuses a page size past the limit, a cursor of another query or tenant, and answers a failing source by its name', async () => {
    const model = source('model', [
      fact('model', 'm1', hour(1)),
      fact('model', 'm2', hour(2)),
      fact('model', 'm3', hour(3)),
    ])
    const usage = usageOver([model.self])
    expect(await records(usage, { limit: 101 })).toEqual({
      failure: { kind: 'invalid', field: 'limit', reason: 'out-of-range' },
    })
    expect(await records(usage, { limit: 0 })).toEqual({
      failure: { kind: 'invalid', field: 'limit', reason: 'out-of-range' },
    })
    const first = await records(usage)
    if (!('ok' in first) || first.ok.next === null) throw new Error('a first page with more')
    const other = await records(usage, { after: first.ok.next, range: { from: FROM, to: hour(5) } })
    expect(other).toEqual({ failure: { kind: 'invalid', field: 'after', reason: 'cursor' } })
    const stranger = composeTenant(
      parsed(organizationCodec.parse(`org_z${SUFFIX.slice(1)}`)),
      parsed(accountCodec.parse(`acc_z${SUFFIX.slice(1)}`)),
    )
    expect(await records(usage, { after: first.ok.next, tenant: stranger })).toEqual({
      failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
    })
    for (const forged of [
      'nope',
      'ur1.bm90',
      `ur1.${Buffer.from(JSON.stringify(['x', 0, 0, null])).toString('base64url')}`,
    ])
      expect(await records(usage, { after: forged }), forged).toEqual({
        failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
      })
    const broken = source('model', [], { fails: { kind: 'unavailable', diagnostic: 'disk' } })
    expect(await records(usageOver([broken.self]))).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: { kind: 'source', name: 'model' },
        diagnostic: 'disk',
      },
    })
  })

  it('reads the sources in name order whatever order they are registered in', async () => {
    const named = ['tool', 'model', 'extra'].map(name => source(name, [fact(name, name, hour(1))]))
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]
    for (const order of orders) {
      const usage = usageOver(order.map(at => named[at]!.self))
      const seen: string[] = []
      let after: string | null = null
      do {
        const answer = await records(usage, { after })
        if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
        for (const item of answer.ok.entries) seen.push(item.unit)
        after = answer.ok.next
      } while (after !== null)
      expect(seen, JSON.stringify(order)).toEqual(['extra', 'model', 'tool'])
    }
  })

  it('follows the cursor of a source within its pages, asks at most its own page size, and takes the edges of the limit', async () => {
    const model = source(
      'model',
      [fact('model', 'm1', hour(1)), fact('model', 'm2', hour(2)), fact('model', 'm3', hour(3))],
      { limits: { page: 1, works: 100 } },
    )
    const usage = usageOver([model.self])
    const seen: string[] = []
    let after: string | null = null
    do {
      const answer = await records(usage, { after, limit: 2 })
      if (!('ok' in answer)) throw new Error(JSON.stringify(answer))
      for (const item of answer.ok.entries) seen.push(item.unit)
      after = answer.ok.next
    } while (after !== null)
    expect(seen).toEqual(['m1', 'm2', 'm3'])
    expect(model.asked.map(input => input.limit)).toEqual([1, 1, 1])
    for (const limit of [1, LIMITS.page])
      expect('ok' in (await records(usage, { limit }))).toBe(true)
    expect(await records(usage, { range: { from: TO, to: FROM } })).toEqual({
      failure: { kind: 'invalid', field: 'range', reason: 'order' },
    })
  })

  it('reads past pages that hold nothing before the end, and answers too-large past the page limit', async () => {
    const late = source('model', [
      fact('model', 'a', TO),
      fact('model', 'b', TO),
      fact('model', 'c', TO),
    ])
    const asked = (pages: number) =>
      records(usageOver([late.self], undefined, { ...LIMITS, pages }), { limit: 1 })
    // Three pages of the source, then the end of its one batch, then past the last source.
    expect(await asked(5)).toEqual({ ok: { entries: [], next: null } })
    expect(await asked(4)).toEqual({ failure: { kind: 'too-large', limit: 'pages' } })
    const late2 = source('model', [fact('model', 'a', TO), fact('model', 'b', hour(1))])
    expect(await records(usageOver([late2.self]), { limit: 1 })).toMatchObject({
      ok: { entries: [{ unit: 'b' }] },
    })
  })

  it('refuses a cursor whose prefix, source, batch or source cursor is not of its shape', async () => {
    const model = source('model', [fact('model', 'm1', hour(1)), fact('model', 'm2', hour(2))])
    const usage = usageOver([model.self])
    const first = await records(usage, { limit: 1 })
    if (!('ok' in first) || first.ok.next === null) throw new Error('a first page with more')
    const [fingerprint] = JSON.parse(
      Buffer.from(first.ok.next.slice(4), 'base64url').toString('utf8'),
    ) as [string]
    const sealed = (prefix: string, parts: unknown[]) =>
      `${prefix}${Buffer.from(JSON.stringify([fingerprint, ...parts])).toString('base64url')}`
    expect('ok' in (await records(usage, { after: sealed('ur1.', [0, 0, '1']) }))).toBe(true)
    for (const after of [
      sealed('ur2.', [0, 0, '1']),
      sealed('ur1.', [-1, 0, null]),
      sealed('ur1.', ['0', 0, null]),
      sealed('ur1.', [0, -1, null]),
      sealed('ur1.', [0, 0, 5]),
    ])
      expect(await records(usage, { after }), after).toEqual({
        failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
      })
  })

  it('keeps to the session scope and answers an absent session as not found', async () => {
    const model = source('model', [
      fact('model', 'mine', hour(1), 'exec-1'),
      fact('model', 'theirs', hour(1), 'exec-9'),
    ])
    const found = scopeOf({
      ok: { kind: 'found', consumers: [{ owner: 'agent', works: ['exec-1'] }] },
    })
    const answer = await records(usageOver([model.self], found.scope), {
      scope: { kind: 'session', session: 's-1' },
    })
    expect('ok' in answer && answer.ok.entries.map(item => item.unit)).toEqual(['mine'])
    const absent = scopeOf({ ok: { kind: 'absent' } })
    expect(
      await records(usageOver([model.self], absent.scope), {
        scope: { kind: 'session', session: 's-1' },
      }),
    ).toEqual({
      failure: { kind: 'not-found', what: 'session' },
    })
  })
})

describe('the context occupancy of a session (C23)', () => {
  it('answers a source that cannot answer by its name, and no occupancy', async () => {
    const found = scopeOf({
      ok: { kind: 'found', consumers: [{ owner: 'agent', works: ['exec-1'] }] },
    })
    const broken = source('model', [], { fails: { kind: 'denied' } })
    expect(
      await usageOver([broken.self], found.scope).occupancy({ principal, tenant, session: 's-1' }),
    ).toEqual({ failure: { kind: 'denied', dependency: { kind: 'source', name: 'model' } } })
  })

  it('reads every unit of the session scope without a range and answers by the rows of T9', async () => {
    const usageOf = (input: string) => [
      { name: 'input', state: 'known' as const, lexeme: input, unit: 'token' },
      { name: 'cache-read', state: 'known' as const, lexeme: '0', unit: 'token' },
      { name: 'cache-write', state: 'known' as const, lexeme: '0', unit: 'token' },
    ]
    const dispatch = {
      ...fact('model', 'm1', '2020-01-01T00:00:00.000Z', 'exec-1/step-1'),
      usage: usageOf('500'),
      window: { tokens: '1000', compactAtPercent: '80' },
    }
    const model = source('model', [dispatch])
    const found = scopeOf({
      ok: { kind: 'found', consumers: [{ owner: 'agent', works: ['exec-1'] }] },
    })
    expect(
      await usageOver([model.self], found.scope).occupancy({ principal, tenant, session: 's-1' }),
    ).toEqual({
      ok: {
        kind: 'known',
        used: '500',
        window: '1000',
        percent: '50.00',
        compactAtPercent: '80',
        asOf: { at: dispatch.at, model: null },
      },
    })
    expect(model.asked[0]).toMatchObject({
      range: null,
      consumer: { owner: 'agent', works: ['exec-1'] },
    })
    const absent = scopeOf({ ok: { kind: 'absent' } })
    expect(
      await usageOver([model.self], absent.scope).occupancy({ principal, tenant, session: 's-1' }),
    ).toEqual({
      failure: { kind: 'not-found', what: 'session' },
    })
    const empty = scopeOf({ ok: { kind: 'found', consumers: [] } })
    expect(
      await usageOver([model.self], empty.scope).occupancy({ principal, tenant, session: 's-1' }),
    ).toEqual({
      ok: { kind: 'none-yet' },
    })
  })
})
