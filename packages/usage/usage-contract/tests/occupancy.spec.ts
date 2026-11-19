import { describe, expect, it } from 'vitest'
import { occupancyOf, type UsageFact } from '@omne-harness/usage-contract'
import { picker, randomFact } from './support/facts.ts'

const base = randomFact(picker(3), 0, 0, 1)
const known = (name: string, lexeme: string) => ({
  name,
  state: 'known' as const,
  lexeme,
  unit: 'token',
})
const three = (input: string, read: string, write: string) => [
  known('input', input),
  known('cache-read', read),
  known('cache-write', write),
]
const main = (changes: Partial<UsageFact>): UsageFact => ({
  ...base,
  source: 'model',
  subject: { kind: 'model_call', id: `c-${changes.unit ?? 'u'}` },
  consumer: { ...base.consumer, purpose: 'main' },
  labels: { ...base.labels, model: 'm-a' },
  outcome: 'completed',
  accounted: true,
  window: { tokens: '200000', compactAtPercent: '80' },
  usage: three('1000', '500', '0'),
  ...changes,
})

describe('the context occupancy of a session, by the rows of T9 (C23)', () => {
  it('is none yet without a main dispatch, or when none has settled with an account', () => {
    expect(occupancyOf([])).toEqual({ kind: 'none-yet' })
    expect(
      occupancyOf([
        main({ unit: 'u1', at: '2026-11-19T10:00:00.000Z', outcome: 'pending' }),
        main({ unit: 'u2', at: '2026-11-19T10:01:00.000Z', accounted: false }),
        main({ unit: 'u3', at: null }),
        main({
          unit: 'u4',
          at: '2026-11-19T10:02:00.000Z',
          consumer: { ...base.consumer, purpose: 'summary' },
        }),
        main({
          unit: 'u5',
          at: '2026-11-19T10:03:00.000Z',
          subject: { kind: 'tool_execution', id: 't' },
        }),
      ]),
    ).toEqual({ kind: 'none-yet' })
  })

  it('goes back to the latest dispatch with the three input items known, else answers the usage unknown', () => {
    const unknownRead = [
      known('input', '9'),
      { name: 'cache-read', state: 'unknown' as const, unit: 'token' },
      known('cache-write', '0'),
    ]
    const older = main({
      unit: 'u1',
      at: '2026-11-19T10:00:00.000Z',
      usage: three('2000', '0', '0'),
    })
    const newer = main({ unit: 'u2', at: '2026-11-19T10:05:00.000Z', usage: unknownRead })
    expect(occupancyOf([older, newer])).toMatchObject({
      kind: 'known',
      used: '2000',
      asOf: { at: older.at },
    })
    const missing = main({
      unit: 'u3',
      at: '2026-11-19T10:06:00.000Z',
      usage: [known('input', '1'), known('cache-read', '1')],
    })
    expect(occupancyOf([newer, missing])).toEqual({ kind: 'unknown', reason: 'usage-unknown' })
  })

  it('answers the window unknown when the latest known dispatch has none, and the share in hundredths otherwise', () => {
    expect(
      occupancyOf([main({ unit: 'u1', at: '2026-11-19T10:00:00.000Z', window: null })]),
    ).toEqual({
      kind: 'unknown',
      reason: 'window-unknown',
    })
    expect(
      occupancyOf([
        main({
          unit: 'u1',
          at: '2026-11-19T10:00:00.000Z',
          window: { tokens: '0', compactAtPercent: null },
        }),
      ]),
    ).toEqual({ kind: 'unknown', reason: 'window-unknown' })
    expect(
      occupancyOf([
        main({ unit: 'u1', at: '2026-11-19T10:00:00.000Z', usage: three('1000', '500', '1') }),
      ]),
    ).toEqual({
      kind: 'known',
      used: '1501',
      window: '200000',
      percent: '0.75',
      compactAtPercent: '80',
      asOf: { at: '2026-11-19T10:00:00.000Z', model: 'm-a' },
    })
    expect(
      occupancyOf([
        main({ unit: 'u1', at: '2026-11-19T10:00:00.000Z', usage: three('150000', '0', '0') }),
      ]),
    ).toMatchObject({
      percent: '75.00',
    })
  })

  it('takes the newest known dispatch whatever order the facts come in', () => {
    const older = main({ unit: 'u9', at: '2026-11-19T10:00:00.000Z', usage: three('10', '0', '0') })
    const newer = main({ unit: 'u1', at: '2026-11-19T10:05:00.000Z', usage: three('20', '0', '0') })
    for (const facts of [
      [older, newer],
      [newer, older],
    ])
      expect(occupancyOf(facts)).toMatchObject({ used: '20', asOf: { at: newer.at } })
  })

  it('answers the window unknown when its tokens are not a plain positive integer', () => {
    for (const tokens of ['0200000', '200000x', 'x200000'])
      expect(
        occupancyOf([
          main({
            unit: 'u1',
            at: '2026-11-19T10:00:00.000Z',
            window: { tokens, compactAtPercent: null },
          }),
        ]),
        tokens,
      ).toEqual({ kind: 'unknown', reason: 'window-unknown' })
  })

  it('takes the later unit when two dispatches share the latest instant', () => {
    const at = '2026-11-19T10:00:00.000Z'
    expect(
      occupancyOf([
        main({ unit: 'u2', at, usage: three('20', '0', '0') }),
        main({ unit: 'u1', at, usage: three('10', '0', '0') }),
      ]),
    ).toMatchObject({ used: '20' })
    expect(
      occupancyOf([
        main({ unit: 'u1', at, usage: three('10', '0', '0') }),
        main({ unit: 'u2', at, usage: three('20', '0', '0') }),
      ]),
    ).toMatchObject({ used: '20' })
  })
})
