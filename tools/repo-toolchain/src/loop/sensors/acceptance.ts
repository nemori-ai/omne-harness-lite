// 验收耗时：这个提交上最近一次跑全了的可执行验收花了多久、最慢的一份花了多久、一共几份。
// 读的是测试运行器以 `--script acceptance` 写下的账本（`make acceptance`，或 `make check` 里按计划跑的那一步），不自己跑验收。
// 没有任何成员有 `acceptance` 脚本时读数是「0 份」——这是量过了；有验收却找不到这个提交的记录才是没数据。
// `make check` 的计划跳过了某些成员的验收时，账本的 `scope` 写明跳了谁、为什么：被跳过的成员算交代过了，
// 读数带上「跳过」，一份都没跑时耗时指标如实是没数据，而不是 0 秒。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listTestMembers } from '../../core/workspace.ts'
import { ledgerHome } from '../../core/test-ledger.ts'
import type { LedgerFile } from '../../core/test-ledger.ts'
import { data, noData, type Reading } from '../reading.ts'

export interface AcceptanceTiming {
  /** 有 `acceptance` 脚本的成员数。 */
  readonly members: number
  /** 验收的份数：账本里的验收文件数（没出 vitest 报告的成员按一份计）。 */
  readonly files: number
  /** 整次运行的墙钟（秒）。 */
  readonly totalSeconds: number
  /** 最慢的一份；0 份时没有。 */
  readonly slowest?: { readonly path: string; readonly seconds: number }
  /** 读数出自哪份账本、那次运行何时开始；0 份时没有。 */
  readonly ledger?: { readonly path: string; readonly startedAt: string }
  /** 计划跳过、没跑的有验收的成员与原因；没跳过时没有。 */
  readonly skipped?: { readonly members: readonly string[]; readonly reason: string }
}

/** 一份账本里这个传感器要的部分。 */
export interface AcceptanceRun {
  readonly startedAt: string
  readonly wallSeconds: number
  /** 这次跑了的成员目录。 */
  readonly members: readonly string[]
  readonly files: LedgerFile['files']
  readonly memberRuns: LedgerFile['members']
  /** 按计划跑时没跑的成员与原因。 */
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

/** 既不是全量、也不是带 `scope` 的按计划验收运行，或形状不对，返回 undefined。 */
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

/** 纯函数：一次验收运行的读数。 */
export function timingOf(run: AcceptanceRun, members: number, path: string): AcceptanceTiming {
  const reported = new Set(run.files.map(row => row.member))
  const pieces = [
    ...run.files.map(row => ({ path: row.file, seconds: row.seconds })),
    // 脚本不是 vitest、或没写出报告的成员，只有成员一级的耗时，按一份计。
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
  /** 被量的检出。 */
  readonly root: string
  readonly mainRoot: string
  readonly shortHead: string
  readonly dirty: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  /** 回路配置 `sensors.acceptance.excludeRoots`，与测试运行的排除根目录一致。 */
  readonly excludeRoots: readonly string[]
}

/**
 * 这个提交（不干净时是带 `-dirty` 的那一格）下最近一次交代了全部有验收的成员的运行：跑了，或计划写明跳过了。
 */
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
  // 真跑过验收的记录优先：同一个提交上既有实测、又有后来一次「跳过」的，读数取实测。
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
    `有 ${members.length} 个成员有验收，这个提交（${at.shortHead}${at.dirty ? '，工作树不干净' : ''}）却没有跑全它们的耗时记录（${cell}）：先跑 make acceptance`,
  )
}
