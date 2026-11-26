import { describe, expect, it } from 'vitest'
import {
  mediaLimitMetric,
  profileProblems,
  type ModelProfileDefinition,
} from '@omne-harness/model-contract'

const adoption = { owner: 'tests', name: 'profile', revision: '1', digest: '0'.repeat(64) }
const supplier = { adoption, provider: 'openrouter', model: 'lab/model' } as never
const limit = (provided: string, finite?: string) => ({
  provided,
  upstream: [
    {
      supplier: adoption,
      limit:
        finite === undefined
          ? ({ kind: 'unknown' } as const)
          : ({ kind: 'finite', amount: finite, source: adoption } as const),
    },
  ],
})
const metric = (name: string, provided = '1024') => ({ metric: name, ...limit(provided) }) as never

const GOOD: ModelProfileDefinition = {
  kind: 'llm',
  suppliers: [supplier],
  fallback: false,
  input: ['text', 'image', 'voice'],
  fileTypes: ['application/pdf'],
  output: ['text'],
  context: {
    window: limit('1000', '2000'),
    input: limit('800'),
    output: limit('200', '300'),
    compactionTriggerPercent: '80',
  },
  limits: [
    metric('image-bytes'),
    metric('voice-bytes'),
    metric('voice-duration-ms'),
    metric('file-bytes'),
  ],
  parameters: [],
  representation: adoption,
  meter: adoption,
  retryPolicy: adoption,
}

const withContext = (change: Partial<ModelProfileDefinition['context']>) => ({
  ...GOOD,
  context: { ...GOOD.context, ...change },
})
const without = (name: string) => ({
  ...GOOD,
  limits: GOOD.limits.filter(item => item.metric !== name),
})

describe('profileProblems', () => {
  it('finds nothing in a profile that keeps every rule', () => {
    expect(profileProblems(GOOD)).toEqual([])
    const text = { ...GOOD, input: ['text'] as const, limits: [] }
    expect(profileProblems({ ...text, fileTypes: [] })).toEqual([])
    const { fileTypes: _, ...noFiles } = text
    expect(profileProblems(noFiles)).toEqual([])
    expect(profileProblems(withContext({ input: null }))).toEqual([])
    expect(profileProblems(withContext({ compactionTriggerPercent: '1' }))).toEqual([])
    expect(profileProblems(withContext({ compactionTriggerPercent: '100' }))).toEqual([])
    expect(profileProblems(withContext({ window: limit('2000', '2000') }))).toEqual([])
    expect(profileProblems(withContext({ output: limit('1000') }))).toEqual([])
  })

  it('compares a limit with every finite decimal upstream, and with no other', () => {
    const upstream = (amount: string) => ({
      supplier: adoption,
      limit: { kind: 'finite', amount, source: adoption } as const,
    })
    const window = (...amounts: string[]) => ({ provided: '1000', upstream: amounts.map(upstream) })
    expect(profileProblems(withContext({ window: window('5000', '999') }))).toEqual([
      'context.window',
    ])
    expect(profileProblems(withContext({ window: window('5000', 'abc') }))).toEqual([])
  })

  it.each([
    [
      'a window that is not a positive integer',
      withContext({ window: limit('0') }),
      ['context.window'],
    ],
    ['an output that is not decimal', withContext({ output: limit('1e3') }), ['context.output']],
    ['an input over the window', withContext({ input: limit('1001') }), ['context.input']],
    ['an output over the window', withContext({ output: limit('1001') }), ['context.output']],
    [
      'a window over its finite upstream',
      withContext({ window: limit('2001', '2000') }),
      ['context.window'],
    ],
    [
      'an output over its finite upstream',
      withContext({ output: limit('301', '300') }),
      ['context.output'],
    ],
    [
      'a trigger of 0 percent',
      withContext({ compactionTriggerPercent: '0' }),
      ['context.compactionTriggerPercent'],
    ],
    [
      'a trigger of 101 percent',
      withContext({ compactionTriggerPercent: '101' }),
      ['context.compactionTriggerPercent'],
    ],
    ['an input without text', { ...GOOD, input: ['image'] as const }, ['input']],
    ['images without an image byte limit', without('image-bytes'), ['limits.image-bytes']],
    ['voice without a byte limit', without('voice-bytes'), ['limits.voice-bytes']],
    ['voice without a duration limit', without('voice-duration-ms'), ['limits.voice-duration-ms']],
    ['file types without a file byte limit', without('file-bytes'), ['limits.file-bytes']],
  ])('names the field for %s', (_name, definition, fields) => {
    expect(profileProblems(definition as ModelProfileDefinition)).toEqual(fields)
  })
})

describe('mediaLimitMetric', () => {
  it.each([
    ['image/png', 'image-bytes'],
    ['audio/wav', 'voice-bytes'],
    ['application/pdf', 'file-bytes'],
    ['text/csv', 'file-bytes'],
    ['no type', 'file-bytes'],
  ])('holds %s to the %s limit', (mediaType, metric) => {
    expect(mediaLimitMetric(mediaType)).toBe(metric)
  })
})
