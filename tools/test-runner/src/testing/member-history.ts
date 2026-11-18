import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FileTime } from './batches.ts'
import type { RunTier } from './config.ts'
import type { LedgerFile } from './ledger.ts'
import { READING_VERSION, type WeightReading } from './parallelism.ts'

export interface MemberReading {
  readonly seconds: number
  readonly files: number
  readonly fileTimes: readonly FileTime[]
  readonly weights: readonly WeightReading[]
  readonly startupSeconds?: number
}

const LEDGERS_READ = 20

interface Job {
  readonly member?: unknown
  readonly cpuSeconds?: unknown
  readonly workers?: unknown
  readonly start?: unknown
  readonly end?: unknown
  readonly readingVersion?: unknown
  readonly startupSeconds?: unknown
}

type LedgerWithJobs = Partial<LedgerFile> & {
  readonly meta?: { readonly tokens?: { readonly jobs?: readonly Job[] } }
}

const isNumber = (value: unknown): value is number => typeof value === 'number'

export function readingOf(jobs: readonly Job[], member: string): WeightReading | undefined {
  let cpuSeconds = 0
  let processSeconds = 0
  let measured = false
  for (const job of jobs) {
    if (job.member !== member || job.readingVersion !== READING_VERSION) continue
    const { cpuSeconds: cpu, workers, start, end } = job
    if (!isNumber(cpu) || !isNumber(workers) || !isNumber(start) || !isNumber(end)) return undefined
    cpuSeconds += cpu
    processSeconds += (end - start) * workers
    measured = true
  }
  return measured ? { cpuSeconds, processSeconds } : undefined
}

export function startupOf(jobs: readonly Job[], member: string): number | undefined {
  const seconds = jobs.flatMap(job =>
    job.member === member && isNumber(job.startupSeconds) ? [job.startupSeconds] : [],
  )
  return seconds.length === 0
    ? undefined
    : Math.round((seconds.reduce((sum, value) => sum + value, 0) / seconds.length) * 10) / 10
}

function tierOf(runName: string): RunTier | undefined {
  const match = /^\d{8}-\d{6}(?:-(fast|slow))?$/u.exec(runName)
  if (match === null) return undefined
  return (match[1] as RunTier | undefined) ?? 'all'
}

function entriesOf(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function modifiedAt(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

function ledgerAt(path: string): LedgerWithJobs {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as LedgerWithJobs
  } catch {
    return {}
  }
}

const reported = (row: { readonly exitCode: number; readonly files: number }) =>
  row.exitCode === 0 || row.files > 0

function fileTimesOf(ledger: LedgerWithJobs, member: string): FileTime[] {
  const prefix = `${member}/`
  return (ledger.files ?? [])
    .filter(file => file.member === member && file.file.startsWith(prefix))
    .map(file => ({ file: file.file.slice(prefix.length), seconds: file.seconds }))
}

export function memberHistory(home: string, tier: RunTier): Map<string, MemberReading> {
  const ledgers: { path: string; mtime: number }[] = []
  for (const head of entriesOf(home))
    for (const run of entriesOf(join(home, head))) {
      if (tierOf(run) !== tier) continue
      const path = join(home, head, run, 'ledger.json')
      const mtime = modifiedAt(path)
      if (mtime !== undefined) ledgers.push({ path, mtime })
    }
  ledgers.sort((a, b) => b.mtime - a.mtime)
  const readings = new Map<
    string,
    {
      last?: Pick<MemberReading, 'seconds' | 'files' | 'fileTimes'>
      weights: WeightReading[]
      startupSeconds?: number | undefined
    }
  >()
  for (const { path } of ledgers.slice(0, LEDGERS_READ)) {
    const ledger = ledgerAt(path)
    const jobs = ledger.meta?.tokens?.jobs ?? []
    for (const row of ledger.members ?? []) {
      const reading = readings.get(row.member) ?? { weights: [] }
      readings.set(row.member, reading)
      if (reading.last === undefined && reported(row))
        reading.last = {
          seconds: row.wallSeconds,
          files: row.files,
          fileTimes: fileTimesOf(ledger, row.member),
        }
      const weight = readingOf(jobs, row.member)
      if (weight !== undefined) reading.weights.push(weight)
      reading.startupSeconds ??= startupOf(jobs, row.member)
    }
  }
  const history = new Map<string, MemberReading>()
  for (const [member, { last, weights, startupSeconds }] of readings)
    if (last !== undefined)
      history.set(member, {
        ...last,
        weights,
        ...(startupSeconds === undefined ? {} : { startupSeconds }),
      })
  return history
}

export function longestFirst<T extends { readonly path: string }>(
  members: readonly T[],
  history: ReadonlyMap<string, MemberReading>,
): T[] {
  const seconds = (member: T) => history.get(member.path)?.seconds ?? Infinity
  return [...members].sort((a, b) => seconds(b) - seconds(a))
}
