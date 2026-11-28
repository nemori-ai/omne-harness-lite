import { describe, expect, it } from 'vitest'
import { liveCells, requiredCells, recordBaseline, type Baseline, type LiveModel } from './cells.ts'
import { measure, type Turn } from './measure.ts'
const models: readonly LiveModel[] = [
  { route: 'a/one', family: 'a', revision: '1' },
  { route: 'b/two', family: 'b', revision: '2' },
]
const cells = liveCells(models, ['a/one', 'b/two'])
const empty: Baseline = { cells: {} }
const turns: readonly Turn[] = Array.from({ length: 3 }, () => ({
  route: 'a/one',
  replied: false,
  attempt: {
    route: 'a/one',
    reasoning: 'unknown',
    input: 1,
    cacheRead: 9,
    cacheWrite: 0,
    costUsd: 0.01,
  },
}))
const green = measure(turns)
const rows = cells.map(cell => ({
  cell: cell.id,
  state: 'green' as const,
  reasons: [],
  measured: green,
}))
describe('incremental matrix recording', () => {
  it('selects complete IDs for every missing current cell', () => {
    expect(requiredCells(cells, models, empty).map(cell => cell.id)).toEqual([
      'single:a/one',
      'single:b/two',
      'alternate:a/one~b/two',
      'alternate:b/two~a/one',
    ])
  })
  it('records a complete green run and leaves no required cells', () => {
    const recorded = recordBaseline(cells, models, empty, cells, rows, '2026-11-23')
    expect(requiredCells(cells, models, recorded)).toEqual([])
  })
  it.each(['red', 'error', 'not-run'] as const)('rejects %s without creating a baseline', state => {
    expect(() =>
      recordBaseline(
        cells,
        models,
        empty,
        cells,
        [{ ...rows[0]!, state }, ...rows.slice(1)],
        '2026-11-23',
      ),
    ).toThrow()
  })
  it('rejects missing, duplicate, extra and empty results', () => {
    for (const invalid of [
      [],
      rows.slice(1),
      [...rows, rows[0]!],
      [...rows, { ...rows[0]!, cell: 'extra' }],
    ])
      expect(() => recordBaseline(cells, models, empty, cells, invalid, '2026-11-23')).toThrow()
    expect(() => recordBaseline(cells, models, empty, [], [], '2026-11-23')).toThrow()
  })
  it('rejects a repeated ID that masks an omitted cell even with a complete prior baseline', () => {
    const previous = recordBaseline(cells, models, empty, cells, rows, '2026-11-22')
    const duplicate = [rows[0]!, rows[0]!, ...rows.slice(2)]
    expect(() => recordBaseline(cells, models, previous, cells, duplicate, '2026-11-23')).toThrow()
  })
  it('does not let --only hide a required cell', () => {
    expect(() =>
      recordBaseline(cells, models, empty, cells.slice(0, 1), rows.slice(0, 1), '2026-11-23'),
    ).toThrow()
  })
  it('removes obsolete pairs and preserves valid untouched measurements', () => {
    const old = recordBaseline(cells, models, empty, cells, rows, '2026-11-20')
    const changedModels = models.map(model =>
      model.route === 'b/two' ? { ...model, revision: '3' } : model,
    )
    const prior = { cells: { ...old.cells, obsolete: old.cells['single:a/one']! } }
    const required = requiredCells(cells, changedModels, prior)
    expect(required.map(cell => cell.id)).toEqual([
      'single:b/two',
      'alternate:a/one~b/two',
      'alternate:b/two~a/one',
    ])
    const next = recordBaseline(
      cells,
      changedModels,
      prior,
      required,
      rows.filter(row => row.cell !== 'single:a/one'),
      '2026-11-23',
    )
    expect(next.cells['single:a/one']).toEqual(old.cells['single:a/one'])
    expect(next.cells['obsolete']).toBeUndefined()
  })
})

describe('spend remains an observed fact', () => {
  it('preserves a known zero charge from the dispatch account', () => {
    expect(measure([{ ...turns[0]!, dispatchCosts: [0] }]).costUsd).toBe(0)
  })
  it('keeps unknown costs unknown and refuses further budget', async () => {
    const { fitsBudget, judge } = await import('./measure.ts')
    const unknown = measure([{ ...turns[0]!, attempt: { ...turns[0]!.attempt!, costUsd: null } }])
    expect(unknown.costUsd).toBeNull()
    expect(fitsBudget(unknown.costUsd, 0, 1)).toBe(false)
    expect(judge(unknown, undefined)).toContain('billable cost is unknown')
  })
  it('includes every dispatch cost even when only the last one answered', async () => {
    const { turnsOf } = await import('./measure.ts')
    const dispatch = (kind: string, cost: string) => ({
      adapter: { name: 'a/one' },
      outcome: { kind },
      account: { kind: 'account', cost: [{ source: 'billable', state: 'known', lexeme: cost }] },
    })
    const read = turnsOf(
      ['a/one'],
      [
        {
          started: { position: '1' },
          modelCalls: [{ dispatches: [dispatch('failed', '0.02'), dispatch('completed', '0.03')] }],
        },
      ],
      [],
    )
    expect(measure(read).costUsd).toBeCloseTo(0.05)
  })
})

describe('the CLI execution loop', () => {
  it.each(['unknown', 'error', 'budget'] as const)(
    'saves partial results and stops spending after %s',
    async mode => {
      const { executeCells } = await import('./execute.ts')
      let calls = 0
      const saved: number[] = []
      const result = await executeCells(
        cells,
        empty,
        0.05,
        async () => {
          calls += 1
          if (mode === 'error') throw new Error('incomplete turn')
          return { measured: mode === 'unknown' ? { ...green, costUsd: null } : green, turns }
        },
        rows => saved.push(rows.length),
      )
      expect(calls).toBe(1)
      expect(saved).toEqual([1, 2, 3, 4])
      expect(result.slice(1).map(row => row.state)).toEqual(['not-run', 'not-run', 'not-run'])
      expect(() => recordBaseline(cells, models, empty, cells, result, '2026-11-23')).toThrow()
    },
  )
})

it('does not promote a green label with red measurements', () => {
  const lying = rows.map(row => ({ ...row, measured: { ...green, hitRate: 0.1 } }))
  expect(() => recordBaseline(cells, models, empty, cells, lying, '2026-11-23')).toThrow()
})
