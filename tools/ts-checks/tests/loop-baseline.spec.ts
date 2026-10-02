// 「与基线比」的判法，走 `make loop-status` 同一个入口（runLoopStatus），用临时仓库：
// 成员预算——基线里有的成员只在变差时进提醒、新成员照绝对线。线在这里给死，不随仓库配置里负责人调的数值变。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ItemComparison } from '../src/loop/budget.ts'
import { readLoopConfig, type LoopConfig } from '../src/loop/config.ts'
import { runLoopStatus } from '../src/loop/run.ts'
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
