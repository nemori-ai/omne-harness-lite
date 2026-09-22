import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MigrationProvider } from 'kysely/migration'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { clockLeaseMigration } from '../src/index.ts'
import type { TimeSources } from '../src/index.ts'

export const migrations: MigrationProvider = {
  async getMigrations() {
    return { '0001_clock_lease': clockLeaseMigration }
  },
}

export function tempFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-clock-${label}-`)), 'db.sqlite')
}

export async function openTempStorage(label: string, file = tempFile(label)) {
  return { file, storage: await openStorage({ dialect: 'sqlite', file, migrations }) }
}

/** 可控时间源：墙钟与单调钟都由测试推。 */
export function fakeSources(wall: number, mono = 0) {
  const state = { wall, mono }
  const sources: TimeSources = {
    wall: () => state.wall,
    monotonic: () => BigInt(state.mono) * 1_000_000n,
  }
  return { sources, state }
}
