// 验收耗时：这个提交上最近一次全量跑完的可执行验收花了多久、最慢的一份花了多久、一共几份。
// 读的是测试运行器以 `--script acceptance` 写下的账本（`make acceptance`，`make check` 里也跑它），不自己跑验收。
// 没有任何成员有 `acceptance` 脚本时读数是「0 份」——这是量过了；有验收却找不到这个提交的记录才是没数据。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { listTestMembers } from '../../testing/affected.ts'
import { ledgerHome } from '../../testing/config.ts'
import type { LedgerFile } from '../../testing/ledger.ts'
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
}

/** 一份账本里这个传感器要的部分。 */
export interface AcceptanceRun {
  readonly startedAt: string
  readonly wallSeconds: number
  /** 这次跑了的成员目录。 */
  readonly members: readonly string[]
  readonly files: LedgerFile['files']
  readonly memberRuns: LedgerFile['members']
}

/** 不是一次全量的验收运行、或形状不对，返回 undefined。 */
export function acceptanceRun(value: unknown): AcceptanceRun | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { meta, files, members } = value as Record<string, unknown>
  if (typeof meta !== 'object' || meta === null || !Array.isArray(files) || !Array.isArray(members))
    return undefined
  const { script, base, startedAt, wallSeconds, members: ran } = meta as Record<string, unknown>
  if (
    script !== 'acceptance' ||
    base !== null ||
    typeof startedAt !== 'string' ||
    typeof wallSeconds !== 'number' ||
    !Array.isArray(ran) ||
    !ran.every(path => typeof path === 'string')
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
    members: ran as string[],
    files: fileRows,
    memberRuns: memberRows,
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
  return {
    members,
    files: pieces.length,
    totalSeconds: run.wallSeconds,
    ...(slowest === undefined ? {} : { slowest }),
    ledger: { path, startedAt: run.startedAt },
  }
}

export interface AcceptanceLocation {
  /** 被量的检出。 */
  readonly root: string
  readonly mainRoot: string
  readonly shortHead: string
  readonly dirty: boolean
  readonly env: Readonly<Record<string, string | undefined>>
  /** 与测试运行同一份的排除根目录。 */
  readonly excludeRoots: readonly string[]
}

/** 这个提交（不干净时是带 `-dirty` 的那一格）下最近一次覆盖了全部有验收的成员的运行。 */
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
    if (run !== undefined && members.every(member => run.members.includes(member)))
      return data(timingOf(run, members.length, path))
  }
  return noData(
    `有 ${members.length} 个成员有验收，这个提交（${at.shortHead}${at.dirty ? '，工作树不干净' : ''}）却没有跑全它们的耗时记录（${cell}）：先跑 make acceptance`,
  )
}
