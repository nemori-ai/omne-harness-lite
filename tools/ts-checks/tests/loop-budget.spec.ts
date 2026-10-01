// 成员预算与清理草稿：超预算生成草稿、六个标题齐全且顺序对；反复变红达到上限时标结构问题、不生成草稿。
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { countRelapses, judgeMember, type BudgetValues } from '../src/loop/budget.ts'
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

const judge = (current: BudgetValues, past: Snapshot[] = [], head = 'head') =>
  judgeMember({ member: MEMBER, values: current, budget, history: past, head, relapseLimit: 2 })

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
