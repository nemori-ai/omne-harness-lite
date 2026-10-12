import { Kysely, sql } from 'kysely'
import { stat } from 'node:fs/promises'
import type { PreflightCheck, PreflightResult } from '@omne-harness-lite/storage'
import { NodeSqliteDialect } from '@omne-harness-lite/storage-sql'
import { readManifest } from './resource-manifest.ts'
import { leaseRow, type ClockLeaseTable } from './lease.ts'
import { clockPreflight, CLOCK_PREFLIGHT_CHECK } from './preflight.ts'
import { isRolledBack, systemTimeSources, type TimeSources } from './lease-policy.ts'

/** Read-only observation before business migrations. Resource startup rechecks it under ownership. */
export function clockResourcePreflight(
  options: { readonly file: string; readonly initialize?: boolean },
  sources: TimeSources = systemTimeSources,
): PreflightCheck {
  return async input => {
    if (options.initialize) {
      const legacy = await clockPreflight(sources)(input)
      if (!legacy.ok) return legacy
    }
    const manifest = await readManifest(`${options.file}.clock.json`)
    if (!manifest)
      return options.initialize
        ? { ok: true }
        : refused('clock resource is missing; explicit initialization is required')
    if (manifest.phase === 'ready' && options.initialize)
      return refused('clock resource already exists; open it without initialization')
    const persisted = await readWrittenAt(options.file, manifest.phase === 'prepared')
    return floorResult(Math.max(persisted, manifest.floor.writtenAt), sources)
  }
}

async function readWrittenAt(file: string, prepared: boolean): Promise<number> {
  const info = await stat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' && prepared) return undefined
    throw error
  })
  if (!info) return 0
  // Native read-only mode never creates a missing file or changes its journal mode.
  const db = new Kysely<ClockLeaseTable>({
    dialect: new NodeSqliteDialect({ file, role: 'read', readOnly: true }),
  })
  try {
    const table =
      await sql`SELECT 1 FROM sqlite_master WHERE type='table' AND name='clock_lease'`.execute(db)
    if (prepared && table.rows.length === 0) return 0
    const raw = await db
      .selectFrom('clock_lease')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst()
    if (!raw && prepared) return 0
    if (!raw) throw new Error('clock resource has no durable floor')
    const row = leaseRow(raw)
    if (row.written_at < 0 || row.written_at > row.lease_until)
      throw new Error('clock resource has an invalid durable floor')
    return row.written_at
  } finally {
    await db.destroy()
  }
}

function refused(detail: string): PreflightResult {
  return { ok: false, check: CLOCK_PREFLIGHT_CHECK, detail }
}
function floorResult(writtenAt: number, sources: TimeSources): PreflightResult {
  const wall = sources.wall()
  return isRolledBack(wall, { written_at: writtenAt })
    ? refused(
        `wall clock ${wall} is earlier than the latest time the center used (clock_lease.written_at = ${writtenAt})`,
      )
    : { ok: true }
}
