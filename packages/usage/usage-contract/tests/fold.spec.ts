import { describe, expect, it } from 'vitest'
import {
  checkUsageQuery,
  fold,
  TOKEN_KINDS,
  type UsageBucket,
  type UsageDimension,
  type UsageFact,
  type UsageMeasures,
  type UsageQuery,
} from '@omne-harness/usage-contract'
import { hundredths, picker, randomFact } from './support/facts.ts'

// Five days around the spring change in New York, so day and hour buckets cross it.
const FROM = Date.parse('2026-03-06T00:00:00.000Z')
const TO = Date.parse('2026-03-11T00:00:00.000Z')
const ZONES = ['America/New_York', 'Europe/Berlin', 'UTC'] as const
const BUCKETS: readonly UsageBucket[] = ['none', 'hour', 'day', 'week', 'month']
const GROUPS: readonly (readonly UsageDimension[])[] = [
  [],
  ['source'],
  ['model', 'tool'],
  ['purpose', 'provider'],
]
const CASES = 300

function checked(zone: string, bucket: UsageBucket, groupBy: readonly UsageDimension[]) {
  const query: UsageQuery = {
    scope: { kind: 'tenant' },
    range: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() },
    zone,
    bucket,
    groupBy,
  }
  const answer = checkUsageQuery(query, { buckets: 1000 })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

function scenario(seed: number) {
  const pick = picker(seed)
  const query = checked(pick.one(ZONES), pick.one(BUCKETS), pick.one(GROUPS))
  const facts = Array.from({ length: pick.int(0, 60) }, (_, at) => randomFact(pick, at, FROM, TO))
  const inRange = facts.filter(
    fact => fact.at !== null && Date.parse(fact.at) >= FROM && Date.parse(fact.at) < TO,
  )
  return {
    query,
    facts,
    inRange,
    result: fold(facts, query, { sources: ['model', 'tool'], undated: 0 }),
  }
}

/** Every additive number of the measures under a name: sums as hundredths, counts as they are. */
function additive(measures: UsageMeasures): Map<string, bigint> {
  const out = new Map<string, bigint>()
  const put = (name: string, value: bigint | number) =>
    out.set(name, (out.get(name) ?? 0n) + BigInt(value))
  for (const name of ['calls', 'units', 'retried', 'interrupted'] as const)
    put(name, measures[name])
  for (const item of measures.failed) put(`failed:${String(item.cause)}`, item.count)
  for (const kind of TOKEN_KINDS) {
    const sum = measures.tokens[kind]
    put(`${kind}:known`, hundredths(sum.known))
    put(`${kind}:unknown`, sum.unknown)
    put(`${kind}:provisional`, sum.provisional)
  }
  for (const cost of measures.cost.sums) put(`cost:${cost.unit}:known`, hundredths(cost.known))
  put('cost:unknown', measures.cost.unknown)
  put('duration:known', hundredths(measures.duration.total.known))
  put('duration:unknown', measures.duration.total.unknown)
  return out
}

function summed(parts: readonly UsageMeasures[]): Map<string, bigint> {
  const out = new Map<string, bigint>()
  for (const part of parts)
    for (const [name, value] of additive(part)) out.set(name, (out.get(name) ?? 0n) + value)
  return out
}

const nonZero = (map: Map<string, bigint>) => new Map([...map].filter(([, value]) => value !== 0n))

describe('folding usage facts, for seeded random facts (C19)', () => {
  it('counts every fact in the range exactly once: one bucket, one group, none outside the range', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { query, inRange, result } = scenario(seed)
      expect(result.total.units, `seed ${seed}`).toBe(inRange.length)
      expect(
        result.buckets.reduce((sum, bucket) => sum + bucket.total.units, 0),
        `seed ${seed}`,
      ).toBe(inRange.length)
      if (query.groupBy.length > 0) {
        expect(
          result.groups.reduce((sum, cell) => sum + cell.measures.units, 0),
          `seed ${seed}`,
        ).toBe(inRange.length)
        for (const bucket of result.buckets)
          expect(
            bucket.groups.reduce((sum, cell) => sum + cell.measures.units, 0),
            `seed ${seed}`,
          ).toBe(bucket.total.units)
      } else expect(result.groups).toEqual([])
      const earliest = inRange.reduce(
        (low, fact) => Math.min(low, Date.parse(fact.at ?? '')),
        Infinity,
      )
      expect(result.coverage.earliest, `seed ${seed}`).toBe(
        earliest === Infinity ? null : new Date(earliest).toISOString(),
      )
    }
  })

  it('keeps unknown and provisional amounts out of the known sum and counts them apart', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inRange, result } = scenario(seed)
      for (const kind of TOKEN_KINDS) {
        const items = inRange.flatMap(fact => fact.usage.filter(item => item.name === kind))
        const known = items.reduce(
          (sum, item) => sum + (item.state === 'known' ? hundredths(item.lexeme) : 0n),
          0n,
        )
        expect(hundredths(result.total.tokens[kind].known), `seed ${seed} ${kind}`).toBe(known)
        expect(result.total.tokens[kind].unknown, `seed ${seed} ${kind}`).toBe(
          items.filter(item => item.state === 'unknown').length,
        )
        expect(result.total.tokens[kind].provisional, `seed ${seed} ${kind}`).toBe(
          items.filter(item => item.state === 'provisional').length,
        )
      }
    }
  })

  it('keeps costs of different units apart, never adds them, and counts the unknown apart', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inRange, result } = scenario(seed)
      const known = inRange.flatMap(fact => (fact.cost?.state === 'known' ? [fact.cost] : []))
      const units = [...new Set(known.map(cost => cost.unit))].sort()
      expect(
        result.total.cost.sums.map(cost => cost.unit),
        `seed ${seed}`,
      ).toEqual(units)
      for (const entry of result.total.cost.sums)
        expect(hundredths(entry.known), `seed ${seed} ${entry.unit}`).toBe(
          known
            .filter(cost => cost.unit === entry.unit)
            .reduce((sum, cost) => sum + hundredths(cost.lexeme), 0n),
        )
      const unknown = inRange.filter(fact => fact.cost?.state === 'unknown').length
      expect(result.total.cost.unknown, `seed ${seed}`).toBe(unknown)
      expect(result.coverage.costUnknown, `seed ${seed}`).toBe(unknown)
    }
  })

  it('counts the first unit of a call as the call and the later ones as its retries', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inRange, result } = scenario(seed)
      const calls = new Set(inRange.map(fact => `${fact.subject.kind}:${fact.subject.id}`)).size
      expect(result.total.calls, `seed ${seed}`).toBe(calls)
      expect(result.total.retried, `seed ${seed}`).toBe(inRange.length - calls)
    }
  })

  it('makes the parts of any split add up to the whole, across the daylight-saving change', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { query, result } = scenario(seed)
      const whole = nonZero(additive(result.total))
      expect(
        nonZero(summed(result.buckets.map(bucket => bucket.total))),
        `seed ${seed} buckets`,
      ).toEqual(whole)
      if (query.groupBy.length > 0)
        expect(
          nonZero(summed(result.groups.map(cell => cell.measures))),
          `seed ${seed} groups`,
        ).toEqual(whole)
    }
  })

  it('computes each ratio from the sums, not from the ratios of the parts', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { inRange, result } = scenario(seed)
      const known = (fact: UsageFact, name: string) => {
        const item = fact.usage.find(entry => entry.name === name)
        return item?.state === 'known' ? Number(item.lexeme) : null
      }
      let part = 0
      let whole = 0
      let excluded = 0
      for (const fact of inRange) {
        const three = ['input', 'cache-read', 'cache-write'].map(name => known(fact, name))
        if (!fact.usage.some(item => ['input', 'cache-read', 'cache-write'].includes(item.name)))
          continue
        if (three.some(value => value === null)) excluded += 1
        else {
          part += three[1] ?? 0
          whole += three.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        }
      }
      expect(result.coverage.excluded.cacheHit, `seed ${seed}`).toBe(excluded)
      const rate = result.total.rates.cacheHit
      if (whole === 0) expect(rate, `seed ${seed}`).toEqual({ kind: 'unknown' })
      else expect(rate.kind === 'known' && rate.value, `seed ${seed}`).toBeCloseTo(part / whole, 12)
      const units = result.total.units
      expect(result.total.rates.retry).toEqual(
        units === 0 ? { kind: 'unknown' } : { kind: 'known', value: result.total.retried / units },
      )
    }
  })
})

describe('folding, on cases written out', () => {
  const at = (hour: number) => new Date(FROM + hour * 3_600_000).toISOString()
  const base = randomFact(picker(7), 0, FROM, TO)
  const fact = (changes: Partial<UsageFact>): UsageFact => ({
    ...base,
    usage: [],
    cost: null,
    outcome: 'completed',
    cause: null,
    ...changes,
  })

  it('gives the hit rate of the total from the sums when the buckets weigh differently', () => {
    const query = checked('UTC', 'day', [])
    const tokens = (input: string, read: string) => [
      { name: 'input', state: 'known' as const, lexeme: input, unit: 'token' },
      { name: 'cache-read', state: 'known' as const, lexeme: read, unit: 'token' },
      { name: 'cache-write', state: 'known' as const, lexeme: '0', unit: 'token' },
    ]
    const result = fold(
      [
        fact({ at: at(1), usage: tokens('0', '10') }),
        fact({ at: at(30), usage: tokens('90', '0') }),
      ],
      query,
      { sources: [], undated: 0 },
    )
    expect(result.buckets.slice(0, 2).map(bucket => bucket.total.rates.cacheHit)).toEqual([
      { kind: 'known', value: 1 },
      { kind: 'known', value: 0 },
    ])
    expect(result.total.rates.cacheHit).toEqual({ kind: 'known', value: 0.1 })
  })

  it('does not count a fact at the end of the range or with no instant, and says what the sources said', () => {
    const query = checked('UTC', 'none', [])
    const result = fold(
      [fact({ at: new Date(TO).toISOString() }), fact({ at: null }), fact({ at: at(2) })],
      query,
      { sources: ['model'], undated: 4 },
    )
    expect(result.total.units).toBe(1)
    expect(result.coverage).toMatchObject({ sources: ['model'], undated: 4, earliest: at(2) })
  })

  it('takes the earliest unit of a call as the call, the bucket and group it falls in, and the lower unit on a tie', () => {
    const call = { kind: 'model_call' as const, id: 'c-1' }
    const labels = (model: string) => ({ ...base.labels, model })
    const result = fold(
      [
        fact({ at: at(30), subject: call, unit: 'u-1', labels: labels('m-b') }),
        fact({ at: at(1), subject: call, unit: 'u-3', labels: labels('m-a') }),
      ],
      checked('UTC', 'day', ['model']),
      { sources: [], undated: 0 },
    )
    expect(result.buckets.slice(0, 2).map(b => [b.total.calls, b.total.retried])).toEqual([
      [1, 0],
      [0, 1],
    ])
    const tie = fold(
      [
        fact({ at: at(2), subject: call, unit: 'u-2', labels: labels('m-b') }),
        fact({ at: at(2), subject: call, unit: 'u-1', labels: labels('m-a') }),
      ],
      checked('UTC', 'none', ['model']),
      { sources: [], undated: 0 },
    )
    expect(tie.groups.map(cell => [cell.key, cell.measures.calls, cell.measures.retried])).toEqual([
      [['m-a'], 1, 0],
      [['m-b'], 0, 1],
    ])
  })

  it('picks the same call whatever order the units come in', () => {
    const call = { kind: 'model_call' as const, id: 'c-2' }
    const labels = (model: string) => ({ ...base.labels, model })
    const callsOf = (units: readonly UsageFact[]) =>
      fold(units, checked('UTC', 'none', ['model']), { sources: [], undated: 0 }).groups.map(
        cell => [cell.key[0], cell.measures.calls],
      )
    const early = fact({ at: at(1), subject: call, unit: 'u-2', labels: labels('m-early') })
    const late = fact({ at: at(30), subject: call, unit: 'u-1', labels: labels('m-late') })
    expect(callsOf([early, late])).toEqual([
      ['m-early', 1],
      ['m-late', 0],
    ])
    expect(callsOf([late, early])).toEqual(callsOf([early, late]))
    const first = fact({ at: at(2), subject: call, unit: 'u-1', labels: labels('m-first') })
    const second = fact({ at: at(2), subject: call, unit: 'u-2', labels: labels('m-second') })
    expect(callsOf([first, second])).toEqual([
      ['m-first', 1],
      ['m-second', 0],
    ])
    expect(callsOf([second, first])).toEqual(callsOf([first, second]))
  })

  it('puts a fact at the start of a bucket into that bucket', () => {
    const result = fold([fact({ at: at(24) }), fact({ at: at(48) })], checked('UTC', 'day', []), {
      sources: [],
      undated: 0,
    })
    expect(result.buckets.map(bucket => bucket.total.units)).toEqual([0, 1, 1, 0, 0])
    expect(result.buckets.slice(0, 2).map(bucket => [bucket.start, bucket.end])).toEqual([
      [at(0), at(24)],
      [at(24), at(48)],
    ])
  })

  it('counts a retried unit as a unit but not as another call, and failures by cause', () => {
    const call = (id: string) => ({ kind: 'model_call' as const, id })
    const result = fold(
      [
        fact({ at: at(1), subject: call('c-1'), unit: 'u-2' }),
        fact({ at: at(1), subject: call('c-1'), unit: 'u-1', outcome: 'failed', cause: 'network' }),
        fact({ at: at(2), subject: call('c-2'), unit: 'u-3', outcome: 'failed', cause: null }),
        fact({ at: at(3), subject: call('c-3'), unit: 'u-4', outcome: 'interrupted' }),
      ],
      checked('UTC', 'none', []),
      { sources: [], undated: 0 },
    )
    expect(result.total).toMatchObject({ calls: 3, units: 4, retried: 1, interrupted: 1 })
    expect(result.total.failed).toEqual([
      { cause: null, count: 1 },
      { cause: 'network', count: 1 },
    ])
    expect(result.total.rates.failure).toEqual({ kind: 'known', value: 0.5 })
  })
})

describe('the measures that the random facts do not pin down', () => {
  const at = (hour: number) => new Date(FROM + hour * 3_600_000).toISOString()
  const base = randomFact(picker(11), 0, FROM, TO)
  const fact = (changes: Partial<UsageFact>): UsageFact => ({
    ...base,
    usage: [],
    cost: null,
    outcome: 'completed',
    cause: null,
    durations: { toResponse: null, toFirstContent: null, total: null, generation: null },
    ...changes,
  })
  const ms = (changes: Partial<UsageFact['durations']>) => ({
    toResponse: null,
    toFirstContent: null,
    total: null,
    generation: null,
    ...changes,
  })
  const once = (facts: readonly UsageFact[], groupBy: readonly UsageDimension[] = []) =>
    fold(facts, checked('UTC', 'none', groupBy), { sources: [], undated: 0 })

  it('takes the median and the ninetieth percentile from the units, and sums the whole times', () => {
    const facts = [100, 30, 70, 10, 90, 50, 20, 80, 40, 60].map((value, index) =>
      fact({ at: at(index), durations: ms({ toFirstContent: value, total: value * 2 }) }),
    )
    const { duration } = once([...facts, fact({ at: at(11) })]).total
    expect(duration.toFirstContent).toEqual({ count: 10, p50: 50, p90: 90 })
    expect(duration.whole).toEqual({ count: 10, p50: 100, p90: 180 })
    expect(duration.total).toEqual({ known: '1100', unknown: 1, provisional: 0 })
    expect(once([]).total.duration.toFirstContent).toEqual({ count: 0, p50: null, p90: null })
    expect(
      once([fact({ at: at(1), durations: ms({ toFirstContent: 7 }) })]).total.duration
        .toFirstContent,
    ).toEqual({ count: 1, p50: 7, p90: 7 })
  })

  it('takes the reasoning share and the output speed from the sums of the units that have both', () => {
    const token = (name: string, lexeme: string | null) =>
      lexeme === null
        ? { name, state: 'unknown' as const, unit: 'token' }
        : { name, state: 'known' as const, lexeme, unit: 'token' }
    const result = once([
      fact({
        at: at(1),
        usage: [token('output', '100'), token('reasoning', '20')],
        durations: ms({ generation: 2000 }),
      }),
      fact({ at: at(2), usage: [token('output', '50')], durations: ms({ generation: 1000 }) }),
      fact({
        at: at(3),
        usage: [token('output', null), token('reasoning', '5')],
        durations: ms({ generation: 500 }),
      }),
      fact({ at: at(4), usage: [token('output', '10')] }),
      fact({ at: at(5), usage: [token('input', '10')] }),
    ])
    expect(result.total.rates.reasoningShare).toEqual({ kind: 'known', value: 0.2 })
    expect(result.total.rates.outputPerSecond).toEqual({ kind: 'known', value: 50 })
    expect(result.coverage.excluded).toEqual({ cacheHit: 1, reasoningShare: 3, outputPerSecond: 2 })
  })

  it('keys each group by the dimensions in their order, nothing first, and sorts the groups', () => {
    const facts = [
      fact({
        at: at(1),
        source: 'tool',
        labels: { ...base.labels, model: null, tool: 'Shell', provider: 'p' },
      }),
      fact({
        at: at(2),
        source: 'model',
        labels: { ...base.labels, model: 'm-b', tool: null, provider: null },
      }),
      fact({
        at: at(3),
        source: 'model',
        labels: { ...base.labels, model: 'm-a', tool: null, provider: null },
      }),
      fact({
        at: at(4),
        source: 'model',
        labels: { ...base.labels, model: 'm-a', tool: null, provider: null },
      }),
    ]
    expect(
      once(facts, ['model', 'tool']).groups.map(cell => [cell.key, cell.measures.units]),
    ).toEqual([
      [[null, 'Shell'], 1],
      [['m-a', null], 2],
      [['m-b', null], 1],
    ])
    const sameModel = [
      fact({ at: at(1), labels: { ...base.labels, model: 'm-a', tool: 'Shell' } }),
      fact({ at: at(2), labels: { ...base.labels, model: 'm-a', tool: 'Files' } }),
    ]
    expect(once(sameModel, ['model', 'tool']).groups.map(cell => cell.key)).toEqual([
      ['m-a', 'Files'],
      ['m-a', 'Shell'],
    ])
    expect(once(facts, ['source', 'provider']).groups.map(cell => cell.key)).toEqual([
      ['model', null],
      ['tool', 'p'],
    ])
    const purposes = [
      fact({ at: at(1), consumer: { ...base.consumer, purpose: 'compaction' } }),
      fact({ at: at(2), consumer: { ...base.consumer, purpose: 'main' } }),
    ]
    expect(once(purposes, ['purpose']).groups.map(cell => cell.key)).toEqual([
      ['compaction'],
      ['main'],
    ])
  })

  it('counts a fact at the start of the range and none before it', () => {
    const result = once([
      fact({ at: new Date(FROM).toISOString() }),
      fact({ at: new Date(FROM - 1).toISOString() }),
    ])
    expect(result.total.units).toBe(1)
  })
})
