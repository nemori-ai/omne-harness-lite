// 传感器金丝雀：夹具里每个传感器各种了一处已知违规（见 fixtures/loop-canary/README.md），
// 走与 `make loop-status STRICT=1` 相同的入口，逐项断言每个传感器都报出了种下的那一处。
// 哪个传感器悄悄失灵（读错目录、范围漏了、算法改坏），这里会指名变红。
import type { DependencyFinding } from '../src/deps/graph.ts'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runLoopStatus } from '../src/loop/run.ts'
import { coordinates } from '../src/core/git.ts'
import type { LedgerFile } from '../src/testing/ledger.ts'
import {
  commit,
  copyCanary,
  git,
  removeTemporaries,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(removeTemporaries)

const PRODUCT = '.meta_harness/design/product'
const route = `export function route(x: number): number {\n${Array.from(
  { length: 14 },
  (_, i) => `  if (x === ${i}) return ${i}`,
).join('\n')}\n  return -1\n}\n`

/** 夹具建成的仓库：要 git 历史的几项（一起改、rev 翻动、基线之后的改动、并行工作树）在这里造。 */
function canary(): { root: string; base: string } {
  const root = temporaryDirectory('loop-canary-')
  git(root, 'init', '-q')
  git(root, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  copyCanary(root)
  write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n  - 'apps/*'\n")
  commit(root, 'canary')
  // 一起改却分属两组：core/a 与 infra/b 再连着一起改四次。
  for (let round = 1; round <= 4; round += 1) {
    for (const path of ['packages/core/a/src/index.ts', 'packages/infra/b/src/index.ts'])
      write(root, path, `${readFileSync(join(root, path), 'utf8')}// 第 ${round} 次一起改\n`)
    commit(root, `together ${round}`)
  }
  // rev 翻动：建 topic 时的 revision 1 算一次，再升三次。
  const readme = `${PRODUCT}/canary/README.md`
  for (let revision = 2; revision <= 4; revision += 1) {
    const text = readFileSync(join(root, readme), 'utf8')
    write(root, readme, text.replace(/^revision: \d+$/mu, `revision: ${revision}`))
    commit(root, `rev ${revision}`)
  }
  const pluginPath = 'packages/core/a/src/plugin.ts'
  const pluginText = readFileSync(join(root, pluginPath), 'utf8')
  write(root, pluginPath, pluginText.replace("inject: ['canaryUndeclared']", 'inject: []'))
  const base = commit(root, 'before static dependency addition')
  write(root, pluginPath, pluginText)
  // 基线之后：一个超 alert 的函数、一条新的跨成员依赖。
  write(root, 'apps/cli/src/route.ts', route)
  write(
    root,
    'apps/cli/src/extra.ts',
    "import { a } from '@omne-harness/a'\n\nexport const extra = a\n",
  )
  commit(root, 'after base')
  // 验收耗时：apps/cli 有 acceptance 脚本；它的慢记录在 strictRun 里种进账本。
  write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*/*'\n  - 'apps/*'\n")
  write(
    root,
    'apps/cli/package.json',
    `${JSON.stringify({ name: '@omne-harness/cli', scripts: { test: 'vitest run', acceptance: 'vitest run --config acceptance/vitest.config.ts' } })}\n`,
  )
  commit(root, 'accepting member')
  // 并行工作树：两棵各自改 model/m（未提交也算）。
  for (const name of ['w1', 'w2']) {
    const tree = join(temporaryDirectory('loop-canary-tree-'), name)
    git(root, 'worktree', 'add', '-q', '-b', `someone/${name}`, tree)
    write(tree, 'packages/model/m/src/index.ts', `export const m = '${name}'\n`)
  }
  return { root, base }
}

interface Status {
  readonly hardLines: {
    readonly direction: readonly Pick<DependencyFinding, 'rule' | 'edges'>[]
    readonly cycles: readonly Pick<DependencyFinding, 'kind' | 'edges'>[]
    readonly sensors: { readonly status: string; readonly silent: readonly { sensor: string }[] }
  }
  readonly explain: {
    readonly functions: readonly { path: string; name: string; level: string }[]
  }
  readonly indicators: readonly { readonly id: string; readonly band?: string }[]
  readonly sensors: Record<string, { readonly status: string; readonly data?: unknown }>
}

const SLOW = 'apps/cli/acceptance/PF-001.slow.acceptance.ts'

/** 在验收账本里种一次「跑全了、但一份 50 秒、整次 130 秒」的运行，落在当前提交那一格。 */
function seedSlowAcceptance(root: string, ledgers: string): void {
  const at = coordinates(root, undefined)
  const ledger: LedgerFile = {
    meta: {
      script: 'acceptance',
      tier: 'all',
      head: at.head,
      branch: at.branch,
      dirty: at.dirty,
      base: null,
      startedAt: '2026-10-02T00:00:00.000Z',
      parallel: { memberConcurrency: 2, vitestMaxWorkers: 4 },
      cores: 8,
      plan: null,
      members: ['apps/cli'],
      wallSeconds: 130,
    },
    members: [
      {
        member: 'apps/cli',
        exitCode: 0,
        wallSeconds: 128,
        files: 2,
        tests: 3,
        skipped: 0,
        failed: 0,
        fileSeconds: 55,
      },
    ],
    files: [
      {
        member: 'apps/cli',
        file: SLOW,
        seconds: 50,
        tests: 2,
        slowTests: 0,
        fastSeconds: 50,
        longestSeconds: 30,
      },
      {
        member: 'apps/cli',
        file: 'apps/cli/acceptance/PF-001.quick.acceptance.ts',
        seconds: 5,
        tests: 1,
        slowTests: 0,
        fastSeconds: 5,
        longestSeconds: 5,
      },
    ],
    nearTimeout: [],
    fastOverBudget: [],
    failures: [],
  }
  write(
    ledgers,
    `${at.shortHead}${at.dirty ? '-dirty' : ''}/20261002-000000/ledger.json`,
    JSON.stringify(ledger),
  )
}

async function strictRun(root: string, base: string) {
  const out = join(temporaryDirectory('loop-canary-out-'), 'status')
  const home = temporaryDirectory('loop-canary-home-')
  const ledgers = temporaryDirectory('loop-canary-ledgers-')
  seedSlowAcceptance(root, ledgers)
  const result = await runLoopStatus(
    { root, base, out, strict: true, snapshot: false },
    { OMNE_METRICS_HOME: home, OMNE_ACCEPTANCE_LEDGER_HOME: ledgers },
  )
  const status = JSON.parse(readFileSync(join(out, 'status.json'), 'utf8')) as Status
  return { result, status }
}

const dataOf = (status: Status, sensor: string): unknown => {
  const reading = status.sensors[sensor]
  expect(reading?.status, `sensors.${sensor} 没数据`).toBe('data')
  return reading?.data
}

// 建仓要起几十次 git 子进程，全量检查满载时会超过默认的 5 秒。
describe('传感器金丝雀', { timeout: 120_000 }, () => {
  it('每个传感器都报出了种下的那一处；严格模式因硬线被破判失败', async () => {
    const { root, base } = canary()
    const { result, status } = await strictRun(root, base)

    expect(status.hardLines.direction).toContainEqual(
      expect.objectContaining({
        rule: 'shared-stays-pure',
        edges: [{ from: 'packages/common/s', to: 'packages/infra/b' }],
      }),
    )
    expect(
      status.hardLines.cycles
        .filter(finding => finding.kind === 'member-cycle')
        .flatMap(finding => finding.edges.map(edge => edge.from))
        .sort(),
    ).toEqual(['packages/session/p', 'packages/session/q'])
    expect(status.explain.functions).toContainEqual(
      expect.objectContaining({ path: 'apps/cli/src/route.ts', name: 'route', level: 'alert' }),
    )
    expect(dataOf(status, 'architecture')).toMatchObject({
      facts: expect.arrayContaining([
        expect.objectContaining({
          member: 'packages/core/a',
          plugin: 'a',
          kind: 'injects',
          key: 'canaryUndeclared',
        }),
      ]),
      delta: {
        status: 'data',
        data: {
          added: expect.arrayContaining([
            expect.objectContaining({ kind: 'injects', key: 'canaryUndeclared' }),
          ]),
        },
      },
    })
    expect(dataOf(status, 'stability')).toEqual([
      expect.objectContaining({ from: 'packages/model/m', to: 'packages/model/n' }),
    ])
    expect(dataOf(status, 'cochange')).toMatchObject({
      pairs: [{ a: 'packages/core/a', b: 'packages/infra/b', together: 5 }],
    })
    type End = { readonly path: string }
    const clones = (dataOf(status, 'duplication') as { clones: { a: End; b: End }[] }).clones
    // 两端谁先谁后取决于扫描次序，只比两端是哪两个文件。
    expect(clones.map(clone => [clone.a.path, clone.b.path].sort())).toContainEqual([
      'packages/model/m/src/copy.ts',
      'packages/model/n/src/copy.ts',
    ])
    expect(dataOf(status, 'assertions')).toEqual([
      expect.objectContaining({ path: 'packages/core/a/tests/a.spec.ts', name: '不断言' }),
    ])
    expect(dataOf(status, 'newEdges')).toMatchObject({
      added: [{ from: 'apps/cli', to: 'packages/core/a', site: { path: 'apps/cli/src/extra.ts' } }],
      removed: [],
    })
    expect(dataOf(status, 'topicChurn')).toEqual([
      expect.objectContaining({ topic: 'PD-canary', revisions: 4 }),
    ])
    expect(
      result.lines.some(line => line.includes('HEAD 历史窗口口径，未提交新增 topic 计 0')),
    ).toBe(true)
    const trees = dataOf(status, 'worktrees') as { branch: string; members: string[] }[]
    // git 按工作树路径排，临时目录名是随机的，所以按分支名比。
    const byBranch = [...trees].sort((x, y) => x.branch.localeCompare(y.branch))
    expect(byBranch.map(tree => [tree.branch, tree.members])).toEqual([
      ['someone/w1', ['packages/model/m']],
      ['someone/w2', ['packages/model/m']],
    ])

    expect(dataOf(status, 'acceptance')).toMatchObject({
      members: 1,
      files: 2,
      totalSeconds: 130,
      slowest: { path: SLOW, seconds: 50 },
    })
    const band = (id: string) => status.indicators.find(row => row.id === id)?.band
    expect(band('acceptanceSeconds')).toBe('act')
    expect(band('acceptanceSlowestSeconds')).toBe('act')
    expect(result.lines).toContainEqual(
      expect.stringMatching(/^ {2}最慢一份验收的耗时（秒） 50 · 处置 · 不与基线比；apps\/cli/u),
    )

    expect(status.hardLines.sensors).toMatchObject({ status: 'judged', silent: [] })
    expect(result.code).toBe(1)
    expect(result.lines).toContainEqual(expect.stringMatching(/^ {2}✗ 依赖违规 /u))
    expect(result.lines).toContainEqual(expect.stringMatching(/^ {2}✗ 环 /u))
  })

  it('拿掉一个传感器的数据源（当前 PD 目录）：严格模式报它没数据并判失败', async () => {
    const { root, base } = canary()
    rmSync(join(root, PRODUCT, 'canary'), { recursive: true })
    const { result, status } = await strictRun(root, base)
    expect(status.hardLines.sensors.silent).toEqual([
      { sensor: 'topicChurn', reason: `${PRODUCT} 下没有当前 PD topic` },
    ])
    expect(result.code).toBe(1)
    expect(result.lines).toContain(
      `  ✗ 传感器没数据 1 个：sensors.topicChurn（${PRODUCT} 下没有当前 PD topic）`,
    )
  })
  it('删除全局预期时 silent 指名 architecture', async () => {
    const { root, base } = canary()
    rmSync(join(root, 'docs/architecture/constraints.json'))
    const { result, status } = await strictRun(root, base)
    expect(status.hardLines.sensors.silent).toEqual([
      {
        sensor: 'architecture',
        reason: '全局架构预期不可用：docs/architecture/constraints.json',
      },
    ])
    expect(result.code).toBe(1)
  })
})
