import { describe, expect, it } from 'vitest'
import {
  CriterionReadingSchema,
  gapTable,
  NO_READINGS,
  ReadingsSchema,
  renderGap,
  RuleReadingSchema,
  validateDraft,
  type GoalBody,
  type Readings,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

function home(change: object = {}): GoalBody {
  const checked = validateDraft({ ...HOME, ...change }, { attendance: 'attended' })
  if (checked.kind !== 'valid') throw new Error('fixture')
  return checked.body
}
const READ: Readings = {
  criteria: {
    A2: { value: 'holds', source: 'system', ref: 'call-44' },
    A3: { value: 'no-evidence', source: 'judge', ref: null },
  },
  metrics: { M1: { value: 940, source: 'system', ref: 'call-41' } },
  rules: {
    N1: { value: 'kept', source: 'judge', ref: null },
    N2: { value: 'broken', source: 'agent', ref: null },
  },
}

describe('the readings kept with a goal', () => {
  it('a criterion is read as one of five things and a rule as one of three', () => {
    expect(CriterionReadingSchema.options).toEqual([
      'holds',
      'fails',
      'no-evidence',
      'stale',
      'cannot-tell',
    ])
    expect(RuleReadingSchema.options).toEqual(['kept', 'broken', 'unclear'])
  })
  it('are kept by number, each with where it came from; a reading outside the closed values is refused', () => {
    expect(ReadingsSchema.parse(READ)).toEqual(READ)
    expect(ReadingsSchema.parse(NO_READINGS)).toEqual(NO_READINGS)
    const odd = { ...READ, rules: { N1: { value: 'bent', source: 'judge', ref: null } } }
    expect(ReadingsSchema.safeParse(odd).success).toBe(false)
    const guessed = { ...READ, criteria: { A2: { value: 'holds', source: 'guess', ref: null } } }
    expect(ReadingsSchema.safeParse(guessed).success).toBe(false)
  })
})

describe('the gap table', () => {
  it('lists every criterion, metric and rule by its number, then the budget', () => {
    const rows = gapTable(home(), READ, 12)
    expect(rows.map(row => row.id)).toEqual(['A1', 'A2', 'A3', 'M1', 'N1', 'N2', '预算'])
    expect(rows.filter(row => row.open).map(row => row.id)).toEqual(['A1', 'A3', 'M1', 'N2'])
  })

  it('reads as the table of the design', () => {
    expect(
      renderGap(gapTable(home({ metrics: [{ ...HOME.metrics![0]!, baseline: 1630 }] }), READ, 12)),
    ).toBe(`- [A1] 首页在测试环境里的 p95 加载时间到 M1 的目标：未成立（系统，call-41），M1 还差 140
- [A2] 现有端到端用例全过：成立（系统，call-44）
- [A3] 改动说明写进了 CHANGELOG：没有证据（判定）
- [M1] 目标 800，底线 1200：940（基线 1630）（系统，call-41），还差 140
- [N1] 不改公共接口。：守住（判定）
- [N2] 每次提交前跑 \`pnpm lint\`，不带着报错提交。：违反（自述）
- 预算 30 轮：用了 12 轮（系统），剩 18`)
  })

  it('with nothing read yet every criterion and metric is open, no rule is, and nothing is short', () => {
    const rows = gapTable(home(), NO_READINGS, 0)
    expect(rows.map(row => [row.id, row.reading, row.open, row.short])).toEqual([
      ['A1', '没读过', true, null],
      ['A2', '没读过', true, null],
      ['A3', '没读过', true, null],
      ['M1', '没读过', true, null],
      ['N1', '没读过', false, null],
      ['N2', '没读过', false, null],
      ['预算', '用了 0 轮', false, '剩 30'],
    ])
  })

  it('a metric at its target closes itself and the criterion measured by it', () => {
    const reached = {
      ...READ,
      metrics: { M1: { value: 800, source: 'system' as const, ref: 'call-60' } },
    }
    const rows = gapTable(home(), reached, 12)
    expect(rows.find(row => row.id === 'M1')).toMatchObject({ open: false, short: null })
    expect(rows.find(row => row.id === 'A1')).toMatchObject({
      open: false,
      reading: '成立',
      short: null,
    })
  })

  it('where higher is better the metric is short from below; rounds past the budget leave none', () => {
    const higher = home({
      metrics: [{ ...HOME.metrics![0]!, direction: 'higher', target: 1000, floor: 500 }],
    })
    expect(gapTable(higher, READ, 31).filter(row => ['M1', '预算'].includes(row.id))).toMatchObject(
      [{ open: true, short: '还差 60' }, { short: '剩 0' }],
    )
  })

  it.each(['fails', 'stale', 'cannot-tell'] as const)('a criterion read as %s is open', value => {
    const read = { ...READ, criteria: { A2: { value, source: 'judge' as const, ref: null } } }
    expect(gapTable(home(), read, 1).find(row => row.id === 'A2')?.open).toBe(true)
  })
})
