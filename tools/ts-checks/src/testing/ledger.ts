// 耗时账本：把各成员 vitest 的 JSON 报告汇总成成员、文件、用例三级的耗时与失败清单。纯函数。
import { relative } from 'node:path'
import type { AffectedPlan } from './affected.ts'
import type { Parallelism, RunScript } from './config.ts'

/** 一次运行的抬头：`ledger.json` 的 `meta`。读它的有体检页（测试）与回路的验收耗时传感器。 */
export interface RunMeta {
  readonly script: RunScript
  readonly head: string
  readonly branch: string
  readonly dirty: boolean
  /** 全量运行（`--all`）为 null。 */
  readonly base: { readonly ref: string; readonly mergeBase: string } | null
  readonly startedAt: string
  readonly parallel: Parallelism
  readonly cores: number
  readonly plan: AffectedPlan | null
  /** 这次跑了的成员目录。 */
  readonly members: readonly string[]
  /** 整次运行的墙钟，取整到秒。 */
  readonly wallSeconds: number
}

/** 运行目录里的 `ledger.json`。 */
export interface LedgerFile extends Ledger {
  readonly meta: RunMeta
}

/** vitest `--reporter=json` 的形状里这里用到的部分。 */
export interface VitestJsonReport {
  readonly testResults: readonly {
    readonly name: string
    readonly status: string
    readonly startTime: number
    readonly endTime: number
    readonly message?: string
    readonly assertionResults: readonly {
      readonly fullName: string
      readonly status: string
      readonly duration?: number | null
      readonly failureMessages?: readonly string[] | null
    }[]
  }[]
}

export interface MemberRun {
  /** 仓库相对的成员目录。 */
  readonly member: string
  readonly exitCode: number
  readonly wallSeconds: number
  /** 没有报告：脚本不是 vitest，或进程在写出报告前就退出了。 */
  readonly report?: VitestJsonReport
}

export interface Failure {
  readonly member: string
  /** 仓库相对的测试文件；整个成员没出报告时为 undefined。 */
  readonly file?: string
  /** 用例全名；文件级失败（收集或加载出错）时为 undefined。 */
  readonly test?: string
  readonly message: string
}

export interface Ledger {
  readonly members: readonly {
    readonly member: string
    readonly exitCode: number
    readonly wallSeconds: number
    readonly files: number
    readonly tests: number
    readonly failed: number
    /** 各文件耗时之和；与墙钟的差是进程启动、类型检查与并行重叠。 */
    readonly fileSeconds: number
  }[]
  readonly files: readonly {
    readonly member: string
    readonly file: string
    readonly seconds: number
    readonly tests: number
  }[]
  /** 耗时达到 `slowTestSeconds` 的用例，从慢到快。 */
  readonly slowTests: readonly {
    readonly member: string
    readonly file: string
    readonly test: string
    readonly seconds: number
  }[]
  readonly failures: readonly Failure[]
}

function firstLine(text: string): string {
  const line = text.split('\n').find(candidate => candidate.trim() !== '') ?? ''
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}

const round = (seconds: number) => Math.round(seconds * 10) / 10

export function buildLedger(
  runs: readonly MemberRun[],
  root: string,
  slowTestSeconds: number,
): Ledger {
  const members: Ledger['members'][number][] = []
  const files: Ledger['files'][number][] = []
  const tests: Ledger['slowTests'][number][] = []
  const failures: Failure[] = []
  for (const run of runs) {
    let testCount = 0
    let failed = 0
    let fileSeconds = 0
    for (const result of run.report?.testResults ?? []) {
      const file = relative(root, result.name).replaceAll('\\', '/')
      const seconds = Math.max(0, result.endTime - result.startTime) / 1000
      fileSeconds += seconds
      testCount += result.assertionResults.length
      files.push({
        member: run.member,
        file,
        seconds: round(seconds),
        tests: result.assertionResults.length,
      })
      let failedHere = 0
      for (const assertion of result.assertionResults) {
        const testSeconds = (assertion.duration ?? 0) / 1000
        if (testSeconds >= slowTestSeconds)
          tests.push({
            member: run.member,
            file,
            test: assertion.fullName,
            seconds: round(testSeconds),
          })
        if (assertion.status !== 'failed') continue
        failedHere += 1
        failures.push({
          member: run.member,
          file,
          test: assertion.fullName,
          message: firstLine(assertion.failureMessages?.[0] ?? ''),
        })
      }
      failed += failedHere
      // 文件判失败却没有任何失败用例：收集、加载或钩子出的错。
      if (result.status === 'failed' && failedHere === 0)
        failures.push({ member: run.member, file, message: firstLine(result.message ?? '') })
    }
    // 成员退出码非零却没有任何可归到文件的失败：报告缺失，或失败发生在测试之外（如类型检查）。
    if (run.exitCode !== 0 && !failures.some(failure => failure.member === run.member))
      failures.push({
        member: run.member,
        message:
          run.report === undefined
            ? `退出码 ${run.exitCode}，没有产出报告`
            : `退出码 ${run.exitCode}，报告里没有失败的用例或文件（可能是类型检查或未捕获的错误）`,
      })
    members.push({
      member: run.member,
      exitCode: run.exitCode,
      wallSeconds: round(run.wallSeconds),
      files: run.report?.testResults.length ?? 0,
      tests: testCount,
      failed,
      fileSeconds: round(fileSeconds),
    })
  }
  files.sort((a, b) => b.seconds - a.seconds)
  tests.sort((a, b) => b.seconds - a.seconds)
  return { members, files, slowTests: tests, failures }
}

export interface LedgerSummaryContext {
  readonly wallSeconds: number
  readonly slowFileSeconds: number
  readonly slowTestSeconds: number
  readonly top: number
  readonly runDir: string
}

/** 给人和 agent 看的摘要：事实与数，不带建议。 */
export function ledgerSummary(ledger: Ledger, context: LedgerSummaryContext): string[] {
  const total = ledger.members.reduce(
    (sum, member) => ({
      files: sum.files + member.files,
      tests: sum.tests + member.tests,
      failed: sum.failed + member.failed,
    }),
    { files: 0, tests: 0, failed: 0 },
  )
  const red = ledger.members.filter(member => member.exitCode !== 0)
  const lines = [
    `${ledger.members.length} 个成员、${total.files} 个文件、${total.tests} 条用例，墙钟 ${Math.round(context.wallSeconds)} 秒；` +
      (red.length === 0
        ? '全部通过'
        : `${red.length} 个成员未通过，失败 ${ledger.failures.length} 处`),
  ]
  for (const failure of ledger.failures.slice(0, 20))
    lines.push(
      `  ✗ ${failure.file ?? failure.member}${failure.test === undefined ? '' : ` › ${failure.test}`}：${failure.message}`,
    )
  if (ledger.failures.length > 20)
    lines.push(`  …另有 ${ledger.failures.length - 20} 处，见账本的 failures`)
  const slowMembers = [...ledger.members]
    .sort((a, b) => b.wallSeconds - a.wallSeconds)
    .slice(0, context.top)
  lines.push(
    `最慢的成员：${slowMembers.map(member => `${member.member} ${Math.round(member.wallSeconds)} 秒`).join('、') || '无'}`,
  )
  const slowFiles = ledger.files.filter(file => file.seconds >= context.slowFileSeconds)
  lines.push(
    `超过 ${context.slowFileSeconds} 秒的文件 ${slowFiles.length} 个` +
      (slowFiles.length === 0
        ? ''
        : `：${slowFiles
            .slice(0, context.top)
            .map(file => `${file.file} ${Math.round(file.seconds)} 秒`)
            .join('、')}`),
  )
  lines.push(
    `超过 ${context.slowTestSeconds} 秒的用例 ${ledger.slowTests.length} 条` +
      (ledger.slowTests.length === 0
        ? ''
        : `：${ledger.slowTests
            .slice(0, context.top)
            .map(test => `${test.file} › ${test.test} ${test.seconds} 秒`)
            .join('；')}`),
  )
  lines.push(`账本与各成员日志：${context.runDir}`)
  return lines
}
