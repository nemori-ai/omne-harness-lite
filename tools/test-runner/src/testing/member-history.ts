// 成员上一次的读数：排队次序与要多少令牌的依据。长的先去要令牌，最长的那条链才不会排在最后；
// 文件数定一个成员这一层最多用得上几个 vitest 进程。读数来自账本目录里最近的几份 ledger.json。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RunTier } from './config.ts'
import type { LedgerFile } from './ledger.ts'

/** 一个成员这一层上一次跑的墙钟秒数与用例文件数。 */
export interface MemberReading {
  readonly seconds: number
  readonly files: number
}

/** 最多翻几份账本：够把常跑的成员都找到，又不在每次运行开头读几百份。 */
const LEDGERS_READ = 20

/** 账本目录 `<home>/<头>/<时刻>[-<层>]/ledger.json` 里这一层的运行目录名。 */
function tierOf(runName: string): RunTier | undefined {
  const match = /^\d{8}-\d{6}(?:-(fast|slow))?$/u.exec(runName)
  if (match === null) return undefined
  return (match[1] as RunTier | undefined) ?? 'all'
}

/**
 * 这一层最近 `LEDGERS_READ` 份账本里，每个成员最近一次的读数。读不到的账本跳过；
 * 没有任何读数的成员不在表里（排队时排最前，要令牌按上限算）。
 */
export function memberHistory(home: string, tier: RunTier): Map<string, MemberReading> {
  const ledgers: { path: string; mtime: number }[] = []
  let heads: string[]
  try {
    heads = readdirSync(home)
  } catch {
    return new Map()
  }
  for (const head of heads) {
    let runs: string[]
    try {
      runs = readdirSync(join(home, head))
    } catch {
      continue
    }
    for (const run of runs) {
      if (tierOf(run) !== tier) continue
      const path = join(home, head, run, 'ledger.json')
      try {
        ledgers.push({ path, mtime: statSync(path).mtimeMs })
      } catch {
        // 没有账本的运行目录（跑到一半被打断）
      }
    }
  }
  ledgers.sort((a, b) => b.mtime - a.mtime)
  const readings = new Map<string, MemberReading>()
  for (const { path } of ledgers.slice(0, LEDGERS_READ)) {
    let ledger: Partial<LedgerFile>
    try {
      ledger = JSON.parse(readFileSync(path, 'utf8')) as Partial<LedgerFile>
    } catch {
      continue
    }
    for (const row of ledger.members ?? [])
      if (!readings.has(row.member) && row.exitCode === 0)
        readings.set(row.member, { seconds: row.wallSeconds, files: row.files })
  }
  return readings
}

/** 排队次序：上一次用时从长到短，没有读数的排最前；同样长的保持原次序。 */
export function longestFirst<T extends { readonly path: string }>(
  members: readonly T[],
  history: ReadonlyMap<string, MemberReading>,
): T[] {
  const seconds = (member: T) => history.get(member.path)?.seconds ?? Infinity
  return [...members].sort((a, b) => seconds(b) - seconds(a))
}
