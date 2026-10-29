// @module-tag slow
// 回路侧的具名组环例外：runner 与被检树分开的临时仓库，真实跑 loop:status（起子进程）与收工钩子的度量
// （measureForHook，进程内），所以归慢层。钉住接线：回路读 runner 的例外，不读被检树的，坏例外报工具错误。
// 例外的判定与校验本身在 group-cycle-exceptions.spec.ts，omne-deps 的行为在 group-cycle-exceptions-cli.spec.ts。
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLoopConfig } from '../src/loop/config.ts'
import { measureForHook } from '../src/loop/hook-measure.ts'
import { readMetricsConfig } from '../src/metrics/config.ts'
import {
  CONSTRAINTS,
  CONTEXT_TOOL,
  RULING,
  X_TO_Y,
  Y_TO_Z,
  policy,
  runner,
  tree,
} from './fixtures/group-cycle.ts'
import {
  commit,
  git,
  removeTemporaries,
  temporaryDirectory,
  write,
} from './fixtures/loop-canary/repository.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  removeTemporaries()
})

const CLI = fileURLToPath(new URL('../src/loop/cli.ts', import.meta.url))

interface Status {
  readonly hardLines: {
    readonly cycles: readonly { readonly kind: string; readonly message: string }[]
    readonly exceptedCycles: readonly {
      readonly finding: { readonly kind: string; readonly groups: readonly string[] }
      readonly released: readonly {
        readonly edge: { readonly from: string; readonly to: string }
        readonly exception: { readonly id: string; readonly ruling: string }
      }[]
    }[]
  }
}

/** 被检树提交后跑 loop:status 子进程；runner 只经 OMNE_RUNNER_ROOT 给。 */
function loopStatus(subject: string, runnerRoot: string) {
  // 同一棵树会换 runner 再跑，已提交过就不再提交。
  if (git(subject, 'status', '--porcelain') !== '') commit(subject, 'tree')
  const out = join(temporaryDirectory('loop-group-cycle-out-'), 'status')
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', CLI, '--root', subject, '--out', out],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OMNE_SUBJECT_ROOT: subject,
        OMNE_RUNNER_ROOT: runnerRoot,
        OMNE_METRICS_HOME: temporaryDirectory('loop-group-cycle-home-'),
        OMNE_ACCEPTANCE_LEDGER_HOME: temporaryDirectory('loop-group-cycle-ledgers-'),
        NO_COLOR: '1',
      },
    },
  )
  const statusFile = join(out, 'status.json')
  const status =
    run.status === 2 ? undefined : (JSON.parse(readFileSync(statusFile, 'utf8')) as Status)
  return { code: run.status, stderr: run.stderr, status }
}

/** 收工钩子的度量：进程内读 OMNE_RUNNER_ROOT，所以用 stubEnv；基线取树提交前的空仓库头。 */
function hardLinesForHook(subject: string, runnerRoot: string) {
  const base = commit(subject, 'tree')
  // 配置也是 runner 的；这里读本仓库那份，免得进程内读 OMNE_RUNNER_ROOT 时去找临时 runner 的配置。
  const config = readLoopConfig()
  const metrics = readMetricsConfig()
  vi.stubEnv('OMNE_SUBJECT_ROOT', subject)
  vi.stubEnv('OMNE_RUNNER_ROOT', runnerRoot)
  return measureForHook(subject, `${base}~1`, config, metrics).hardLines
}

describe('loop:status 硬线读 runner 的组环例外', { timeout: 120_000 }, () => {
  it('对照：runner 没有例外时组环破硬线，状态里 cycles 有这个环、exceptedCycles 为空', () => {
    const { code, status } = loopStatus(tree(), runner(null))
    expect(code).toBe(1)
    expect(status?.hardLines.cycles).toEqual([
      expect.objectContaining({
        kind: 'group-cycle',
        message: expect.stringContaining('packages/context、packages/tool'),
      }),
    ])
    expect(status?.hardLines.exceptedCycles).toEqual([])
  })

  it('runner 登记了被检树组环的两条成员边：硬线不破，exceptedCycles 列出它、cycles 为空', () => {
    const { code, stderr, status } = loopStatus(tree(), runner([CONTEXT_TOOL]))
    expect(stderr).toBe('')
    expect(code).toBe(0)
    expect(status?.hardLines.cycles).toEqual([])
    expect(status?.hardLines.exceptedCycles).toEqual([
      expect.objectContaining({
        finding: expect.objectContaining({ kind: 'group-cycle' }),
        released: [
          {
            edge: X_TO_Y,
            exception: expect.objectContaining({ id: 'GCX-CONTEXT-TOOL', ruling: RULING }),
          },
          {
            edge: Y_TO_Z,
            exception: expect.objectContaining({ id: 'GCX-CONTEXT-TOOL', ruling: RULING }),
          },
        ],
      }),
    ])
  })

  it('只有被检树自己登记例外、runner 没有时，硬线照样破', () => {
    const subject = tree()
    write(subject, CONSTRAINTS, policy([CONTEXT_TOOL]))
    for (const trusted of [runner(null), runner([])]) {
      const { code, status } = loopStatus(subject, trusted)
      expect(code).toBe(1)
      expect(status?.hardLines.cycles).toHaveLength(1)
      expect(status?.hardLines.exceptedCycles).toEqual([])
    }
  })

  it('runner 的例外条目不合法时按工具错误退出 2，不当成没有例外', () => {
    const trusted = runner(null)
    write(
      trusted,
      CONSTRAINTS,
      JSON.stringify({
        schemaVersion: 3,
        domains: [],
        roles: [],
        rules: [],
        groupCycleExceptions: [{ ...CONTEXT_TOOL, ruling: 'not a link', reason: 'x' }],
      }),
    )
    const { code, stderr } = loopStatus(tree(), trusted)
    expect(code).toBe(2)
    expect(stderr).toContain('https ruling link')
  })
})

describe('收工钩子的度量读 runner 的组环例外', { timeout: 120_000 }, () => {
  it('对照：runner 没有例外时组环进硬线', () => {
    const lines = hardLinesForHook(tree(), runner(null))
    expect(lines.cycles).toEqual([expect.objectContaining({ kind: 'group-cycle' })])
  })

  it('runner 登记了组环的成员边：放行，硬线里没有环', () => {
    const lines = hardLinesForHook(tree(), runner([CONTEXT_TOOL]))
    expect(lines.cycles).toEqual([])
  })

  it('只有被检树自己登记例外、runner 没有时，组环仍进硬线', () => {
    const subject = tree()
    write(subject, CONSTRAINTS, policy([CONTEXT_TOOL]))
    expect(hardLinesForHook(subject, runner(null)).cycles).toHaveLength(1)
  })

  it('环里有未登记的边（context → tool 另有一条成员边）：组环仍进硬线', () => {
    const lines = hardLinesForHook(tree({ twoEdges: true }), runner([CONTEXT_TOOL]))
    expect(lines.cycles).toEqual([
      expect.objectContaining({
        kind: 'group-cycle',
        message: expect.stringContaining('packages/context/q → packages/tool/y'),
      }),
    ])
  })
})
