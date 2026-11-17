import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RunTier } from './config.ts'
import type { LedgerFile } from './ledger.ts'
import type { WeightReading } from './parallelism.ts'

export interface MemberReading {
  readonly seconds: number
  readonly files: number
  readonly weights: readonly WeightReading[]
}

const LEDGERS_READ = 20

type LedgerWithJobs = Partial<LedgerFile> & {
  readonly meta?: { readonly tokens?: { readonly jobs?: readonly unknown[] } }
}

function cpuOf(ledger: LedgerWithJobs, member: string): number | undefined {
  for (const job of ledger.meta?.tokens?.jobs ?? []) {
    const { member: name, cpuSeconds } = (job ?? {}) as { member?: unknown; cpuSeconds?: unknown }
    if (name === member && typeof cpuSeconds === 'number') return cpuSeconds
  }
  return undefined
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
  const readings = new Map<string, { seconds: number; files: number; weights: WeightReading[] }>()
  for (const { path } of ledgers.slice(0, LEDGERS_READ)) {
    const ledger = ledgerAt(path)
    for (const row of ledger.members ?? []) {
      if (row.exitCode !== 0) continue
      const reading = readings.get(row.member) ?? {
        seconds: row.wallSeconds,
        files: row.files,
        weights: [],
      }
      readings.set(row.member, reading)
      const cpuSeconds = cpuOf(ledger, row.member)
      if (cpuSeconds !== undefined)
        reading.weights.push({ cpuSeconds, fileSeconds: row.fileSeconds })
    }
  }
  return readings
}

export function longestFirst<T extends { readonly path: string }>(
  members: readonly T[],
  history: ReadonlyMap<string, MemberReading>,
): T[] {
  const seconds = (member: T) => history.get(member.path)?.seconds ?? Infinity
  return [...members].sort((a, b) => seconds(b) - seconds(a))
}
