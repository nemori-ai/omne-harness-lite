import { describe, expect, it } from 'vitest'
import {
  cacheByBucket,
  latencyByBucket,
  occupancyReading,
  tokensByBucket,
  tokensByModel,
  toolsByBucket,
  valueOf,
  type Measures,
  type QueryResult,
} from '../src/model/shapes.ts'

const sum = (known: string, unknown = 0) => ({ known, unknown, provisional: 0 })
const unknownRatio = { kind: 'unknown' as const }
function measures(changes: Partial<Measures> = {}): Measures {
  return {
    calls: 2,
    units: 2,
    retried: 0,
    interrupted: 0,
    failed: [],
    tokens: {
      input: sum('100'),
      output: sum('10'),
      'cache-read': sum('50'),
      'cache-write': sum('0', 2),
      reasoning: sum('0'),
    },
    cost: { sums: [], unknown: 0 },
    duration: {
      total: sum('900'),
      toFirstContent: { count: 2, p50: 300, p90: 400 },
      whole: { count: 2, p50: 900, p90: 950 },
    },
    rates: {
      cacheHit: unknownRatio,
      reasoningShare: unknownRatio,
      retry: unknownRatio,
      failure: unknownRatio,
      outputPerSecond: unknownRatio,
    },
    ...changes,
  }
}
const bucket = (start: string, total: Measures, groups: QueryResult['groups'] = []) => ({
  start: start as never,
  end: start as never,
  total,
  groups,
})
const result = (changes: Partial<QueryResult>): QueryResult => ({
  total: measures(),
  groups: [],
  buckets: [],
  coverage: {
    sources: ['model', 'tool'],
    undated: 0,
    costUnknown: 0,
    excluded: { cacheHit: 0, reasoningShare: 0, outputPerSecond: 0 },
    earliest: null,
  },
  ...changes,
})
const label = (start: unknown) => String(start)

describe('the data a native widget draws', () => {
  it('writes a sum unknown only when nothing in it is known', () => {
    expect(valueOf(sum('0', 2))).toBeNull()
    expect(valueOf(sum('0'))).toBe(0)
    expect(valueOf(sum('12', 3))).toBe(12)
  })

  it('gives the tokens, the cache and the latency of each bucket, an unknown cell left unknown', () => {
    const two = result({
      buckets: [bucket('d1', measures()), bucket('d2', measures({ calls: 0 }))],
    })
    const tokens = tokensByBucket(two, label)
    expect(tokens.series.map(item => item.key)).toEqual([
      'input',
      'cache-read',
      'cache-write',
      'output',
      'reasoning',
    ])
    expect(tokens.rows[0]).toEqual({
      label: 'd1',
      values: { input: 100, 'cache-read': 50, 'cache-write': null, output: 10, reasoning: 0 },
    })
    expect(cacheByBucket(two, label).rows[1]).toEqual({
      label: 'd2',
      values: { 'cache-read': 50, 'cache-write': null },
    })
    expect(latencyByBucket(two, label).rows[0]?.values).toEqual({ first: 300, whole: 900 })
  })

  it('counts the tool executions of each bucket from its tool group, zero when it has none', () => {
    const tool = { key: ['tool'], measures: measures({ calls: 4 }) }
    const model = { key: ['model'], measures: measures({ calls: 9 }) }
    const answer = result({
      buckets: [bucket('d1', measures(), [model, tool]), bucket('d2', measures(), [model])],
    })
    expect(toolsByBucket(answer, label).rows.map(row => row.values['calls'])).toEqual([4, 0])
  })

  it('splits the input and output tokens by model, an unknown model named so', () => {
    const answer = result({
      groups: [
        { key: ['m-a'], measures: measures() },
        {
          key: [null],
          measures: measures({
            tokens: { ...measures().tokens, input: sum('0', 1), output: sum('0', 1) },
          }),
        },
      ],
    })
    expect(tokensByModel(answer).parts).toEqual([
      { key: 'm-a', label: 'm-a', value: 110 },
      { key: '', label: '未知型号', value: null },
    ])
  })

  it('reads the occupancy as a percent with the compaction mark, or says why there is none', () => {
    expect(
      occupancyReading(
        {
          kind: 'known',
          used: '1500',
          window: '200000',
          percent: '0.75',
          compactAtPercent: '80',
          asOf: { at: 'T' as never, model: 'm-a' },
        },
        at => `at ${String(at)}`,
      ),
    ).toEqual({ percent: 0.75, mark: 80, caption: '截至上一次请求（at T · m-a）' })
    expect(occupancyReading({ kind: 'none-yet' }, String)).toEqual({
      percent: null,
      mark: null,
      unknownReason: '还没有收场的请求',
    })
    expect(occupancyReading({ kind: 'unknown', reason: 'window-unknown' }, String)).toMatchObject({
      percent: null,
      unknownReason: '这个型号的窗口未知',
    })
  })
})
