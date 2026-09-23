import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import {
  StorageUnavailable,
  composeMigrations,
  type Storage,
  type StorageInstance,
} from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { clockMigrations } from '../src/index.ts'
import type { ClockLogger, TimeSources } from '../src/index.ts'

export const migrations = composeMigrations(clockMigrations)

export function tempFile(label: string): string {
  return join(mkdtempSync(join(tmpdir(), `omne-clock-${label}-`)), 'db.sqlite')
}

/** 包内测试的存储：sqlite 临时文件库 + 本包迁移，不开升级守卫（测试夹具，不是生产库）。 */
export async function openTempStorage(label: string, file = tempFile(label)) {
  return {
    file,
    storage: await openStorage({ dialect: 'sqlite', file, migrations, upgrade: false }),
  }
}

/** 可控时间源：墙钟与单调钟都由测试推（现读墙钟之后单调钟不再参与，保留以核对它确实不参与）。 */
export function fakeSources(wall: number, mono = 0) {
  const state = { wall, mono }
  const sources: TimeSources = {
    wall: () => state.wall,
    monotonic: () => BigInt(state.mono) * 1_000_000n,
  }
  return { sources, state }
}

export interface LogRecord {
  readonly level: 'info' | 'warn' | 'error'
  readonly text: string
}

export function recordingLogger(): { logger: ClockLogger; records: LogRecord[] } {
  const records: LogRecord[] = []
  const at =
    (level: LogRecord['level']) =>
    (format: string, ...args: unknown[]) =>
      records.push({ level, text: [format, ...args.map(String)].join(' | ') })
  return { logger: { info: at('info'), warn: at('warn'), error: at('error') }, records }
}

/** 在真实存储外包一层：可让写失败（StorageUnavailable），或把写挡住直到放行；计写次数。 */
export function controllableStorage(inner: StorageInstance) {
  const state = {
    failing: false,
    writes: 0,
    gate: undefined as Promise<void> | undefined,
  }
  const storage: Storage = {
    read: fn => inner.read(fn),
    async write(fn) {
      state.writes += 1
      if (state.gate !== undefined) await state.gate
      if (state.failing) throw new StorageUnavailable('injected: storage unavailable')
      return inner.write(fn)
    },
  }
  const hold = (): (() => void) => {
    let release!: () => void
    state.gate = new Promise<void>(resolve => {
      release = () => {
        state.gate = undefined
        resolve()
      }
    })
    return release
  }
  return { storage, state, hold }
}

export async function readLease(
  storage: Storage,
): Promise<{ lease_until: number; written_at: number } | undefined> {
  return storage.read(
    async tx =>
      (await sql`SELECT lease_until, written_at FROM clock_lease WHERE id = 1`.execute(tx.db))
        .rows[0] as { lease_until: number; written_at: number } | undefined,
  )
}

const yieldOnce = () => new Promise<void>(resolve => setImmediate(resolve))

/** 让出事件循环（不依赖被伪造的 setInterval）直到条件成立；等在途的续约写收场。 */
export async function settle(until: () => boolean | Promise<boolean>, rounds = 200): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    if (await until()) return
    await yieldOnce()
  }
  throw new Error('condition not reached')
}

/** 无条件让出若干轮：用于断言「在这段时间里没有发生某事」。 */
export async function drain(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await yieldOnce()
}
