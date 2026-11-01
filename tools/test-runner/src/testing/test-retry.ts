// 成员测试一层（快层或慢层）失败后的定向重跑：失败处数不超过 `RETRY_LIMIT` 且每处都落在某个测试文件里时，
// 同一次运行内以低并发（成员串行、每成员一个工作进程）只把失败用例所在的文件各重跑一次；全过则这一层通过，
// 重跑记在 `retried` 里进运行记录（admission-run.ts）；仍失败、超过上限、有成员一级的失败（没有报告、起不来）或退出码非 0 却解析不出失败，按现语义失败。
// 失败原因分类（超时、STACK_TRACE_ERROR、进程起不来、断言失败）只进记录，不决定重不重跑：断言失败也重跑，但分开计。
// 不改别的步骤的失败语义；不读测试缓存（重跑经成员脚本直接起 vitest）。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Failure } from './ledger.ts'
import type { RerunOutcome } from './triage.ts'

export type { RerunOutcome } from './triage.ts'

export const RETRY_LIMIT = 10
/** `step test` 在计划文件旁写的报告：失败文件与重跑结果，check.ts 读进运行记录。 */
export const TEST_STEP_REPORT_FILE = 'test-step.json'

export type FailureKind = 'timeout' | 'stack-trace' | 'startup' | 'assertion'
export const FAILURE_KINDS: readonly FailureKind[] = [
  'timeout',
  'stack-trace',
  'startup',
  'assertion',
]
export type RetryTier = 'fast' | 'slow'

/** 一个失败的测试文件：所在成员、层、第一处失败的原因分类与原文（账本里的第一行）。 */
export interface FailedFile {
  readonly member: string
  readonly file: string
  readonly tier: RetryTier
  readonly kind: FailureKind
  readonly firstError: string
}

export interface RetriedFile extends FailedFile {
  readonly retryResult: RerunOutcome
}

const TIMEOUT = /timed out|timeout/iu
const STACK_TRACE = /STACK_TRACE_ERROR/u
const STARTUP =
  /worker exited|exited unexpectedly|ERR_IPC_CHANNEL_CLOSED|ERR_WORKER|\bspawn\b|starting the worker|could not be started|没有执行记录|起不来/iu

/** 账本失败消息的分类：先看起不来（它的消息里也可能带 timeout），再看超时与 STACK_TRACE_ERROR，其余算断言失败。 */
export function failureKind(message: string): FailureKind {
  if (STACK_TRACE.test(message)) return 'stack-trace'
  if (STARTUP.test(message)) return 'startup'
  if (TIMEOUT.test(message)) return 'timeout'
  return 'assertion'
}

/** 失败按文件归并（每文件取第一处的分类与原文）；有失败不在文件里时返回那一处。 */
function filesOf(
  failures: readonly Failure[],
  tier: RetryTier,
): { readonly files: FailedFile[] } | { readonly memberLevel: Failure } {
  const files = new Map<string, FailedFile>()
  for (const failure of failures) {
    if (failure.file === undefined) return { memberLevel: failure }
    const key = `${failure.member}\t${failure.file}`
    if (!files.has(key))
      files.set(key, {
        member: failure.member,
        file: failure.file,
        tier,
        kind: failureKind(failure.message),
        firstError: failure.message,
      })
  }
  return { files: [...files.values()] }
}

const countByKind = (files: readonly FailedFile[]) =>
  FAILURE_KINDS.map(kind => [kind, files.filter(file => file.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind} ${count}`)
    .join('、')

export interface TierOutcome {
  readonly exitCode: number
  /** 这一层最终仍失败的文件（没重跑时是全部失败文件；通过时为空）。 */
  readonly failures: readonly FailedFile[]
  readonly retried: readonly RetriedFile[]
}

/**
 * 跑一层并在失败时定向重跑：`run` 跑整层（返回退出码与账本失败），`rerun` 单独跑一个文件（调用方保证低并发、串行）。
 * 纯编排：决定重不重跑、怎么记，不起进程。
 */
export async function tierWithRetry(
  tier: RetryTier,
  run: () => Promise<{ readonly exitCode: number; readonly failures: readonly Failure[] }>,
  rerun: (file: FailedFile) => Promise<RerunOutcome>,
  note: (line: string) => void,
  limit = RETRY_LIMIT,
): Promise<TierOutcome> {
  const first = await run()
  if (first.exitCode === 0) return { exitCode: 0, failures: [], retried: [] }
  if (first.failures.length === 0) {
    note(`定向重跑：不做——退出码 ${first.exitCode} 但没有解析出失败，按失败处理，保留原退出码`)
    return { exitCode: first.exitCode, failures: [], retried: [] }
  }
  const grouped = filesOf(first.failures, tier)
  if ('memberLevel' in grouped) {
    note(
      `定向重跑：不做——有失败不在任何测试文件里（${grouped.memberLevel.member}：${grouped.memberLevel.message}）`,
    )
    return { exitCode: 1, failures: [], retried: [] }
  }
  if (first.failures.length > limit) {
    note(
      `定向重跑：不做——失败 ${first.failures.length} 处，超过 ${limit}（${grouped.files.length} 个文件：${countByKind(grouped.files)}）`,
    )
    return { exitCode: 1, failures: grouped.files, retried: [] }
  }
  note(
    `定向重跑：${first.failures.length} 处失败落在 ${grouped.files.length} 个文件（${countByKind(grouped.files)}），成员串行、每成员 1 个工作进程各重跑一次`,
  )
  const retried: RetriedFile[] = []
  for (const file of grouped.files) {
    const retryResult = await rerun(file)
    retried.push({ ...file, retryResult })
    note(`  ${file.file}（${file.kind}）→ ${retryResult}`)
  }
  const failures = retried
    .filter(entry => entry.retryResult !== 'passed')
    .map(({ retryResult: _result, ...file }) => file)
  if (failures.length === 0) {
    note('定向重跑全部通过：这一层记为通过，重跑写进运行记录的 retried')
    return { exitCode: 0, failures, retried }
  }
  note(`定向重跑后仍有 ${failures.length} 个文件没过：这一步失败`)
  return { exitCode: 1, failures, retried }
}

/** `step test` 写在计划文件旁的报告。 */
export interface TestStepReport {
  readonly head: string
  readonly failures: readonly FailedFile[]
  readonly retried: readonly RetriedFile[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseFailedFile(value: unknown): FailedFile | undefined {
  if (!isRecord(value)) return undefined
  const { member, file, tier, kind, firstError } = value
  if (typeof member !== 'string' || typeof file !== 'string' || typeof firstError !== 'string')
    return undefined
  if (tier !== 'fast' && tier !== 'slow') return undefined
  if (!(FAILURE_KINDS as readonly unknown[]).includes(kind)) return undefined
  return { member, file, tier, kind: kind as FailureKind, firstError }
}

export function parseRetriedFile(value: unknown): RetriedFile | undefined {
  const file = parseFailedFile(value)
  if (file === undefined || !isRecord(value)) return undefined
  const { retryResult } = value
  if (retryResult !== 'passed' && retryResult !== 'failed' && retryResult !== 'not-run')
    return undefined
  return { ...file, retryResult }
}

function parseAll<T>(value: unknown, parse: (entry: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed: T[] = []
  for (const entry of value) {
    const item = parse(entry)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

export const parseFailedFiles = (value: unknown) => parseAll(value, parseFailedFile)
export const parseRetriedFiles = (value: unknown) => parseAll(value, parseRetriedFile)

export function writeTestStepReport(path: string, report: TestStepReport): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(report, null, 1)}\n`)
  renameSync(temporary, path)
}

/** 读报告；不存在、不是 JSON、形状不对都读作没有。 */
export function readTestStepReport(path: string): TestStepReport | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
  if (!isRecord(parsed) || typeof parsed['head'] !== 'string') return undefined
  const failures = parseFailedFiles(parsed['failures'])
  const retried = parseRetriedFiles(parsed['retried'])
  if (failures === undefined || retried === undefined) return undefined
  return { head: parsed['head'], failures, retried }
}
