import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUDGET_EXAMINATIONS,
  awaited,
  renderBody,
  JOB_AWAITED,
  validateDraft,
  verificationOf,
  type BodyContext,
  type BodyIssue,
  type GoalBody,
  type GoalDraft,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

const attended: BodyContext = { attendance: 'attended' }
const unattended: BodyContext = { attendance: 'unattended' }
type Whole = { [K in keyof GoalDraft]-?: NonNullable<GoalDraft[K]> }
const change = (patch: (draft: Whole) => void): GoalDraft => {
  const draft = structuredClone(HOME) as Whole
  patch(draft)
  return draft
}
function valid(draft: GoalDraft, context: BodyContext = attended): GoalBody {
  const checked = validateDraft(draft, context)
  if (checked.kind !== 'valid') throw new Error(JSON.stringify(checked.issues))
  return checked.body
}
function issues(draft: unknown, context: BodyContext = attended): readonly BodyIssue[] {
  const checked = validateDraft(draft, context)
  return checked.kind === 'invalid' ? checked.issues : []
}
const where = (found: readonly BodyIssue[]) =>
  found.map(issue => `${issue.entry ?? '-'}.${issue.field}`)

const RERUN = { kind: 'rerun', command: 'node accept.js lines' } as const
const EXAMINED = {
  kind: 'examination',
  method: '用浏览器打开 snake.html，按方向键走到食物',
} as const
const ACTIVITY = { kind: 'activity' } as const
/** HOME with its third criterion judged the given way. */
const third = (evidence: unknown, pass: unknown = undefined): GoalDraft =>
  change(d => {
    const entry = d.criteria[2] as Record<string, unknown>
    entry['evidence'] = evidence
    if (pass === undefined) delete entry['pass']
    else entry['pass'] = pass
  })

describe('where the evidence of a criterion comes from fixes how it is judged', () => {
  const judged = (evidence: unknown, pass: unknown = undefined) =>
    verificationOf(valid(third(evidence, pass)).criteria[2]!)

  it.each([
    [
      'a command read by its exit code',
      { kind: 'command', command: 'pnpm test' },
      { kind: 'exit-zero' },
      'system',
    ],
    [
      'a command whose output is to be read',
      { kind: 'command', command: 'pnpm test' },
      { kind: 'shows', text: '七条都过' },
      'judge',
    ],
    [
      'a command with nothing said of what it shows',
      { kind: 'command', command: 'pnpm test' },
      undefined,
      'judge',
    ],
    ['a file', { kind: 'file', path: 'CHANGELOG.md' }, undefined, 'judge'],
    ['what was done in the round', ACTIVITY, undefined, 'judge'],
    [
      'what was done in the round, with what it must show',
      ACTIVITY,
      { kind: 'shows', text: '列出了三件待办' },
      'judge',
    ],
    ['a run again in a clean copy', RERUN, undefined, 'rerun'],
    ['an examination by the written method', EXAMINED, undefined, 'examination'],
    ['a person', { kind: 'person' }, undefined, 'person'],
  ])('%s', (_name, evidence, pass, expected) => {
    expect(judged(evidence, pass)).toBe(expected)
  })

  it('a metric is read by the system', () => {
    expect(verificationOf(valid(HOME).criteria[0]!)).toBe('system')
  })

  it('what is read on the spot and what has to be waited for', () => {
    expect((['system', 'judge', 'rerun', 'examination', 'person'] as const).map(awaited)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ])
  })
})

describe('what a draft may write about evidence', () => {
  it('the three new ways stand in an attended session', () => {
    for (const evidence of [ACTIVITY, RERUN, EXAMINED]) expect(issues(third(evidence))).toEqual([])
  })

  it('an unattended session may write a run again and an examination, and still no person', () => {
    expect(issues(third(RERUN), unattended)).toEqual([])
    expect(issues(third(EXAMINED), unattended)).toEqual([])
    expect(where(issues(third({ kind: 'person' }), unattended))).toEqual(['A3.evidence'])
  })

  it.each([
    ['an examination without a method', { kind: 'examination' }, undefined, ['A3.evidence']],
    [
      'a method on something that is no examination',
      { kind: 'file', path: 'a.md', method: '打开看看' },
      undefined,
      ['A3.evidence'],
    ],
    ['a run again without a command', { kind: 'rerun' }, undefined, ['A3.evidence']],
    [
      'an examination told what to show besides its method',
      EXAMINED,
      { kind: 'shows', text: '能玩' },
      ['A3.pass'],
    ],
    ['a run again asked to show a text', RERUN, { kind: 'shows', text: 'pass' }, ['A3.pass']],
    [
      'exit code zero asked of what was done in the round',
      ACTIVITY,
      { kind: 'exit-zero' },
      ['A3.pass'],
    ],
  ])('refused: %s', (_name, evidence, pass, expected) => {
    expect(where(issues(third(evidence, pass)))).toEqual(expected)
  })

  it.each([
    [
      'A3',
      'pass',
      EXAMINED,
      { kind: 'shows', text: '能玩' },
      'what an examination must see is in its method',
    ],
    ['A3', 'pass', RERUN, { kind: 'shows', text: 'pass' }, 'a run again is read by its exit code'],
  ])('the refusal says what is wrong with %s.%s', (entry, field, evidence, pass, problem) => {
    expect(issues(third(evidence, pass))).toEqual([{ entry, field, problem }])
  })

  it('a run again may say that it is read by its exit code: it always is', () => {
    expect(issues(third(RERUN, { kind: 'exit-zero' }))).toEqual([])
  })

  it('the goal of a session that examines cannot itself wait for an examination', () => {
    const examining: BodyContext = { attendance: 'unattended', examining: true }
    expect(issues(third(RERUN), examining)).toEqual([
      {
        entry: 'A3',
        field: 'evidence',
        problem: 'a session that examines for a goal does not wait for an examination itself',
      },
    ])
    expect(where(issues(third(EXAMINED), examining))).toEqual(['A3.evidence'])
    expect(issues(third(ACTIVITY), examining)).toEqual([])
  })

  it('the goal of a job writes only the evidence that waits which the settings of its tenant let it: an examination costs model calls, a run again does not', () => {
    const job = (allowed: BodyContext['job']): BodyContext => ({
      attendance: 'unattended',
      job: allowed,
    })
    const EXAMINATION = {
      entry: 'A3',
      field: 'evidence',
      problem:
        'the settings of this tenant do not let the goal of a job use an examination: it costs model calls',
    }
    const RUN = {
      entry: 'A3',
      field: 'evidence',
      problem: 'the settings of this tenant do not let the goal of a job run a command again',
    }
    expect(issues(third(EXAMINED), job('rerun'))).toEqual([EXAMINATION])
    expect(issues(third(RERUN), job('rerun'))).toEqual([])
    expect(issues(third(EXAMINED), job('none'))).toEqual([EXAMINATION])
    expect(issues(third(RERUN), job('none'))).toEqual([RUN])
    for (const evidence of [EXAMINED, RERUN])
      expect(issues(third(evidence), job('all'))).toEqual([])
    for (const allowed of ['none', 'rerun', 'all'] as const)
      expect(issues(third(ACTIVITY), job(allowed))).toEqual([])
    expect(issues(third(EXAMINED), { attendance: 'unattended' })).toEqual([])
    expect(JOB_AWAITED).toEqual(['none', 'rerun', 'all'])
  })
})

describe('the examinations of the budget', () => {
  const limitsOf = (body: GoalBody) => body.exits.find(exit => exit.kind === 'budget')!.limits

  it('a body that waits for none gets no count of examinations', () => {
    expect(limitsOf(valid(HOME))).toEqual([{ amount: 30, unit: 'rounds' }])
  })

  it('a body with a run again or an examination gets the default count when it wrote none', () => {
    expect(limitsOf(valid(third(RERUN)))).toEqual([
      { amount: 30, unit: 'rounds' },
      { amount: DEFAULT_BUDGET_EXAMINATIONS, unit: 'examinations' },
    ])
    expect(limitsOf(valid(third(EXAMINED)))).toContainEqual({
      amount: DEFAULT_BUDGET_EXAMINATIONS,
      unit: 'examinations',
    })
  })

  it('the count it wrote is kept', () => {
    const draft = change(d => {
      ;(d.criteria[2] as Record<string, unknown>)['evidence'] = EXAMINED
      delete (d.criteria[2] as Record<string, unknown>)['pass']
      d.exits[0]!.limits = [
        { amount: 30, unit: 'rounds' },
        { amount: 2, unit: 'examinations' },
      ]
    })
    expect(limitsOf(valid(draft))).toEqual([
      { amount: 30, unit: 'rounds' },
      { amount: 2, unit: 'examinations' },
    ])
  })

  it('a count above what the settings allow is refused, and the default is cut to it', () => {
    const capped: BodyContext = { attendance: 'attended', maxExaminations: 2 }
    const draft = change(d => {
      ;(d.criteria[2] as Record<string, unknown>)['evidence'] = RERUN
      delete (d.criteria[2] as Record<string, unknown>)['pass']
      d.exits[0]!.limits = [
        { amount: 30, unit: 'rounds' },
        { amount: 5, unit: 'examinations' },
      ]
    })
    expect(issues(draft, capped)).toEqual([
      { entry: 'X1', field: 'limits', problem: 'the settings allow 2 examinations at most' },
    ])
    expect(limitsOf(valid(third(RERUN), capped))).toContainEqual({
      amount: 2,
      unit: 'examinations',
    })
  })
})

describe('how the new evidence reads in the text', () => {
  it('each way has its line, and an examination its method', () => {
    const body = valid(
      change(d => {
        d.criteria = [
          { statement: '交付时说明怎样打开', evidence: ACTIVITY },
          { statement: '验收脚本通过', evidence: RERUN },
          { statement: '方向键能控制蛇', evidence: EXAMINED },
        ]
        d.metrics = []
        d.exits = [d.exits[0]!]
      }),
    )
    const text = renderBody(body)
    expect(text).toContain('- [A1] 交付时说明怎样打开\n  - 证据: 这一轮做过的事\n')
    expect(text).toContain('- [A2] 验收脚本通过\n  - 证据: 复跑 `node accept.js lines`\n')
    expect(text).toContain(
      '- [A3] 方向键能控制蛇\n  - 证据: 查验\n  - 查法: 用浏览器打开 snake.html，按方向键走到食物\n',
    )
    expect(text).toContain(`  - 上限: 30 轮, ${String(DEFAULT_BUDGET_EXAMINATIONS)} 次查验\n`)
    expect(renderBody(body)).toBe(text)
  })
})
