import { describe, expect, it } from 'vitest'
import {
  BODY_MAX_CHARACTERS,
  DEFAULT_BUDGET_ROUNDS,
  RENDER_VERSION,
  characters,
  renderBody,
  validateDraft,
  type BodyIssue,
  type GoalBody,
  type GoalDraft,
} from '@omne-harness/goal-contract'
import { HOME, HOME_TEXT, LEAST } from './fixtures.ts'

const attended = { attendance: 'attended' } as const
const unattended = { attendance: 'unattended' } as const

function valid(
  draft: GoalDraft,
  context: typeof attended | typeof unattended = attended,
): GoalBody {
  const checked = validateDraft(draft, context)
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}
function issues(draft: unknown, context: typeof attended | typeof unattended = attended) {
  const checked = validateDraft(draft, context)
  return checked.kind === 'invalid' ? checked.issues : []
}
const where = (found: readonly BodyIssue[]) =>
  found.map(issue => `${issue.entry ?? '-'}.${issue.field}`)
type Whole = { [K in keyof GoalDraft]-?: NonNullable<GoalDraft[K]> }
const change = (patch: (draft: Whole) => void): GoalDraft => {
  const draft = structuredClone(HOME) as Whole
  patch(draft)
  return draft
}

describe('a body handed in becomes the kept body', () => {
  it('numbers each entry in the order it stands, and remembers how many numbers each section issued', () => {
    const body = valid(HOME)
    expect(body.criteria.map(entry => entry.id)).toEqual(['A1', 'A2', 'A3'])
    expect(body.metrics.map(entry => entry.id)).toEqual(['M1'])
    expect(body.rules.map(entry => entry.id)).toEqual(['N1', 'N2'])
    expect(body.exits.map(entry => entry.id)).toEqual(['X1', 'X2', 'X3'])
    expect(body.references.map(entry => entry.id)).toEqual(['R1'])
    expect(body.issued).toEqual({ A: 3, M: 1, N: 2, X: 3, R: 1 })
  })

  it('without a budget exit it gets the default one: fifty rounds, counted as failure', () => {
    const body = valid(LEAST)
    expect(body.exits).toEqual([
      {
        id: 'X1',
        statement: '预算用尽',
        kind: 'budget',
        limits: [{ amount: DEFAULT_BUDGET_ROUNDS, unit: 'rounds' }],
        by: [],
        deliver: '做到哪一步、还差什么',
        counts: 'failure',
      },
    ])
    expect(DEFAULT_BUDGET_ROUNDS).toBe(50)
    expect(valid(HOME).exits.filter(exit => exit.kind === 'budget')).toHaveLength(1)
  })

  it('the default budget comes after the exits written; a budget written is the only one', () => {
    const other = valid({ ...LEAST, exits: [HOME.exits![2]!] })
    expect(other.exits.map(exit => [exit.id, exit.kind])).toEqual([
      ['X1', 'person'],
      ['X2', 'budget'],
    ])
    expect(other.issued.X).toBe(2)
    const own = valid({ ...LEAST, exits: [HOME.exits![0]!] })
    expect(own.exits.map(exit => exit.limits)).toEqual([[{ amount: 30, unit: 'rounds' }]])
  })
})

describe('a body that does not stand says which entry and which field', () => {
  it.each([
    ['no purpose', change(d => (d.purpose = '  ')), ['-.purpose']],
    ['no criterion', change(d => (d.criteria = [])), ['-.criteria', 'X2.by']],
    [
      'a criterion without its sentence',
      change(d => (d.criteria[1]!.statement = '')),
      ['A2.statement'],
    ],
    [
      'a metric without a way to measure',
      change(d => delete (d.metrics[0] as { measure?: unknown }).measure),
      ['M1.measure'],
    ],
    ['an exit without what it hands over', change(d => (d.exits[2]!.deliver = '')), ['X3.deliver']],
    [
      'a metric whose path names no place in JSON',
      change(d => (d.metrics[0]!.measure.path = 'the p95 number')),
      ['M1.measure'],
    ],
    ['an empty line of method', change(d => (d.method = ['先量', ' '])), ['-.method']],
  ])('required: %s', (_name, draft, expected) => {
    expect(where(issues(draft))).toEqual(expected)
  })

  it.each([
    [
      'a direction outside lower and higher',
      change(d => ((d.metrics[0] as { direction: string }).direction = 'faster')),
      ['M1.direction'],
    ],
    [
      'an exit kind outside the four',
      change(d => ((d.exits[0] as { kind: string }).kind = 'timeout')),
      ['X1.kind'],
    ],
    [
      'counts outside success and failure',
      change(d => ((d.exits[0] as { counts: string }).counts = 'partial')),
      ['X1.counts'],
    ],
    [
      'an evidence kind outside the four',
      change(d => ((d.criteria[0] as { evidence: unknown }).evidence = { kind: 'feeling' })),
      ['A1.evidence'],
    ],
    [
      'a unit outside rounds',
      change(d => ((d.exits[0]!.limits![0] as { unit: string }).unit = 'hours')),
      ['X1.limits'],
    ],
    [
      'a field nobody knows',
      change(d => ((d.rules[0] as { weight?: number }).weight = 3)),
      ['N1.weight'],
    ],
  ])('closed values: %s', (_name, draft, expected) => {
    expect(where(issues(draft))).toEqual(expected)
  })

  it.each([
    [
      'evidence names a metric that is not there',
      change(d => (d.criteria[0]!.evidence = { kind: 'metric', metric: 'M2' })),
      ['A1.evidence'],
    ],
    [
      'good-enough stands on a criterion that is not there',
      change(d => (d.exits[1]!.by = [{ kind: 'criterion', id: 'A9' }])),
      ['X2.by'],
    ],
    [
      'good-enough stands on a metric that is not there',
      change(d => (d.exits[1]!.by = [{ kind: 'floor', id: 'M3' }])),
      ['X2.by'],
    ],
  ])('references: %s', (_name, draft, expected) => {
    expect(where(issues(draft))).toEqual(expected)
  })

  it.each([
    ['stands on nothing', change(d => (d.exits[1]!.by = [])), ['X2.by']],
    [
      'stands on the floor of a metric that has none',
      change(d => (d.metrics[0]!.floor = null)),
      ['X2.by'],
    ],
    [
      'another kind of exit names what it stands on',
      change(d => (d.exits[2]!.by = [{ kind: 'criterion', id: 'A2' }])),
      ['X3.by'],
    ],
  ])('good enough: %s', (_name, draft, expected) => {
    expect(where(issues(draft))).toEqual(expected)
  })

  it.each([
    ['a budget without a limit', change(d => (d.exits[0]!.limits = [])), ['X1.limits']],
    [
      'a limit on an exit that is no budget',
      change(d => (d.exits[2]!.limits = [{ amount: 3, unit: 'rounds' }])),
      ['X3.limits'],
    ],
    ['two budget exits', change(d => d.exits.push({ ...d.exits[0]! })), ['X4.kind']],
    [
      'exit code zero asked of something that is no command',
      change(d => (d.criteria[2]!.pass = { kind: 'exit-zero' })),
      ['A3.pass'],
    ],
  ])('what goes together: %s', (_name, draft, expected) => {
    expect(where(issues(draft))).toEqual(expected)
  })

  it('in an unattended session the evidence cannot be a person confirming', () => {
    expect(where(issues(LEAST, unattended))).toEqual(['A1.evidence'])
    expect(issues(LEAST, attended)).toEqual([])
    expect(issues(HOME, unattended)).toEqual([])
  })

  it('something that is no body at all is refused as a whole', () => {
    expect(where(issues('把首页降下来'))).toEqual(['-.body'])
    expect(where(issues({ criteria: [] }))).toEqual(['-.purpose'])
  })

  it('a section of the wrong shape is reported on the body, by the name of the section', () => {
    expect(where(issues({ ...HOME, criteria: '全过' }))).toEqual(['-.criteria'])
    expect(where(issues({ ...HOME, method: [3] }))).toEqual(['-.method'])
    expect(where(issues({ ...HOME, rules: ['不改公共接口。'] }))).toEqual(['N1.entry'])
  })

  const said = (draft: unknown, context: typeof attended | typeof unattended = attended) =>
    issues(draft, context).map(issue => issue.problem)
  it.each([
    [change(d => (d.purpose = ' ')), 'a goal needs a purpose'],
    [change(d => (d.method = [' '])), 'a line of method is empty'],
    [change(d => (d.exits[0]!.limits = [])), 'a budget exit needs a limit'],
    [
      change(d => (d.exits[2]!.limits = [{ amount: 3, unit: 'rounds' }])),
      'only a budget exit has limits',
    ],
    [change(d => d.exits.push({ ...d.exits[0]! })), 'a goal has one budget exit'],
    [
      change(d => (d.exits[2]!.by = [{ kind: 'criterion', id: 'A2' }])),
      'only a good-enough exit stands on entries',
    ],
    [
      change(d => (d.exits[1]!.by = [])),
      'good enough stands on criteria or metric floors, not on a sentence',
    ],
    [change(d => (d.exits[1]!.by = [{ kind: 'criterion', id: 'A9' }])), 'there is no criterion A9'],
    [change(d => (d.exits[1]!.by = [{ kind: 'floor', id: 'M3' }])), 'there is no metric M3'],
    [change(d => (d.metrics[0]!.floor = null)), 'metric M1 has no floor'],
    [
      change(d => (d.criteria[0]!.evidence = { kind: 'metric', metric: 'M2' })),
      'there is no metric M2',
    ],
    [change(d => (d.criteria[2]!.pass = { kind: 'exit-zero' })), 'only a command has an exit code'],
  ])('problem %#: %s', (draft, sentence) => {
    expect(said(draft)).toEqual([sentence])
  })
  it('says what is missing where there is no criterion, and why a person cannot confirm', () => {
    expect(said(change(d => (d.criteria = [])))).toContain('a goal needs one criterion at least')
    expect(said(LEAST, unattended)).toEqual(['nobody is in an unattended session to confirm'])
  })

  it('every problem is reported, not only the first', () => {
    const draft = change(d => {
      d.purpose = ''
      d.exits[1]!.by = []
      d.criteria[0]!.evidence = { kind: 'metric', metric: 'M7' }
    })
    expect(where(issues(draft))).toEqual(['-.purpose', 'A1.evidence', 'X2.by'])
  })
})

describe('the rendered body', () => {
  it('is the text of the design for the example, section by section', () => {
    expect(renderBody(valid(HOME))).toBe(HOME_TEXT)
  })

  it('leaves out the sections that are empty, and writes a default budget like any other exit', () => {
    expect(renderBody(valid(LEAST))).toBe(`## 目的
把这段输入要的事做完

## 达成
- [A1] 事做完了
  - 证据: 人确认

## 退出
- [X1] 预算用尽
  - 种类: 预算
  - 上限: 50 轮
  - 交: 做到哪一步、还差什么
  - 算: 失败
`)
  })

  it('is the same text for the same data, whatever order the fields were written in', () => {
    const shuffled = JSON.parse(
      JSON.stringify(valid(HOME), (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    ) as GoalBody
    expect(renderBody(shuffled)).toBe(HOME_TEXT)
    expect(renderBody(valid(HOME))).toBe(renderBody(valid(HOME)))
    expect(RENDER_VERSION).toBe(1)
  })

  it('writes a number baseline, a higher-is-better direction and a metric without floor or baseline', () => {
    const body = valid(
      change(d => {
        d.metrics[0] = { ...d.metrics[0]!, direction: 'higher', baseline: 12.5, floor: null }
        d.exits.splice(1, 1)
      }),
    )
    expect(renderBody(body)).toContain('  - 方向: 越高越好\n  - 目标: 800\n  - 基线: 12.5\n')
  })
})

describe('the limit of four thousand characters', () => {
  const sized = (purpose: string) => ({ ...LEAST, purpose })
  const overhead = characters(renderBody(valid(sized('x')))) - 1

  it('counts Unicode code points: a Chinese character, a letter, a newline and an emoji are one each', () => {
    expect(characters('目标a\n')).toBe(4)
    expect(characters('🙂')).toBe(1)
    expect('🙂'.length).toBe(2)
  })

  it('lets a body of exactly four thousand through and refuses one more, saying how many it is', () => {
    const fits = '目'.repeat(BODY_MAX_CHARACTERS - overhead)
    expect(characters(renderBody(valid(sized(fits))))).toBe(4000)
    const over = issues(sized(`${fits}标`))
    expect(over).toEqual([{ entry: null, field: 'body', problem: expect.stringContaining('4001') }])
  })

  it('does not count by UTF-16 units: four thousand emoji fit where a length check would refuse', () => {
    const emoji = '🙂'.repeat(BODY_MAX_CHARACTERS - overhead)
    expect(emoji.length).toBeGreaterThan(BODY_MAX_CHARACTERS)
    expect(issues(sized(emoji))).toEqual([])
  })
})
