import type { DatabaseSync } from 'node:sqlite'

export const MIN_SQLITE_VERSION = '3.51.3'

function parts(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isSupportedSqliteVersion(version: string): boolean {
  const have = parts(version)
  const floor = parts(MIN_SQLITE_VERSION) as number[]
  if (have === null) return false
  for (let index = 0; index < 3; index += 1) {
    const a = have[index] as number
    const b = floor[index] as number
    if (a !== b) return a > b
  }
  return true
}

export type PragmaJudgement =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'mismatch'; diagnostic: string }>

function read(db: DatabaseSync, name: string): unknown {
  const row = db.prepare(`pragma ${name}`).get() as Record<string, unknown> | undefined
  return row?.[name]
}

export function applyPragmas(
  db: DatabaseSync,
  config: Readonly<{ walAutocheckpointPages: number; journalSizeLimitBytes: number }>,
): PragmaJudgement {
  const expected: readonly [string, string | number, unknown][] = [
    ['journal_mode', 'WAL', 'wal'],
    ['synchronous', 'FULL', 2],
    ['foreign_keys', 'ON', 1],
    ['wal_autocheckpoint', config.walAutocheckpointPages, config.walAutocheckpointPages],
    ['journal_size_limit', config.journalSizeLimitBytes, config.journalSizeLimitBytes],
  ]
  for (const [name, value, want] of expected) {
    db.exec(`pragma ${name} = ${String(value)}`)
    const got = read(db, name)
    if (got !== want) return { kind: 'mismatch', diagnostic: `pragma_${name}_mismatch` }
  }
  return { kind: 'ok' }
}
