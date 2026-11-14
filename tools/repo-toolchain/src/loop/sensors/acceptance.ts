import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listTestMembers } from '../../core/workspace.ts'
import { ledgerHome } from '../../core/test-ledger.ts'
import type { LedgerFile } from '../../core/test-ledger.ts'
import { data, noData, type Reading } from '../reading.ts'

export interface AcceptanceTiming {
  readonly members: number
  readonly files: number
  readonly totalSeconds: number
  readonly slowest?: { readonly path: string; readonly seconds: number }
  readonly ledger?: { readonly path: string; readonly startedAt: string }
  readonly skipped?: { readonly members: readonly string[]; readonly reason: string }
}

export interface AcceptanceRun {
  readonly startedAt: string
  readonly wallSeconds: number
  readonly members: readonly string[]
  readonly files: LedgerFile['files']
  readonly memberRuns: LedgerFile['members']
  readonly scope?: { readonly reason: string; readonly skipped: readonly string[] }
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string')

function scopeOf(value: unknown): AcceptanceRun['scope'] | null | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return null
  const { reason, skipped } = value as Record<string, unknown>
  return typeof reason === 'string' && isStrings(skipped) ? { reason, skipped } : null
}

export function acceptanceRun(value: unknown): AcceptanceRun | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { meta, files, members } = value as Record<string, unknown>
  if (typeof meta !== 'object' || meta === null || !Array.isArray(files) || !Array.isArray(members))
    return undefined
  const { script, base, startedAt, wallSeconds, members: ran } = meta as Record<string, unknown>
  const scope = scopeOf((meta as Record<string, unknown>)['scope'])
  if (
    script !== 'acceptance' ||
    scope === null ||
    (base !== null && scope === undefined) ||
    typeof startedAt !== 'string' ||
    typeof wallSeconds !== 'number' ||
    !isStrings(ran)
  )
    return undefined
  const fileRows = files as LedgerFile['files']
  const memberRows = members as LedgerFile['members']
  if (
    !fileRows.every(row => typeof row.file === 'string' && typeof row.seconds === 'number') ||
    !memberRows.every(row => typeof row.member === 'string' && typeof row.wallSeconds === 'number')
  )
    return undefined
  return {
    startedAt,
    wallSeconds,
    members: ran,
    files: fileRows,
    memberRuns: memberRows,
    ...(scope === undefined ? {} : { scope }),
  }
}

export function timingOf(run: AcceptanceRun, members: number, path: string): AcceptanceTiming {
  const reported = new Set(run.files.map(row => row.member))
  const pieces = [
    ...run.files.map(row => ({ path: row.file, seconds: row.seconds })),
    ...run.memberRuns
      .filter(row => !reported.has(row.member))
      .map(row => ({ path: row.member, seconds: row.wallSeconds })),
  ]
  const slowest = pieces.reduce<(typeof pieces)[number] | undefined>(
    (most, piece) => (most === undefined || piece.seconds > most.seconds ? piece : most),
    undefined,
  )
  const skipped = run.scope?.skipped ?? []
  return {
    members,
    files: pieces.length,
    totalSeconds: run.wallSeconds,
    ...(slowest === undefined ? {} : { slowest }),
    ledger: { path, startedAt: run.startedAt },
    ...(run.scope === undefined || skipped.length === 0
      ? {}
      : { skipped: { members: skipped, reason: run.scope.reason } }),
  }
}

export interface AcceptanceLocation {
  readonly root: string
  readonly mainRoot: string
  readonly shortHead: string
  readonly dirty: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  readonly excludeRoots: readonly string[]
}

export function readAcceptanceTiming(at: AcceptanceLocation): Reading<AcceptanceTiming> {
  const members = existsSync(join(at.root, 'pnpm-workspace.yaml'))
    ? listTestMembers(at.root, at.excludeRoots, 'acceptance').map(member => member.path)
    : []
  if (members.length === 0) return data({ members: 0, files: 0, totalSeconds: 0 })
  const home = ledgerHome('acceptance', at.mainRoot, at.env)
  const cell = join(home, `${at.shortHead}${at.dirty ? '-dirty' : ''}`)
  const runs =
    statSync(cell, { throwIfNoEntry: false })?.isDirectory() === true
      ? readdirSync(cell).sort().reverse()
      : []
  let skippedOnly: Reading<AcceptanceTiming> | undefined
  for (const name of runs) {
    const path = join(cell, name, 'ledger.json')
    if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const run = acceptanceRun(parsed)
    if (
      run !== undefined &&
      members.every(
        member => run.members.includes(member) || (run.scope?.skipped.includes(member) ?? false),
      )
    ) {
      if (run.members.length > 0) return data(timingOf(run, members.length, path))
      skippedOnly ??= data(timingOf(run, members.length, path))
    }
  }
  if (skippedOnly !== undefined) return skippedOnly
  return noData(
    `有 ${members.length} 个成员有验收，这个提交（${at.shortHead}${at.dirty ? '，工作树不干净' : ''}）却没有跑全它们的耗时记录（${cell}）：先跑 pnpm run acceptance`,
  )
}
