// 变异一个成员：第一遍 Stryker（开增量时先放好上次的快照）、只因时限到了而超时的单独复核，汇总成员读数，
// 测量有效时写回快照。成员之间互不依赖，入口按预算同时跑几个；这里的输出只有一行进度，读数交回入口按成员顺序汇总。
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { slugOf } from '../testing/run.ts'
import {
  dropCarriedOver,
  nextStore,
  reusedCount,
  seedReport,
  storePath,
  withCarriedRuns,
  writeStore,
  type IncrementalMode,
  type Store,
} from './incremental.ts'
import {
  exactEntry,
  isMutationReport,
  memberErrors,
  planRecheck,
  recheckTargets,
  summarizeMember,
  type MemberMutation,
  type MutationReport,
} from './report.ts'
import { isRunRecord, type RunRecord } from './run-reporter.ts'
import type { MutationTarget } from './scope.ts'
import { runStryker, type StrykerRun } from './stryker.ts'

function readMutationReport(path: string): MutationReport | undefined {
  try {
    const report: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isMutationReport(report) ? report : undefined
  } catch {
    return undefined
  }
}

/** 运行记录读不出时为 `unreadable`：读数里的类型测试记作没测到，不影响判定。 */
function readRunRecords(path: string): RunRecord[] | 'unreadable' {
  try {
    const records: unknown[] = readFileSync(path, 'utf8')
      .split('\n')
      .filter(line => line !== '')
      .map(line => JSON.parse(line) as unknown)
    return records.every(isRunRecord) ? records : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** 各成员共用的运行参数；工作进程数与增量文件按成员另给。 */
export interface MemberContext {
  readonly strykerRun: Omit<StrykerRun, 'concurrency' | 'incremental'>
  readonly recheckMax: number
  readonly testTimeoutSeconds: number
  readonly incremental: IncrementalMode
  readonly fingerprint: string
}

/** 一个成员的增量情况，写进摘要。 */
export interface MemberIncremental {
  readonly member: string
  /** Stryker 复用的变异体数；Stryker 的日志里没有这个数时为 null。 */
  readonly reused: number | null
  /** 快照没用上或没写成的原因（不影响读数）。 */
  readonly notes: readonly string[]
}

export interface MemberOutcome {
  /** Stryker 没跑成（预检没通过、退出非零、没写出报告）时没有读数。 */
  readonly result: MemberMutation | undefined
  readonly errors: readonly string[]
  /** 没开增量时为 undefined。 */
  readonly incremental: MemberIncremental | undefined
}

/** 准备交给 Stryker 的 incremental 文件。`--out` 目录里可能留着上一次的，一律先删掉，Stryker 不能读到它。 */
function prepareIncremental(
  target: MutationTarget,
  context: MemberContext,
  store: Store | undefined,
  notes: string[],
): { readonly run: StrykerRun['incremental']; readonly seeded: Store | undefined } {
  const { incremental } = context
  if (incremental.kind === 'off') return { run: undefined, seeded: undefined }
  const file = join(context.strykerRun.runDir, `${slugOf(target.member.path)}.incremental.json`)
  try {
    rmSync(file, { force: true })
    const seeded = store !== undefined && !incremental.force ? store : undefined
    if (seeded !== undefined) writeFileSync(file, `${JSON.stringify(seedReport(target, seeded))}\n`)
    return { run: { file, force: incremental.force }, seeded }
  } catch (error) {
    // 删不掉旧文件就不能开增量：Stryker 会读到它。这个成员按没有增量跑。
    notes.push(`incremental 文件准备不了，这个成员不开增量：${(error as Error).message}`)
    return { run: undefined, seeded: undefined }
  }
}

/**
 * 变异一个成员，用 `workers` 个工作进程。`store` 是读到的快照（没开增量或没有快照时不给）。
 * `label` 是进度行的前缀，如 `[2/3]`。
 */
export async function mutateMember(
  target: MutationTarget,
  workers: number,
  context: MemberContext,
  store: Store | undefined,
  label: string,
): Promise<MemberOutcome> {
  const path = target.member.path
  const notes: string[] = []
  const prepared = prepareIncremental(target, context, store, notes)
  const strykerRun: StrykerRun = {
    ...context.strykerRun,
    concurrency: workers,
    ...(prepared.run === undefined ? {} : { incremental: prepared.run }),
  }
  const ran = await runStryker(target, strykerRun)
  const raw = readMutationReport(ran.reportPath)
  // 开增量时 Stryker 把范围外的旧变异体原样留在报告里；不开增量时没有它们，读数只按这次生成的算。
  const report =
    raw === undefined || prepared.run === undefined ? raw : dropCarriedOver(target, raw)
  const incremental = (): MemberIncremental | undefined => {
    if (context.incremental.kind === 'off') return undefined
    let reused: number | null = null
    try {
      reused =
        reusedCount(readFileSync(ran.logPath, 'utf8')) ?? (prepared.seeded === undefined ? 0 : null)
    } catch {
      reused = null
    }
    return { member: path, reused: prepared.run === undefined ? 0 : reused, notes }
  }
  const failed = (error: string): MemberOutcome => {
    console.log(`${label} ${path} ${Math.round(ran.wallSeconds)} 秒，出错`)
    return { result: undefined, errors: [error], incremental: incremental() }
  }
  if (ran.preflightFailed)
    return failed(
      `${path}：sandbox 预检没通过，快层测试在 sandbox 里没跑通，没有做变异，日志 ${ran.logPath}`,
    )
  if (ran.exitCode !== 0 || report === undefined)
    return failed(
      `${path}：Stryker 退出码 ${ran.exitCode}${report === undefined ? '，没有写出报告' : ''}，日志 ${ran.logPath}`,
    )
  const ownRuns = readRunRecords(ran.runLogPath)
  const runs = withCarriedRuns(report, ownRuns, prepared.seeded)
  const first = summarizeMember(target, report, { runs })
  const reports = [ran.reportPath]
  const errors: string[] = []
  let result = first
  let recheckPaths: { logPath: string; reportPath: string } | undefined
  let seconds = ran.wallSeconds
  const isUnchecked = (finding: MemberMutation['invalid'][number]) =>
    finding.reason === 'timeoutUnchecked'
  // 只因时限到了而超时的，在上限内单独复核一遍；第一遍已无效（RuntimeError、没跑测试）时不再花这份时间。
  const pending = recheckTargets(target, report)
  if (pending.length > 0 && first.runtimeErrors === 0 && first.invalid.every(isUnchecked)) {
    const plan = planRecheck(report, pending, context.recheckMax)
    result = summarizeMember(target, report, { runs, recheckReading: plan.reading })
    if (plan.chosen.length > 0) {
      const again = await runStryker(target, strykerRun, {
        mutate: plan.chosen.map(({ file, mutant }) => exactEntry(file, mutant)),
        timeoutMS: context.testTimeoutSeconds * 1000,
      })
      seconds += again.wallSeconds
      const recheck = readMutationReport(again.reportPath)
      if (again.preflightFailed || again.exitCode !== 0 || recheck === undefined)
        errors.push(
          `${path}：复核的 Stryker ${again.preflightFailed ? 'sandbox 预检没通过' : `退出码 ${again.exitCode}`}` +
            `${recheck === undefined ? '，没有写出报告' : ''}，日志 ${again.logPath}`,
        )
      else {
        reports.push(again.reportPath)
        recheckPaths = { logPath: again.logPath, reportPath: again.reportPath }
        result = summarizeMember(target, report, {
          recheck,
          runs,
          recheckReading: plan.reading,
        })
      }
    }
  }
  errors.push(
    ...memberErrors(result, {
      logPath: ran.logPath,
      reports,
      ...(recheckPaths === undefined ? {} : { recheck: recheckPaths }),
    }),
  )
  // 只在测量有效、没有出错时更新快照；否则留着上一份，下次照旧拿它比对。
  if (prepared.run !== undefined && context.incremental.kind === 'on' && errors.length === 0) {
    const written = readJson(prepared.run.file)
    const failure =
      written === undefined
        ? 'Stryker 没写出 incremental 文件'
        : writeStore(
            storePath(context.incremental.dir, path),
            nextStore(target, written, runs, {
              fingerprint: context.fingerprint,
              workerSeconds: ran.wallSeconds * workers,
            }),
          )
    if (failure !== undefined) notes.push(`快照没写成，下次整份重跑：${failure}`)
  }
  const reuse = incremental()
  console.log(
    `${label} ${path} ${Math.round(seconds)} 秒` +
      `${result.valid ? '' : '，测量无效'}，存活 ${result.counts.Survived}、无覆盖 ${result.counts.NoCoverage}` +
      (result.invalid.length > 0 ? `、不计分 ${result.invalid.length}` : '') +
      (result.rechecked.length > 0 ? `、复核 ${result.rechecked.length}` : '') +
      (result.unmutated.length > 0 ? `、没有变异体的改动 ${result.unmutated.length} 段` : '') +
      (reuse?.reused ? `、复用 ${reuse.reused}` : ''),
  )
  return { result, errors, incremental: reuse }
}
