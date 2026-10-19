// 两处「与基线比」的判法，走 `pnpm run loop:status` 同一个入口（runLoopStatus），用临时仓库：
// 成员预算——基线里有的成员只在变差时进提醒、新成员照绝对线；要解释的函数——只留比基线涨了的、
// 新出现的与拿不准的，没变差的另计。线在这里给死，不随仓库配置里负责人调的数值变。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExplainedFunction } from '../src/loop/against-base.ts'
import type { ItemComparison } from '../src/loop/budget.ts'
import { readLoopConfig, type LoopConfig } from '../src/loop/config.ts'
import { baseFilesOf, judgeAgainstBase, parseNameStatus } from '../src/loop/function-baseline.ts'
import { runLoopStatus } from '../src/loop/run.ts'
import type { FunctionRow } from '../src/metrics/report.ts'
import {
  commit,
  git,
  removeTemporaries,
  repository,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

/** 圈复杂度 1 + `branches` 的函数；`tag` 让各处文本不同。 */
const routed = (name: string, branches: number, tag = name) =>
  `export function ${name}(x: number): string {\n${Array.from(
    { length: branches },
    (_, i) => `  if (x === ${i}) return '${tag}${i}'`,
  ).join('\n')}\n  return ''\n}\n`

/** `count` 个超 alert（圈复杂度 15）的函数。 */
const overAlert = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, n) => routed(`${prefix}${n}`, 14)).join('\n')

const LINES = { warn: 1000, act: 2000, release: 500 }

/**
 * 只有「超 alert 的函数数」有实际的线（提醒 2／处置 5／解除 1），其余几项的线高到碰不到；
 * 重复代码关掉，免得几个相似的函数让重复行占比也进「变差」。
 */
function config(baseline: boolean): LoopConfig {
  const base = readLoopConfig()
  return {
    ...base,
    sensors: { ...base.sensors, duplication: { ...base.sensors.duplication, enabled: false } },
    memberBudget: {
      overAlert: { warn: 2, act: 5, release: 1 },
      risk: LINES,
      duplication: LINES,
      testsWithoutAssertions: LINES,
    },
    budgetBaseline: baseline,
  }
}

interface Status {
  readonly members: readonly {
    readonly member: string
    readonly band: string
    readonly bands: Record<string, string>
    readonly comparisons?: Record<string, ItemComparison>
  }[]
  readonly explain: {
    readonly functions: readonly ExplainedFunction[]
    readonly functionsNotWorse: readonly ExplainedFunction[]
  }
}

async function status(
  root: string,
  home: string,
  loopConfig: LoopConfig,
  base?: string,
): Promise<{ lines: readonly string[]; json: Status }> {
  const out = join(temporaryDirectory('loop-baseline-out-'), 'status')
  const result = await runLoopStatus(
    { root, out, strict: false, snapshot: false, ...(base === undefined ? {} : { base }) },
    {
      OMNE_METRICS_HOME: home,
      OMNE_ACCEPTANCE_LEDGER_HOME: temporaryDirectory('loop-baseline-ledgers-'),
    },
    loopConfig,
  )
  return {
    lines: result.lines,
    json: JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')) as Status,
  }
}

// 建仓与量都要起 git 子进程；全量检查满载时会超过默认的 5 秒。
describe('成员预算与基线比（入口）', { timeout: 120_000 }, () => {
  /**
   * 主线上：a 有 2 个超 alert 的函数（绝对线提醒）、b 有 3 个（提醒）、d 有 6 个（处置）；
   * 在主线头上跑一次写下基线快照。之后在工作分支上：a 加到 3 个，b、d 不动，新成员 c 有 2 个。
   */
  async function budgets(): Promise<{ root: string; home: string }> {
    const root = repository()
    const home = temporaryDirectory('loop-baseline-home-')
    write(root, 'packages/core/a/src/a.ts', overAlert('a', 2))
    write(root, 'packages/core/b/src/b.ts', overAlert('b', 3))
    write(root, 'packages/core/d/src/d.ts', overAlert('d', 6))
    commit(root, 'members')
    const onMain = await status(root, home, config(true))
    expect(onMain.lines).toContainEqual(expect.stringContaining('已写入这个提交的快照'))
    git(root, 'checkout', '-q', '-b', 'someone/work')
    write(root, 'packages/core/a/src/a.ts', overAlert('a', 3))
    write(root, 'packages/core/c/src/c.ts', overAlert('c', 2))
    commit(root, 'work')
    return { root, home }
  }

  it('变差的进提醒并列出基线值 → 现值；没变差的回到正常；新成员照绝对线并单列；处置照旧', async () => {
    const { root, home } = await budgets()
    const { lines, json } = await status(root, home, config(true), 'main')
    const member = (path: string) => json.members.find(entry => entry.member === path)

    expect(member('packages/core/a')).toMatchObject({
      band: 'warn',
      comparisons: { overAlert: { result: 'worse', baseline: 2 } },
    })
    expect(member('packages/core/b')).toMatchObject({
      band: 'normal',
      bands: { overAlert: 'normal' },
      comparisons: { overAlert: { result: 'same', baseline: 3 } },
    })
    expect(member('packages/core/c')).toMatchObject({
      band: 'warn',
      comparisons: { overAlert: { result: 'new' } },
    })
    expect(member('packages/core/d')).toMatchObject({
      band: 'act',
      comparisons: { overAlert: { result: 'same', baseline: 6 } },
    })

    const section = lines.slice(lines.indexOf('## 超预算的成员'))
    expect(section).toContain(
      '  packages/core/d：超 alert 的函数数 6（与基线比 一样，基线 6） → 草稿 packages-core-d.md',
    )
    expect(section).toContain('  比基线变差的成员 1 个：')
    expect(section).toContain('    packages/core/a：超 alert 的函数数 2 → 3（提醒）')
    expect(section).toContain('  新成员过了提醒线的 1 个：')
    expect(section).toContain('    packages/core/c：超 alert 的函数数 2（提醒）')
    expect(section.join('\n')).not.toContain('packages/core/b')
  })

  it('没有基线快照：成员预算照绝对线判，那一段写未判而不是无', async () => {
    const { root } = await budgets()
    const empty = temporaryDirectory('loop-baseline-empty-')
    const { lines, json } = await status(root, empty, config(true), 'main')
    expect(lines).toContain('  比基线变差的成员：未判：没有基线快照')
    expect(json.members.find(entry => entry.member === 'packages/core/b')).toMatchObject({
      band: 'warn',
      comparisons: { overAlert: { result: 'unjudged', reason: '没有基线快照' } },
    })
  })

  it('配置里不比（baseline: false）：带位照绝对线，没有那一段，也不带与基线比的结果', async () => {
    const { root, home } = await budgets()
    const { lines, json } = await status(root, home, config(false), 'main')
    expect(json.members.find(entry => entry.member === 'packages/core/b')).toMatchObject({
      band: 'warn',
    })
    expect(json.members.every(entry => entry.comparisons === undefined)).toBe(true)
    expect(lines.join('\n')).not.toMatch(/比基线变差的成员|新成员过了提醒线的/u)
    expect(lines).toContain('  packages/core/d：超 alert 的函数数 6 → 草稿 packages-core-d.md')
  })
})

describe('要解释的函数与基线比（入口）', { timeout: 120_000 }, () => {
  it('没变差的拿掉并计数；涨了的、新函数、新文件留下；改名的文件对回改名前；同名对不上的照留', async () => {
    const root = repository()
    const home = temporaryDirectory('loop-baseline-home-')
    const member = 'packages/core/a/src'
    write(root, `${member}/stay.ts`, routed('stay', 14))
    write(root, `${member}/grow.ts`, routed('grow', 14))
    write(root, `${member}/old.ts`, `${routed('moved', 14)}\nexport const kept = 1\n`)
    const twin = (tag: string) =>
      `  {\n    run(x: number): string {\n${Array.from({ length: 14 }, (_, i) => `      if (x === ${i}) return '${tag}${i}'`).join('\n')}\n      return ''\n    },\n  },`
    write(root, `${member}/twins.ts`, `export const handlers = [\n${twin('p')}\n${twin('q')}\n]\n`)
    const base = commit(root, 'base')

    git(root, 'checkout', '-q', '-b', 'someone/work')
    // 改名（已提交）并改一行、不加分支：git 认作改名，对回 old.ts。
    git(root, 'mv', `${member}/old.ts`, `${member}/moved.ts`)
    write(
      root,
      `${member}/moved.ts`,
      `${routed('moved', 14).replace("return ''", "return 'z'")}\nexport const kept = 1\n`,
    )
    commit(root, 'rename')
    // 未提交：改一行不加分支、加一个分支加一个新函数、一个新文件、改同名的其中一个。
    write(root, `${member}/stay.ts`, routed('stay', 14).replace("return ''", "return 'z'"))
    write(root, `${member}/grow.ts`, `${routed('grow', 15)}\n${routed('fresh', 14)}`)
    write(root, `${member}/brand.ts`, routed('brand', 14))
    write(
      root,
      `${member}/twins.ts`,
      `export const handlers = [\n${twin('p')}\n${twin('q').replace("return ''", "return 'z'")}\n]\n`,
    )

    const { lines, json } = await status(root, home, config(true), base)
    const kept = json.explain.functions.map(row => [
      row.path.split('/').pop(),
      row.name,
      row.againstBase,
    ])
    expect(kept).toEqual(
      expect.arrayContaining([
        ['grow.ts', 'grow', { kind: 'worse', baseline: 15 }],
        ['grow.ts', 'fresh', { kind: 'new', reason: 'new-function' }],
        ['brand.ts', 'brand', { kind: 'new', reason: 'new-file' }],
        [
          'twins.ts',
          'run',
          { kind: 'unsure', reason: '同一文件里同名函数现在 2 个、基线上 2 个，对不上' },
        ],
      ]),
    )
    expect(kept.map(([path, name]) => `${path} ${name}`).sort()).toEqual([
      'brand.ts brand',
      'grow.ts fresh',
      'grow.ts grow',
      'twins.ts run',
      'twins.ts run',
    ])
    expect(
      json.explain.functionsNotWorse.map(row => [
        row.path.split('/').pop(),
        row.name,
        row.againstBase,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['stay.ts', 'stay', { kind: 'not-worse', baseline: 15 }],
        ['moved.ts', 'moved', { kind: 'not-worse', baseline: 15 }],
      ]),
    )
    expect(json.explain.functionsNotWorse).toHaveLength(2)

    expect(lines).toContain('  变更函数里超过 warn、且比基线涨了或新出现的 5 条：')
    expect(lines).toContain(`    ${member}/grow.ts:1 grow CC 16：原 15 → 现 16`)
    expect(lines).toContain(`    ${member}/brand.ts:1 brand CC 15：新出现（新文件）`)
    expect(lines).toContain('  另有 2 个碰过的函数原来就在线外、这次没有变差（见 status.json）')
  })
})

describe('要解释的函数与基线比（判法）', () => {
  const row = (over: Partial<FunctionRow>): FunctionRow => ({
    path: 'packages/core/a/src/x.ts',
    member: 'packages/core/a',
    name: 'f',
    line: 1,
    endLine: 20,
    complexity: 15,
    score: 15,
    level: 'alert',
    grade: 1,
    changed: true,
    ...over,
  })

  it('基线文本取不到：照留并注明原因；<module> 在基线上没有单元按 1 算', () => {
    const missing = row({})
    const module = row({ path: 'packages/core/a/src/m.ts', name: '<module>', complexity: 14 })
    const { kept, notWorse } = judgeAgainstBase(
      [missing, module],
      [missing, module],
      new Map([
        [missing.path, { kind: 'unreadable', reason: '基线文本取不到' } as const],
        [module.path, { kind: 'text', path: module.path, text: 'export const a = 1\n' } as const],
      ]),
    )
    expect(kept.map(entry => entry.againstBase)).toEqual([
      { kind: 'unsure', reason: '基线文本取不到' },
      { kind: 'worse', baseline: 1 },
    ])
    expect(notWorse).toEqual([])
  })

  it('改名、复制、删除与修改：只留现在还在的路径，改名的对回原路径，新增与复制出来的不在其中', () => {
    const output = [
      'M',
      'a.ts',
      'R087',
      'old.ts',
      'new.ts',
      'A',
      'b.ts',
      'D',
      'gone.ts',
      'C075',
      'a.ts',
      'copy.ts',
      '',
    ].join('\u0000')
    expect([...parseNameStatus(output)]).toEqual([
      ['a.ts', 'a.ts'],
      ['new.ts', 'old.ts'],
    ])
  })

  it('没有候选函数时不跑 git（给一个不存在的基线也不报错）', () => {
    const root = repository()
    expect(baseFilesOf(root, 'no-such-commit', new Set()).size).toBe(0)
    expect(() => baseFilesOf(root, 'no-such-commit', new Set(['x.ts']))).toThrow()
  })
})
