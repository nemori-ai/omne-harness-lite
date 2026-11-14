import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Failure } from './ledger.ts'
import type { RerunOutcome } from './triage.ts'

export type { RerunOutcome } from './triage.ts'

export const RETRY_LIMIT = 10
export const TEST_STEP_REPORT_FILE = 'test-step.json'

export type FailureKind = 'timeout' | 'stack-trace' | 'startup' | 'assertion'
export const FAILURE_KINDS: readonly FailureKind[] = [
  'timeout',
  'stack-trace',
  'startup',
  'assertion',
]
export type RetryTier = 'fast' | 'slow'

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

export function failureKind(message: string): FailureKind {
  if (STACK_TRACE.test(message)) return 'stack-trace'
  if (STARTUP.test(message)) return 'startup'
  if (TIMEOUT.test(message)) return 'timeout'
  return 'assertion'
}

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
  readonly failures: readonly FailedFile[]
  readonly retried: readonly RetriedFile[]
}

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
