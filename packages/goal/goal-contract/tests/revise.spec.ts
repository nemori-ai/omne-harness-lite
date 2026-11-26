import { describe, expect, it } from 'vitest'
import {
  renderBody,
  reviseBody,
  validateDraft,
  type BodyIssue,
  type GoalBody,
} from '@omne-harness/goal-contract'
import { HOME } from './fixtures.ts'

const attended = { attendance: 'attended' } as const
function home(): GoalBody {
  const checked = validateDraft(HOME, attended)
  if (checked.kind !== 'valid') throw new Error('fixture')
  return checked.body
}
function revised(body: GoalBody, changes: unknown): GoalBody {
  const result = reviseBody(body, changes, attended)
  if (result.kind !== 'valid') throw new Error(JSON.stringify(result.issues))
  return result.body
}
function refused(body: GoalBody, changes: unknown): string[] {
  const result = reviseBody(body, changes, attended)
  const issues: readonly BodyIssue[] = result.kind === 'invalid' ? result.issues : []
  return issues.map(issue => `${issue.entry ?? '-'}.${issue.field}`)
}
const rule = (statement: string) => ({ statement })

describe('a revision is a set of changes by number', () => {
  it('replaces the one entry named and leaves every other entry as it was', () => {
    const before = home()
    const after = revised(before, [
      {
        op: 'replace',
        id: 'M1',
        entry: { ...HOME.metrics![0], target: 600 },
      },
    ])
    expect(after.metrics[0]).toMatchObject({ id: 'M1', target: 600, floor: 1200 })
    expect(after.criteria).toEqual(before.criteria)
    expect(after.rules).toEqual(before.rules)
    expect(after.exits).toEqual(before.exits)
    expect(after.references).toEqual(before.references)
    expect(after.issued).toEqual(before.issued)
    const lines = (body: GoalBody) => renderBody(body).split('\n')
    const differing = lines(after).filter((line, index) => line !== lines(before)[index])
    expect(differing).toEqual(['  - 目标: 600'])
  })

  it('a new entry takes the next number of its section; a removed number is never used again', () => {
    const before = home()
    const dropped = revised(before, [{ op: 'remove', id: 'N2' }])
    expect(dropped.rules.map(entry => entry.id)).toEqual(['N1'])
    expect(dropped.issued.N).toBe(2)
    const added = revised(dropped, [
      { op: 'add', section: 'rules', entry: rule('不动数据库的表结构。') },
      { op: 'add', section: 'rules', entry: rule('不加新的依赖。') },
    ])
    expect(added.rules.map(entry => entry.id)).toEqual(['N1', 'N3', 'N4'])
    expect(added.issued.N).toBe(4)
  })

  it('changes the purpose and the method, which carry no number', () => {
    const after = revised(home(), [
      { op: 'purpose', text: '把首页与列表页的加载时间降下来。' },
      { op: 'method', lines: ['先量基线。', '一次只改一处。'] },
    ])
    expect(after.purpose).toBe('把首页与列表页的加载时间降下来。')
    expect(after.method).toEqual(['先量基线。', '一次只改一处。'])
    expect(revised(home(), [{ op: 'purpose', text: '  只降首页。 ' }]).purpose).toBe('只降首页。')
  })

  it('adds to every section that carries numbers, exits and references among them', () => {
    const after = revised(home(), [
      {
        op: 'add',
        section: 'exits',
        entry: { statement: '测试环境停用', kind: 'condition', deliver: '改动', counts: 'failure' },
      },
      {
        op: 'add',
        section: 'references',
        entry: { statement: '压测的做法', at: 'docs/perf/bench.md', readWhen: '量之前' },
      },
    ])
    expect(after.exits.at(-1)).toMatchObject({ id: 'X4', kind: 'condition' })
    expect(after.references.at(-1)).toMatchObject({ id: 'R2', at: 'docs/perf/bench.md' })
  })

  it('gets the default budget back, under a new number, when the budget exit is removed', () => {
    const after = revised(home(), [{ op: 'remove', id: 'X1' }])
    expect(after.exits.map(entry => [entry.id, entry.kind])).toEqual([
      ['X2', 'good-enough'],
      ['X3', 'person'],
      ['X4', 'budget'],
    ])
    expect(after.exits.at(-1)?.limits).toEqual([{ amount: 50, unit: 'rounds' }])
    expect(after.issued.X).toBe(4)
  })
})

describe('a revision that does not stand changes nothing and says why', () => {
  it.each([
    ['an empty set', [], ['-.changes']],
    ['not a set of changes', { op: 'remove', id: 'A1' }, ['-.changes']],
    ['a number that is not there', [{ op: 'remove', id: 'A9' }], ['A9.id']],
    [
      'the same entry named twice',
      [
        { op: 'remove', id: 'N1' },
        { op: 'replace', id: 'N1', entry: rule('不改公共接口与事件名。') },
      ],
      ['N1.id'],
    ],
    ['an operation nobody knows', [{ op: 'pause' }], ['#1.op']],
    ['a change without the number it needs', [{ op: 'remove' }], ['#1.id']],
    ['something that is no change at all', [5], ['#1.op']],
    [
      'a new entry with a field nobody knows',
      [{ op: 'add', section: 'rules', entry: { statement: '不改接口。', weight: 3 } }],
      ['#1.weight'],
    ],
    [
      'a replacement with a field nobody knows, by its number',
      [{ op: 'replace', id: 'N1', entry: { statement: '不改接口。', weight: 3 } }],
      ['N1.weight'],
    ],
    ['a new entry that is no entry', [{ op: 'add', section: 'rules', entry: 5 }], ['#1.entry']],
    ['a number with a letter no section has', [{ op: 'remove', id: 'ZA1' }], ['#1.id']],
    ['a number with something after it', [{ op: 'remove', id: 'A1x' }], ['#1.id']],
    ['a number of two digits that is not there', [{ op: 'remove', id: 'A10' }], ['A10.id']],
    [
      'a new entry of the wrong shape',
      [{ op: 'add', section: 'metrics', entry: { statement: '首屏', direction: 'lower' } }],
      ['#1.measure', '#1.target'],
    ],
    [
      'a replacement of the wrong shape, by its number',
      [{ op: 'replace', id: 'X1', entry: { ...HOME.exits![0], counts: 'maybe' } }],
      ['X1.counts'],
    ],
    [
      'removing a metric a criterion still measures by',
      [{ op: 'remove', id: 'M1' }],
      ['A1.evidence', 'X2.by'],
    ],
    [
      'removing every criterion',
      [
        { op: 'remove', id: 'A1' },
        { op: 'remove', id: 'A2' },
        { op: 'remove', id: 'A3' },
      ],
      ['-.criteria', 'X2.by'],
    ],
    ['a purpose of nothing', [{ op: 'purpose', text: ' ' }], ['-.purpose']],
    [
      'a body grown past four thousand characters',
      [{ op: 'add', section: 'rules', entry: rule('规'.repeat(4000)) }],
      ['-.body'],
    ],
  ])('%s', (_name, changes, expected) => {
    const before = home()
    expect(refused(before, changes)).toEqual(expected)
  })

  it('tells a number that is not there from one named twice', () => {
    const problems = (changes: unknown) => {
      const result = reviseBody(home(), changes, attended)
      return result.kind === 'invalid' ? result.issues.map(issue => issue.problem) : []
    }
    expect(problems([{ op: 'remove', id: 'A9' }])).toEqual(['no such entry'])
    const twice = [
      { op: 'replace', id: 'N1', entry: rule('不改公共接口与事件名。') },
      { op: 'replace', id: 'N1', entry: rule('不改公共接口。') },
    ]
    expect(problems(twice)).toEqual(['named twice'])
  })

  it('checks the evidence against the session: a person cannot confirm where nobody is', () => {
    const change = [
      {
        op: 'add',
        section: 'criteria',
        entry: { statement: '人看过了', evidence: { kind: 'person' } },
      },
    ]
    expect(reviseBody(home(), change, attended).kind).toBe('valid')
    const result = reviseBody(home(), change, { attendance: 'unattended' })
    expect(result).toMatchObject({ kind: 'invalid', issues: [{ entry: 'A4', field: 'evidence' }] })
  })
})
