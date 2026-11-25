import { describe, expect, it } from 'vitest'
import type { GoalStateView, GoalView } from '@omne-harness/goal-protocol'
import {
  amountKey,
  bodyOf,
  changesOf,
  editsOf,
  settlingExit,
  standingOf,
  treeOf,
} from '../src/model/panel.ts'

const BODY = {
  purpose: '把首页的加载时间降下来',
  criteria: [
    { id: 'A1', statement: '用例全过', evidence: { kind: 'command', command: 'pnpm test' } },
  ],
  metrics: [],
  rules: [{ id: 'N1', statement: '不改公共接口。' }],
  exits: [
    {
      id: 'X1',
      statement: '预算用尽',
      kind: 'budget',
      limits: [
        { amount: 20, unit: 'rounds' },
        { amount: 5, unit: 'usd' },
      ],
      deliver: '当前的结果',
      counts: 'failure',
    },
  ],
  references: [{ id: 'R1', where: 'docs/perf.md' }],
  method: ['先量再改'],
  issued: { A: 1, N: 1, X: 1 },
}
const goal = { body: treeOf(BODY) } as unknown as GoalView
const state = (change: Partial<GoalStateView>): GoalStateView => ({
  status: 'active',
  attendance: 'attended',
  generation: 1,
  revision: 1,
  rounds: 3,
  pause: null,
  outcome: null,
  ...change,
})

describe('the body of a goal as the panel edits it', () => {
  it('is its purpose and its numbered entries by section, with one field for each statement and each limit', () => {
    const body = bodyOf(goal)
    expect(body.purpose).toBe(BODY.purpose)
    expect(
      body.sections.map(section => [section.name, section.entries.map(entry => entry.id)]),
    ).toEqual([
      ['criteria', ['A1']],
      ['metrics', []],
      ['rules', ['N1']],
      ['exits', ['X1']],
    ])
    expect(editsOf(body)).toEqual({
      purpose: BODY.purpose,
      statements: { A1: '用例全过', N1: '不改公共接口。', X1: '预算用尽' },
      amounts: { 'X1/0': '20', 'X1/1': '5' },
    })
  })

  it('is an empty form for a body that is not what the panel knows, not a failure', () => {
    const odd = bodyOf({ body: treeOf(['not', 'a', 'body']) } as unknown as GoalView)
    expect(odd).toEqual({
      purpose: '',
      sections: bodyOf(goal).sections.map(s => ({ ...s, entries: [] })),
    })
  })
})

describe('what the form changed, as a revision by number', () => {
  const body = bodyOf(goal)
  const edits = editsOf(body)

  it('is nothing to send when nothing differs', () => {
    expect(changesOf(body, edits)).toEqual({ kind: 'problem', problem: '没有改动' })
    const spaced = {
      ...edits,
      purpose: ` ${edits.purpose} `,
      statements: { ...edits.statements, N1: '不改公共接口。 ' },
    }
    expect(changesOf(body, spaced)).toEqual({ kind: 'problem', problem: '没有改动' })
  })

  it('raises one limit of the budget by replacing that exit whole, without its number and with every other field as it was', () => {
    const raised = { ...edits, amounts: { ...edits.amounts, [amountKey('X1', 0)]: ' 30 ' } }
    const { id: _id, ...exit } = BODY.exits[0]!
    expect(changesOf(body, raised)).toEqual({
      kind: 'changes',
      changes: [
        {
          op: 'replace',
          id: 'X1',
          entry: {
            ...exit,
            limits: [
              { amount: 30, unit: 'rounds' },
              { amount: 5, unit: 'usd' },
            ],
          },
        },
      ],
    })
  })

  it('names the purpose by name and each restated entry by its number, in the order of the body', () => {
    const more = {
      ...edits,
      purpose: '只降首页',
      statements: { ...edits.statements, A1: '端到端用例全过', N1: '不改公共接口，也不改路由。' },
    }
    const found = changesOf(body, more)
    if (found.kind !== 'changes') throw new Error(found.problem)
    expect(found.changes).toEqual([
      { op: 'purpose', text: '只降首页' },
      {
        op: 'replace',
        id: 'A1',
        entry: { statement: '端到端用例全过', evidence: BODY.criteria[0]!.evidence },
      },
      { op: 'replace', id: 'N1', entry: { statement: '不改公共接口，也不改路由。' } },
    ])
  })

  it.each(['0', '-3', '2.5', 'ten', ''])('does not send a limit written as %j', amount => {
    const bad = { ...edits, amounts: { ...edits.amounts, 'X1/1': amount } }
    expect(changesOf(body, bad)).toEqual({ kind: 'problem', problem: 'X1 的数要写成正整数' })
  })
})

describe('how a goal stands', () => {
  it.each([
    [state({}), 'working', null],
    [state({ status: 'paused', pause: { by: 'person' } }), 'paused', '你停的'],
    [
      state({ status: 'paused', pause: { by: 'verdict', row: 7, exit: null } }),
      'paused',
      '连续几次没有进展',
    ],
    [
      state({ status: 'paused', pause: { by: 'verdict', row: 8, exit: null } }),
      'paused',
      '判定答不出',
    ],
    [
      state({ status: 'paused', pause: { by: 'verdict', row: 6, exit: null } }),
      'paused',
      '遇到了正文没写到的阻碍',
    ],
    [
      state({ status: 'paused', pause: { by: 'verdict', row: 5, exit: 'X2' } }),
      'paused',
      '一条要人定的退出成立了',
    ],
    [state({ status: 'settled', outcome: { kind: 'achieved' } }), 'completed', '达成'],
    [
      state({ status: 'settled', outcome: { kind: 'exit', exit: 'X1', counts: 'failure' } }),
      'failed',
      '照退出 X1 收场，算没做成',
    ],
    [
      state({ status: 'settled', outcome: { kind: 'exit', exit: 'X3', counts: 'success' } }),
      'completed',
      '照退出 X3 收场，算成功',
    ],
    [state({ status: 'settled', outcome: { kind: 'stalled' } }), 'failed', '停滞'],
    [state({ status: 'settled', outcome: { kind: 'unattainable' } }), 'failed', '无法达成'],
    [state({ status: 'settled', outcome: { kind: 'judge-unavailable' } }), 'failed', '判定不可用'],
    [state({ status: 'settled', outcome: { kind: 'cancelled' } }), 'cancelled', null],
    [state({ status: 'settled', outcome: { kind: 'aborted' } }), 'stopped', '被建它的一方中止'],
  ] as const)(
    '%#: a state of the shared table and what is particular beside it',
    (given, word, detail) => {
      expect(standingOf(given)).toEqual({ state: word, detail })
    },
  )

  it('never reads an end by an exit as achieved', () => {
    for (const counts of ['success', 'failure'] as const)
      expect(
        standingOf(state({ status: 'settled', outcome: { kind: 'exit', exit: 'X1', counts } }))
          .detail,
      ).not.toContain('达成')
  })

  it('offers settling by an exit only for the exit whose coming about paused the goal', () => {
    expect(
      settlingExit(state({ status: 'paused', pause: { by: 'verdict', row: 5, exit: 'X2' } })),
    ).toBe('X2')
    expect(
      settlingExit(state({ status: 'paused', pause: { by: 'verdict', row: 7, exit: null } })),
    ).toBeNull()
    expect(settlingExit(state({ status: 'paused', pause: { by: 'person' } }))).toBeNull()
    expect(settlingExit(state({}))).toBeNull()
  })
})
