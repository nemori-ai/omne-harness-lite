// 执行失败不读成「无存活」：Stryker 没有真正测完这个成员时（sandbox 预检没通过、Stryker 退出非零、原始报告缺失或读不出、
// 一个变异体都没测过），成员读数照样写出，但 `valid` 为 false、带原因、不给分数，读数里没有「存活 0」一类的说法。
// Stryker 用替身，这里只验读数；真起 Stryker 的整条命令（退出码、summary.json、summary.md）见 mutation-stryker-preflight.spec.ts。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TestMember } from '@omne-harness/repo-toolchain/core/workspace'
import { mutateMember, type MemberContext } from '../src/mutation/member.ts'
import {
  memberErrors,
  memberLines,
  summarizeMember,
  type MutationReport,
} from '../src/mutation/report.ts'
import type { MutationTarget } from '../src/mutation/scope.ts'
import type { StrykerResult } from '../src/mutation/stryker.ts'
import { temporary } from './fixtures/mutation.ts'

// 替身：Stryker 不起，由各用例排好这一次的结果；其余导出照旧。
const stryker = vi.hoisted(() => ({ next: undefined as undefined | (() => unknown) }))
vi.mock('../src/mutation/stryker.ts', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/mutation/stryker.ts')>()),
  runStryker: () => Promise.resolve(stryker.next?.()),
}))

const member: TestMember = {
  path: 'packages/core/alpha',
  name: '@x/alpha',
  script: 'vitest run',
  dependencies: [],
}
const TARGET: MutationTarget = {
  member,
  lines: new Map([['packages/core/alpha/src/a.ts', [[1, 4]] as const]]),
}
const at = (line: number) => ({ start: { line, column: 1 }, end: { line, column: 9 } })
const mutant = (
  id: string,
  status: MutationReport['files'][string]['mutants'][number]['status'],
) => ({
  id,
  mutatorName: 'EqualityOperator',
  replacement: 'n >= 0',
  status,
  location: at(2),
})
const reportOf = (...statuses: Parameters<typeof mutant>[1][]): MutationReport => ({
  files: {
    'src/a.ts': {
      source: 'export const x = 1\nexport const ok = (n: number) => n > 0\n',
      mutants: statuses.map((status, index) => mutant(String(index + 1), status)),
    },
  },
})

/** 在临时运行目录里排好 Stryker 这一次的结果，跑一遍 `mutateMember`。 */
async function ran(options: {
  readonly exitCode?: number
  readonly preflightFailed?: boolean
  /** 写进报告文件的文字；不给就不写文件。 */
  readonly report?: string
}) {
  const runDir = temporary('mutation-execution-')
  mkdirSync(runDir, { recursive: true })
  const reportPath = join(runDir, 'alpha.mutation.json')
  if (options.report !== undefined) writeFileSync(reportPath, options.report)
  const result: StrykerResult = {
    exitCode: options.exitCode ?? 0,
    wallSeconds: 1,
    reportPath,
    logPath: join(runDir, 'alpha.log'),
    runLogPath: join(runDir, 'alpha.runs.jsonl'),
    preflightFailed: options.preflightFailed ?? false,
  }
  stryker.next = () => result
  const context: MemberContext = {
    strykerRun: { root: runDir, runDir, testTimeoutSeconds: 60, nonce: 'n' },
    recheckMax: 0,
    testTimeoutSeconds: 60,
    incremental: { kind: 'off' },
    fingerprints: new Map(),
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    return await mutateMember(TARGET, 1, context, undefined, '[1/1]')
  } finally {
    log.mockRestore()
  }
}

/** 执行失败的成员读数：测量无效、带原因、没有分数，也没有任何「存活 0」。 */
function expectNotRead(outcome: Awaited<ReturnType<typeof ran>>, reason: string) {
  expect(outcome.result).toMatchObject({
    member: member.path,
    valid: false,
    score: null,
    executionFailure: { reason },
  })
  expect(outcome.errors).toHaveLength(1)
  const lines = outcome.result === undefined ? [] : memberLines(outcome.result, true)
  const text = lines.join('\n')
  expect(text).toContain(reason)
  expect(text).toContain('测量无效')
  expect(text).not.toMatch(/存活 0|无存活|分数 \d/u)
}

describe('执行失败的成员读数', () => {
  it('sandbox 预检没通过：测量无效，原因 preflight-failed', async () => {
    expectNotRead(await ran({ preflightFailed: true, exitCode: 1 }), 'preflight-failed')
  })

  it('Stryker 退出非零：测量无效，原因 stryker-failed，哪怕报告读得出、里面全是被杀', async () => {
    const report = JSON.stringify(reportOf('Killed', 'Killed'))
    expectNotRead(await ran({ exitCode: 1, report }), 'stryker-failed')
  })

  it('Stryker 退出 0 却没有写出原始报告：测量无效，原因 report-missing', async () => {
    expectNotRead(await ran({}), 'report-missing')
  })

  it.each(['{ not json', '[]', JSON.stringify({ files: { 'src/a.ts': { source: 1 } } })])(
    '原始报告读不出或形状不对：测量无效，原因 report-unreadable（%s）',
    async report => {
      expectNotRead(await ran({ report }), 'report-unreadable')
    },
  )

  it('读数写进错误信息：同一条原因出现在命令的出错行里', async () => {
    const outcome = await ran({ preflightFailed: true, exitCode: 1 })
    expect(outcome.errors[0]).toContain('sandbox 预检没通过')
    expect(`${member.path}：${outcome.result.executionFailure?.message}`).toBe(outcome.errors[0])
  })

  it('测完并且有读数的成员不带执行失败', async () => {
    const outcome = await ran({ report: JSON.stringify(reportOf('Killed', 'Survived')) })
    expect(outcome.errors).toEqual([])
    expect(outcome.result).toMatchObject({ valid: true, score: 50, executionFailure: null })
  })
})

describe('一个变异体都没有真正执行', () => {
  const log = { logPath: 'log', reports: ['raw.json'] }

  it('范围内的变异体生成了、却都没跑（未跑）：测量无效，原因 nothing-executed，出错行写明', () => {
    const result = summarizeMember(TARGET, reportOf('Pending', 'Pending'))
    expect(result).toMatchObject({
      valid: false,
      score: null,
      executionFailure: { reason: 'nothing-executed' },
    })
    expect(memberErrors(result, log)).toEqual([expect.stringContaining('没有一个被执行')])
    expect(memberLines(result, true).join('\n')).not.toMatch(/存活 0|无存活/u)
  })

  it('只要有一个变异体得出过判定（被杀、超时、存活、无覆盖）就不算：无覆盖的新文件照样读成 0%', () => {
    for (const status of ['Killed', 'Timeout', 'Survived', 'NoCoverage'] as const) {
      const result = summarizeMember(TARGET, reportOf('Pending', status))
      expect(result.executionFailure, status).toBeNull()
    }
    expect(summarizeMember(TARGET, reportOf('NoCoverage'))).toMatchObject({ valid: true, score: 0 })
  })

  it('范围内一个变异体都没生成（#737）不是执行失败：照旧有效、不给分数、报未覆盖', () => {
    const result = summarizeMember(TARGET, { files: {} })
    expect(result).toMatchObject({ valid: true, score: null, executionFailure: null })
    expect(result.unmutated).toHaveLength(1)
  })
})
