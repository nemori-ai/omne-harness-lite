// 耗时账本：把各成员 vitest 的 JSON 报告与计时报告汇总成成员、文件、用例三级的耗时、导入耗时、
// 贴着自身时限的用例与失败清单。纯函数。
import { relative } from 'node:path'
import type { Failure, Ledger } from '@omne-harness/repo-toolchain/core/test-ledger'
export type {
  Failure,
  Ledger,
  LedgerFile,
  RunMeta,
} from '@omne-harness/repo-toolchain/core/test-ledger'
import type { TimingReport } from './timing-reporter.ts'

/** vitest 的默认用例时限。计时报告缺失（成员没跑到报告器那一步）时，贴线按它判，并在账本里标明是假定的。 */
export const VITEST_DEFAULT_TIMEOUT_SECONDS = 5

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
  /** 计时报告；与 JSON 报告同理可能没有。 */
  readonly timing?: TimingReport
  /** 运行器自己判的失败（如报告里有嵌套归档目录的文件）；有它时退出码一定非零。 */
  readonly problem?: string
}

/** 什么都没跑的账本正文（计划跳过了全部验收时用）。 */
export function emptyLedger(): Ledger {
  return { members: [], files: [], nearTimeout: [], fastOverBudget: [], failures: [] }
}

function firstLine(text: string): string {
  const line = text.split('\n').find(candidate => candidate.trim() !== '') ?? ''
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}

const round = (seconds: number) => Math.round(seconds * 10) / 10

type FileTiming = TimingReport['files'][number]

/** 跑了的用例：通过或失败；跳过、待写、被层过滤掉的不算。 */
const ranTest = (assertion: { readonly status: string }) =>
  assertion.status === 'passed' || assertion.status === 'failed'

/** 报告里跑了的用例数。 */
export function testCount(report: VitestJsonReport): number {
  return report.testResults.reduce(
    (sum, file) => sum + file.assertionResults.filter(ranTest).length,
    0,
  )
}

/** 慢层的标签名（定义在仓库根 `vitest.tiers.mts`）。 */
export const SLOW_TAG = 'slow'

interface TestTiming {
  readonly timeoutSeconds: number | null
  readonly slow: boolean
}

/** 一个成员的计时报告按文件索引；同一文件里同名的用例取第一条。 */
function timingIndex(timing: TimingReport | undefined) {
  const files = new Map<string, { file: FileTiming; tests: Map<string, TestTiming> }>()
  for (const file of timing?.files ?? []) {
    const tests = new Map<string, TestTiming>()
    for (const test of file.tests)
      if (!tests.has(test.fullName))
        tests.set(test.fullName, {
          timeoutSeconds: test.timeoutSeconds,
          slow: test.tags.includes(SLOW_TAG),
        })
    files.set(file.file, { file, tests })
  }
  return files
}

export function buildLedger(
  runs: readonly MemberRun[],
  root: string,
  nearTimeoutRatio: number,
): Ledger {
  const members: Ledger['members'][number][] = []
  const files: Ledger['files'][number][] = []
  const tests: Ledger['nearTimeout'][number][] = []
  const fastOverBudget: Ledger['fastOverBudget'][number][] = []
  const failures: Failure[] = []
  for (const run of runs) {
    let testCount = 0
    let skipped = 0
    let failed = 0
    let fileSeconds = 0
    let collectSeconds = 0
    const timings = timingIndex(run.timing)
    for (const result of run.report?.testResults ?? []) {
      const file = relative(root, result.name).replaceAll('\\', '/')
      const seconds = Math.max(0, result.endTime - result.startTime) / 1000
      const timing = timings.get(result.name)
      const ran = result.assertionResults.filter(ranTest).length
      fileSeconds += seconds
      collectSeconds += timing?.file.collectSeconds ?? 0
      testCount += ran
      skipped += result.assertionResults.length - ran
      let slowTests = 0
      let fastSeconds = 0
      let longestSeconds = 0
      let failedHere = 0
      for (const assertion of result.assertionResults) {
        const testSeconds = (assertion.duration ?? 0) / 1000
        const known = timing?.tests.get(assertion.fullName)
        const slow = known?.slow === true
        if (ranTest(assertion)) {
          if (slow) slowTests += 1
          else fastSeconds += testSeconds
          longestSeconds = Math.max(longestSeconds, testSeconds)
        }
        const timeoutSeconds = known?.timeoutSeconds ?? VITEST_DEFAULT_TIMEOUT_SECONDS
        // 时限 0 在 vitest 里是「不设时限」，无线可贴。
        if (timeoutSeconds > 0 && testSeconds >= timeoutSeconds * nearTimeoutRatio)
          tests.push({
            member: run.member,
            file,
            test: assertion.fullName,
            seconds: round(testSeconds),
            timeoutSeconds,
            timeoutAssumed: known?.timeoutSeconds === undefined || known.timeoutSeconds === null,
            slow,
          })
        const budget =
          timeoutSeconds > 0
            ? Math.min(timeoutSeconds, VITEST_DEFAULT_TIMEOUT_SECONDS)
            : VITEST_DEFAULT_TIMEOUT_SECONDS
        if (ranTest(assertion) && !slow && testSeconds >= budget * nearTimeoutRatio)
          fastOverBudget.push({
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
      files.push({
        member: run.member,
        file,
        seconds: round(seconds),
        tests: ran,
        slowTests,
        fastSeconds: round(fastSeconds),
        longestSeconds: round(longestSeconds),
        ...(timing === undefined ? {} : { collectSeconds: round(timing.file.collectSeconds) }),
      })
      // 文件判失败却没有任何失败用例：收集、加载或钩子出的错。
      if (result.status === 'failed' && failedHere === 0)
        failures.push({ member: run.member, file, message: firstLine(result.message ?? '') })
    }
    if (run.problem !== undefined) failures.push({ member: run.member, message: run.problem })
    // 成员退出码非零却没有任何可归到文件的失败：报告缺失，或失败发生在测试之外（如类型检查）。
    else if (run.exitCode !== 0 && !failures.some(failure => failure.member === run.member))
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
      skipped,
      failed,
      fileSeconds: round(fileSeconds),
      ...(run.timing === undefined ? {} : { collectSeconds: round(collectSeconds) }),
    })
  }
  files.sort((a, b) => b.seconds - a.seconds)
  const share = (test: Ledger['nearTimeout'][number]) => test.seconds / test.timeoutSeconds
  tests.sort((a, b) => share(b) - share(a) || b.seconds - a.seconds)
  fastOverBudget.sort((a, b) => b.seconds - a.seconds)
  return { members, files, nearTimeout: tests, fastOverBudget, failures }
}

export interface LedgerSummaryContext {
  readonly wallSeconds: number
  readonly slowFileSeconds: number
  readonly nearTimeoutRatio: number
  readonly top: number
  readonly runDir: string
  /** 结果缓存命中、因而没有跑的成员数；账本的成员一级读数里没有它们。 */
  readonly cachedMembers?: number
}

/** 给人和 agent 看的摘要：事实与数，不带建议。 */
export function ledgerSummary(ledger: Ledger, context: LedgerSummaryContext): string[] {
  const total = ledger.members.reduce(
    (sum, member) => ({
      files: sum.files + member.files,
      tests: sum.tests + member.tests,
      skipped: sum.skipped + member.skipped,
      failed: sum.failed + member.failed,
    }),
    { files: 0, tests: 0, skipped: 0, failed: 0 },
  )
  const red = ledger.members.filter(member => member.exitCode !== 0)
  const cached = context.cachedMembers ?? 0
  const lines = [
    `${ledger.members.length} 个成员${cached === 0 ? '' : `（另有 ${cached} 个成员缓存命中，没有跑）`}、${total.files} 个文件、${total.tests} 条用例` +
      (total.skipped === 0 ? '' : `（另有 ${total.skipped} 条没跑）`) +
      `，墙钟 ${Math.round(context.wallSeconds)} 秒；` +
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
  const importers = ledger.members
    .filter(member => member.collectSeconds !== undefined)
    .sort((a, b) => (b.collectSeconds ?? 0) - (a.collectSeconds ?? 0))
  if (importers.length > 0)
    lines.push(
      `导入耗时（各文件累计）最多的成员：${importers
        .slice(0, context.top)
        .map(member => `${member.member} ${Math.round(member.collectSeconds ?? 0)} 秒`)
        .join('、')}`,
    )
  const assumed = ledger.nearTimeout.filter(test => test.timeoutAssumed).length
  lines.push(
    `贴着时限（耗时 ≥ 自身时限 × ${context.nearTimeoutRatio}）的用例 ${ledger.nearTimeout.length} 条` +
      (assumed === 0
        ? ''
        : `（其中 ${assumed} 条没拿到时限，按 vitest 默认 ${VITEST_DEFAULT_TIMEOUT_SECONDS} 秒算）`) +
      (ledger.nearTimeout.length === 0
        ? ''
        : `：${ledger.nearTimeout
            .slice(0, context.top)
            .map(test => `${test.file} › ${test.test} ${test.seconds}／${test.timeoutSeconds} 秒`)
            .join('；')}`),
  )
  lines.push(...driftLines(ledger, context))
  lines.push(`账本与各成员日志：${context.runDir}`)
  return lines
}

/** 回快层的线是归慢那条线的一半：空闲与忙时的读数差一倍上下，同一条线会让贴着它的文件在两个方向上轮流被点名。 */
const RETURN_SHARE = 0.5

/**
 * 归层的漂移：快层的承诺是单条用例不到默认时限的 `nearTimeoutRatio`（自带更宽时限的也一样）、单个文件的快层用例合计不到 `slowFileSeconds`；
 * 列出没守住的，和归了慢层却连这两条线的一半都不到的。只列事实，改快还是改归层由改代码的人定。
 */
function driftLines(ledger: Ledger, context: LedgerSummaryContext): string[] {
  const quickTest = VITEST_DEFAULT_TIMEOUT_SECONDS * context.nearTimeoutRatio
  const returnTest = quickTest * RETURN_SHARE
  const returnFile = context.slowFileSeconds * RETURN_SHARE
  const fastFiles = ledger.files.filter(file => file.fastSeconds >= context.slowFileSeconds)
  const fastOver = ledger.fastOverBudget
  const quickSlow = ledger.files.filter(
    file =>
      file.slowTests > 0 &&
      file.slowTests === file.tests &&
      file.seconds < returnFile &&
      file.longestSeconds < returnTest,
  )
  const lines = [
    `归层：快层用例合计超过 ${context.slowFileSeconds} 秒的文件 ${fastFiles.length} 个、快层里超过单条预算（${quickTest} 秒）的用例 ${fastOver.length} 条；` +
      `全归慢层、却每条不到 ${returnTest} 秒且整份不到 ${returnFile} 秒的文件 ${quickSlow.length} 个`,
  ]
  const top = <T>(items: readonly T[], show: (item: T) => string) =>
    items.slice(0, context.top).map(show).join('、') +
    (items.length > context.top ? ` 等 ${items.length} 个` : '')
  if (fastFiles.length > 0)
    lines.push(
      `  快层超出的文件：${top(fastFiles, file => `${file.file} ${Math.round(file.fastSeconds)} 秒`)}`,
    )
  if (fastOver.length > 0)
    lines.push(
      `  快层超出预算的用例：${top(fastOver, test => `${test.file} › ${test.test} ${test.seconds} 秒`)}`,
    )
  if (quickSlow.length > 0)
    lines.push(`  慢层里很快的文件：${top(quickSlow, file => `${file.file} ${file.seconds} 秒`)}`)
  return lines
}
