// 成员预算与清理草稿：超预算生成草稿、六个标题齐全且顺序对；反复变红达到上限时标结构问题、不生成草稿。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  countRelapses,
  judgeMember,
  type BudgetValues,
  type MemberBaseline,
} from '../src/loop/budget.ts'
import {
  CLEANUP_SECTIONS,
  proposalPath,
  renderProposal,
  writeProposal,
} from '../src/loop/proposals.ts'
import type { MemberSnapshot, Snapshot } from '../src/loop/trend.ts'
import type { FunctionRow } from '../src/metrics/report.ts'

const MEMBER = 'packages/core/a'
const budget = {
  overAlert: { warn: 3, act: 6, release: 2 },
  risk: { warn: 12, act: 20, release: 10 },
  duplication: { warn: 5, act: 10, release: 4 },
  testsWithoutAssertions: { warn: 3, act: 8, release: 2 },
}
const values = (overrides: Partial<BudgetValues> = {}): BudgetValues => ({
  overAlert: 0,
  risk: 5,
  duplication: 0,
  testsWithoutAssertions: 0,
  ...overrides,
})

/** 一串快照，第 i 条里这个成员的超 alert 函数数是 `counts[i]`，总带位按同一组线算好。 */
function history(entries: readonly [number, MemberSnapshot['band']][]): Snapshot[] {
  return entries.map(([overAlert, band], index) => ({
    schema: 1,
    commit: `c${index}`,
    committedAt: '',
    recordedAt: '',
    branch: 'main',
    indicators: {},
    members: {
      [MEMBER]: { overAlert, risk: 5, duplication: 0, testsWithoutAssertions: 0, band },
    },
  }))
}

const judge = (
  current: BudgetValues,
  past: Snapshot[] = [],
  head = 'head',
  baseline: MemberBaseline = { kind: 'off' },
) =>
  judgeMember({
    member: MEMBER,
    values: current,
    budget,
    history: past,
    head,
    relapseLimit: 2,
    baseline,
  })

/** 基线快照里这个成员的条目：超 alert 的函数数取 `overAlert`，其余同 `values()`。 */
const entry = (overAlert: number | null): MemberSnapshot => ({
  overAlert,
  risk: 5,
  duplication: 0,
  testsWithoutAssertions: 0,
  band: 'normal',
})
const inBaseline = (overAlert: number | null): MemberBaseline => ({
  kind: 'snapshot',
  entry: entry(overAlert),
})

describe('成员预算', () => {
  it('任一项到处置线就超预算；没有数据的项不判', () => {
    const judged = judge(values({ overAlert: 7, duplication: undefined }))
    expect(judged.over).toEqual(['overAlert'])
    expect(judged.band).toBe('act')
    expect(judged.bands.duplication).toBeUndefined()
    expect(judge(values({ overAlert: 5 })).over).toEqual([])
  })

  it('上一次处于处置的项，低于处置线但高于解除线仍超预算（由历史值重放得出）', () => {
    expect(judge(values({ overAlert: 4 }), history([[7, 'act']])).over).toEqual(['overAlert'])
    expect(judge(values({ overAlert: 2 }), history([[7, 'act']])).over).toEqual([])
  })

  it('再进入处置的次数：处置 → 非处置 → 处置 记一次', () => {
    expect(countRelapses(['act', 'normal', 'act', 'warn', 'warn', 'act'])).toBe(2)
    expect(countRelapses(['normal', 'act', 'act'])).toBe(0)
  })

  it('反复变红达到上限：标结构问题；没达到的不标', () => {
    const relapsing = history([
      [7, 'act'],
      [1, 'normal'],
      [7, 'act'],
      [1, 'normal'],
    ])
    const judged = judge(values({ overAlert: 7 }), relapsing)
    expect(judged.relapses).toBe(2)
    expect(judged.structural).toBe(true)
    expect(judge(values({ overAlert: 7 }), relapsing.slice(0, 2)).structural).toBe(false)
  })

  it('当前提交自己的旧快照参与重放，但不算进再进入的次数', () => {
    const past = history([
      [7, 'act'],
      [1, 'normal'],
    ])
    const own = { ...past[1], commit: 'head' } as Snapshot
    expect(judge(values({ overAlert: 7 }), [...past, own], 'head').relapses).toBe(1)
  })
})

// 线：超 alert 的函数数 提醒 3／处置 6／解除 2。
describe('成员预算与基线比', () => {
  it('没有基线快照：照绝对线判，各项标未判（没有基线快照）', () => {
    const judged = judge(values({ overAlert: 4 }), [], 'head', { kind: 'none' })
    expect(judged.bands.overAlert).toBe('warn')
    expect(judged.band).toBe('warn')
    expect(judged.comparisons?.overAlert).toEqual({ result: 'unjudged', reason: '没有基线快照' })
  })

  it('新成员（基线快照里没有它）：照绝对线判，标新成员；与这一项为 null 的未判分开', () => {
    const fresh = judge(values({ overAlert: 4 }), [], 'head', {
      kind: 'snapshot',
      entry: undefined,
    })
    expect(fresh.bands.overAlert).toBe('warn')
    expect(fresh.comparisons?.overAlert).toEqual({ result: 'new' })
    const blank = judge(values({ overAlert: 4 }), [], 'head', inBaseline(null))
    expect(blank.bands.overAlert).toBe('warn')
    expect(blank.comparisons?.overAlert).toEqual({
      result: 'unjudged',
      reason: '基线快照里这一项没有数据',
    })
  })

  it('在基线里、绝对线是处置：仍是处置，另标好了、一样、差了（含滞回：低于处置线、高于解除线）', () => {
    expect(judge(values({ overAlert: 7 }), [], 'head', inBaseline(9))).toMatchObject({
      bands: { overAlert: 'act' },
      comparisons: { overAlert: { result: 'better', baseline: 9 } },
      over: ['overAlert'],
    })
    expect(judge(values({ overAlert: 7 }), [], 'head', inBaseline(7))).toMatchObject({
      bands: { overAlert: 'act' },
      comparisons: { overAlert: { result: 'same', baseline: 7 } },
    })
    const sticky = judge(values({ overAlert: 4 }), history([[7, 'act']]), 'head', inBaseline(3))
    expect(sticky).toMatchObject({
      bands: { overAlert: 'act' },
      comparisons: { overAlert: { result: 'worse', baseline: 3 } },
      over: ['overAlert'],
    })
  })

  it('在基线里、不是处置、比基线大：提醒（绝对线下是正常也一样）', () => {
    const judged = judge(values({ overAlert: 1 }), [], 'head', inBaseline(0))
    expect(judged.bands.overAlert).toBe('warn')
    expect(judged.band).toBe('warn')
    expect(judged.comparisons?.overAlert).toEqual({ result: 'worse', baseline: 0 })
    expect(judged.over).toEqual([])
  })

  it('在基线里、不是处置、不比基线大：正常，即使过了绝对的提醒线', () => {
    const same = judge(values({ overAlert: 5 }), [], 'head', inBaseline(5))
    expect(same.bands.overAlert).toBe('normal')
    expect(same.band).toBe('normal')
    expect(same.comparisons?.overAlert).toEqual({ result: 'same', baseline: 5 })
    const better = judge(values({ overAlert: 4 }), [], 'head', inBaseline(5))
    expect(better.bands.overAlert).toBe('normal')
    expect(better.comparisons?.overAlert).toEqual({ result: 'better', baseline: 5 })
  })

  it('不与基线比（baseline: false）：带位就是绝对线的，没有与基线比的结果', () => {
    const judged = judge(values({ overAlert: 4, risk: 13 }), history([[1, 'normal']]))
    expect(judged.bands).toEqual({
      overAlert: 'warn',
      risk: 'warn',
      duplication: 'normal',
      testsWithoutAssertions: 'normal',
    })
    expect(judged.band).toBe('warn')
    expect(judged).not.toHaveProperty('comparisons')
  })

  it('超预算的条件不受与基线比影响：同一串历史与取值，比与不比超的项一样', () => {
    const past = history([
      [7, 'act'],
      [3, 'warn'],
    ])
    const baselines: MemberBaseline[] = [
      { kind: 'none' },
      { kind: 'snapshot', entry: undefined },
      inBaseline(null),
      inBaseline(0),
      inBaseline(5),
      inBaseline(20),
    ]
    for (let overAlert = 0; overAlert <= 10; overAlert += 1)
      for (const prior of [[], past])
        for (const baseline of baselines) {
          const off = judge(values({ overAlert }), prior)
          const on = judge(values({ overAlert }), prior, 'head', baseline)
          expect(on.over).toEqual(off.over)
          expect(on.band === 'act').toBe(off.band === 'act')
        }
  })
})

describe('清理草稿', () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })

  const fn: FunctionRow = {
    path: `${MEMBER}/src/a.ts`,
    member: MEMBER,
    name: 'tangled',
    line: 12,
    endLine: 80,
    complexity: 31,
    score: 31,
    level: 'alert',
    grade: 1,
    changed: false,
  }

  it('六个标题齐全、顺序不变；条目带路径与行号；解除条件写出当前值与解除线；只写事实', () => {
    const judged = judge(values({ overAlert: 7, risk: 23.4 }))
    const text = renderProposal({
      budget: judged,
      lines: budget,
      commit: 'abc123',
      dirty: false,
      functions: [fn],
      clones: [
        {
          a: { path: `${MEMBER}/src/a.ts`, member: MEMBER, start: 3, end: 9 },
          b: { path: 'packages/core/b/src/b.ts', member: 'packages/core/b', start: 1, end: 7 },
          lines: 7,
          crossMember: true,
          bEndEstimated: false,
        },
      ],
      casesWithoutAssertions: [{ path: `${MEMBER}/tests/a.spec.ts`, line: 4, name: '只调用' }],
    })
    const headings = text.split('\n').filter(line => line.startsWith('## '))
    expect(headings).toEqual([...CLEANUP_SECTIONS])
    expect(text).toContain(`${MEMBER}/src/a.ts:12 tangled CC 31`)
    expect(text).toContain(`${MEMBER}/src/a.ts:3-9 ↔ packages/core/b/src/b.ts:1-7（7 行）`)
    expect(text).toContain(`${MEMBER}/tests/a.spec.ts:4 只调用`)
    expect(text).toContain('超 alert 的函数数：当前 7（处置）；解除线 2，须回落到它及以下')
    expect(text).toContain('风险值：当前 23.4（处置）；解除线 10')
    expect(text).toContain('`make test-affected`')
    expect(text).toContain('草稿：等负责人批准后才派发。')
    expect(text).toContain('`abc123`')
  })

  it('写到 <目录>/<成员路径斜杠换成 -->.md，同一成员覆盖旧稿', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loop-proposals-'))
    made.push(dir)
    const input = (commit: string) => ({
      budget: judge(values({ overAlert: 7 })),
      lines: budget,
      commit,
      dirty: false,
      functions: [],
      clones: [],
      casesWithoutAssertions: [],
    })
    const path = writeProposal(dir, input('first'))
    expect(path).toBe(proposalPath(dir, MEMBER))
    expect(path.endsWith('packages-core-a.md')).toBe(true)
    writeProposal(dir, input('second'))
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('`second`')
    expect(text).not.toContain('`first`')
  })
})
