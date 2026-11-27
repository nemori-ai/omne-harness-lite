import { expect, it } from 'vitest'

import {
  createVisualRecordKernel,
  VISUAL_DEFAULTS,
  visualRecordKernel as kernel,
  type VisualPreferences,
  type VisualRecord,
} from '../src/shared/visual-record.ts'

function record(t: number, preferences: Partial<VisualPreferences> = {}, id = 'a'): VisualRecord {
  return { version: 1, stamp: { t, id }, preferences }
}

// Input digits denote record time, '-' missing, '!' invalid and 'x' unavailable.
// The last column lists the available replicas that need the winning record.
it.each([
  ['A1', '-', 0, ''],
  ['A2', '!', 0, ''],
  ['A3', '1', 1, ''],
  ['A4', 'x', 0, ''],
  ['B1', '-!', 0, ''],
  ['B2', '1-', 1, '1'],
  ['B3', '!1', 1, '0'],
  ['B4', '12', 2, '0'],
  ['B5', '21', 2, '1'],
  ['B6', '11', 1, ''],
  ['B7', '1x', 1, ''],
  ['B8', 'x1', 1, ''],
  ['C1', '---', 0, ''],
  ['C2', '1--', 1, '12'],
  ['C3', '-1-', 1, '02'],
  ['C4', '--1', 1, '01'],
  ['C5', '21-', 2, '12'],
  ['C6', '12-', 2, '02'],
  ['C7', '11-', 1, '2'],
  ['C8', '2-1', 2, '12'],
  ['C9', '1-2', 2, '01'],
  ['C10', '1-1', 1, '1'],
  ['C11', '-21', 2, '02'],
  ['C12', '-12', 2, '01'],
  ['C13', '-11', 1, '0'],
  ['C14', '211', 2, '12'],
  ['C15', '121', 2, '02'],
  ['C16', '112', 2, '01'],
  ['C17', '221', 2, '2'],
  ['C18', '212', 2, '1'],
  ['C19', '122', 2, '0'],
  ['C20', '111', 1, ''],
] as const)(
  '%s selects the observable maximum and repairs only lagging sources',
  (_, inputs, time, repair) => {
    const sources = Array.from(
      inputs,
      c =>
        kernel.decode(c === '!' ? '{}' : Number(c) ? kernel.encode(record(Number(c))) : null)
          .record,
    )
    const best = kernel.pick(sources)
    expect(best?.stamp.t ?? 0).toBe(time)
    expect(
      kernel.pick(Array.from(sources, (_source, i) => sources[sources.length - i - 1])),
    ).toEqual(best)
    expect(kernel.pick([...sources, best, ...sources])).toEqual(best)
    expect(
      sources
        .flatMap((source, i) =>
          inputs[i] !== 'x' && best && kernel.behind(source, best) ? [i] : [],
        )
        .join(''),
    ).toBe(repair)
  },
)

it('orders by time, code units and canonical sparse JSON, independently of key order', () => {
  const a = record(1, { size: 'large', theme: 'dark' })
  const b = record(1, { theme: 'dark', size: 'large' })
  expect(kernel.encode(a)).toBe(
    '{"version":1,"stamp":{"t":1,"id":"a"},"preferences":{"theme":"dark","size":"large"}}',
  )
  expect(kernel.encode(b)).toBe(kernel.encode(a))
  expect(kernel.compare(a, b)).toBe(0)
  const ordered = [
    record(0),
    record(1, {}, 'Z'),
    record(1, { size: 'large' }),
    a,
    record(1),
    record(2),
  ]
  for (const [i, first] of ordered.entries()) {
    for (const [j, second] of ordered.entries()) {
      expect(kernel.compare(first, second)).toBe(Math.sign(i - j))
      for (const [k, third] of ordered.entries()) {
        const winner = ordered[Math.max(i, j, k)]
        expect(kernel.pick([first, second, third])).toEqual(winner)
        expect(kernel.pick([kernel.pick([first, second]), third, first])).toEqual(winner)
      }
    }
  }
})
it('advances the maximum observed clock after rollback and generates a random id per commit', () => {
  expect(kernel.nextStamp([record(200), record(300)], 10, () => 'next')).toEqual({
    t: 301,
    id: 'next',
  })
  expect(kernel.nextStamp([], 400).t).toBe(400)
  expect(kernel.nextStamp([], 400).id).not.toBe(kernel.nextStamp([], 400).id)
})
it.each([
  ['G1', 'system', {}, 'system'],
  ['G2', 'light', {}, 'light'],
  ['G3', 'light', { theme: 'dark' }, 'dark'],
  ['G4', 'light', { size: 'small' }, 'light'],
  ['G5', 'light', { theme: 'light' }, 'light'],
  ['G6', 'light', { size: 'large' }, 'light'],
  ['G7', 'light', {}, 'light'],
  ['G8', 'system', {}, 'system'],
  ['G9', 'system', { theme: 'light' }, 'light'],
] as const)(
  '%s fills only omitted fields from product defaults',
  (_, theme, preferences, expected) => {
    const product = createVisualRecordKernel({ ...VISUAL_DEFAULTS, theme })
    const stored = product.decode(product.encode(record(1, preferences))).record
    expect(stored?.preferences).toEqual(preferences)
    expect(product.effective(stored).theme).toBe(expected)
  },
)
it.each([
  null,
  [],
  {},
  { ...record(1), version: 2 },
  { ...record(1), extra: true },
  ...[
    null,
    [],
    { t: -1, id: 'x' },
    { t: 1.5, id: 'x' },
    { t: 0, id: '' },
    { t: 0, id: 42 },
    { t: 0, id: 'x', foo: 0 },
  ].map(stamp => ({ ...record(1), stamp })),
  ...[
    null,
    [],
    { size: 'huge' },
    { theme: 'blue', size: 'large' },
    { theme: true },
    { unknown: 'system' },
  ].map(preferences => ({ ...record(1), preferences })),
])('G11 rejects the whole malformed record %#', value => {
  expect(kernel.decode(JSON.stringify(value))).toEqual({ kind: 'invalid' })
})
it('distinguishes a missing value from an empty or corrupt payload', () => {
  expect(kernel.decode(null)).toEqual({ kind: 'missing' })
  expect(kernel.decode('')).toEqual({ kind: 'invalid' })
  expect(kernel.decode('{')).toEqual({ kind: 'invalid' })
})
