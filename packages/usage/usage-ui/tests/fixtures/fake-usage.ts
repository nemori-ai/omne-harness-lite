import type { ClientOf } from '@omne-harness/sdk/core'
import type { UsageProtocol } from '@omne-harness/usage-protocol'
import type { Measures, Occupancy, QueryResult } from '../../src/model/shapes.ts'
import { instant } from './dom.ts'

type Client = ClientOf<UsageProtocol>
export type Answer = Readonly<{ outcome: string; body?: unknown }>
export type Call = Readonly<{ operation: string; body: Record<string, unknown> }>

const sum = (known: string, unknown = 0) => ({ known, unknown, provisional: 0 })
const ratio = (value: string | null) =>
  value === null ? { kind: 'unknown' as const } : { kind: 'known' as const, value }

export function measures(scale = 1): Measures {
  return {
    calls: 3 * scale,
    units: 3 * scale,
    retried: 0,
    interrupted: 0,
    failed: [],
    tokens: {
      input: sum(String(1000 * scale)),
      output: sum(String(200 * scale)),
      'cache-read': sum(String(500 * scale)),
      'cache-write': sum('0'),
      reasoning: sum('0'),
    },
    cost: { sums: [{ unit: 'USD', known: '0.0123' }], unknown: 1 },
    duration: {
      total: sum('900'),
      toFirstContent: { count: 3, p50: 310, p90: 400 },
      whole: { count: 3, p50: 900, p90: 950 },
    },
    rates: {
      cacheHit: ratio('0.25'),
      reasoningShare: ratio(null),
      retry: ratio('0'),
      failure: ratio('0'),
      outputPerSecond: ratio('40'),
    },
  }
}

export function result(groupBy: readonly string[]): QueryResult {
  const groups =
    groupBy[0] === 'model'
      ? [
          { key: ['openai/gpt-5.6-sol'], measures: measures(2) },
          { key: ['anthropic/claude'], measures: measures(1) },
        ]
      : groupBy[0] === 'source'
        ? [
            { key: ['model'], measures: measures(1) },
            { key: ['tool'], measures: { ...measures(1), calls: 4 } },
          ]
        : []
  return {
    total: measures(3),
    groups,
    buckets: ['2026-11-18T16:00:00Z', '2026-11-19T16:00:00Z'].map((start, day) => ({
      start: instant(start),
      end: instant(start),
      total: measures(day + 1),
      groups,
    })),
    coverage: {
      sources: ['model', 'tool'],
      undated: 0,
      costUnknown: 1,
      excluded: { cacheHit: 0, reasoningShare: 0, outputPerSecond: 0 },
      earliest: null,
    },
  }
}

export const KNOWN_OCCUPANCY: Occupancy = {
  kind: 'known',
  used: '1500',
  window: '200000',
  percent: '0.75',
  compactAtPercent: '80',
  asOf: { at: instant('2026-11-19T10:00:00Z'), model: 'openai/gpt-5.6-sol' },
}

/** A usage client answering every read from `answer`, recording what it was asked. */
export function fakeUsage(answer?: (call: Call) => Answer | undefined) {
  const calls: Call[] = []
  const reply = async (operation: string, body: unknown): Promise<never> => {
    const call = { operation, body: body as Record<string, unknown> }
    calls.push(call)
    const given = answer?.(call)
    if (given !== undefined) return given as never
    if (operation === 'read-context-occupancy')
      return { outcome: 'succeeded', body: KNOWN_OCCUPANCY } as never
    return { outcome: 'succeeded', body: result(call.body['groupBy'] as string[]) } as never
  }
  const client = {
    'query-usage': (body: unknown) => reply('query-usage', body),
    'list-usage-records': (body: unknown) => reply('list-usage-records', body),
    'read-context-occupancy': (body: unknown) => reply('read-context-occupancy', body),
    observe: {},
  } as unknown as Client
  return { client, calls }
}
