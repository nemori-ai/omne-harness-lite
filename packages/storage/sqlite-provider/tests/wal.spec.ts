// WAL maintenance (SQL contract SPEC 12.3, C19): checkpoint cadence, the read-paused and
// write-stopped states, FULL kept, and a query that is not starved while maintenance cannot finish.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageCloseResult } from '@omne-harness/sql-contract'
import { createSqliteStorage } from '../src/index.ts'
import type { ReadPoolPort } from '../src/close.ts'
import { WalMaintainer } from '../src/worker/wal.ts'
import type { WalState } from '../src/worker/protocol.ts'
import {
  DOMAIN,
  buildMaterials,
  commitRequest,
  defaultConfig,
  identity,
  kindOf,
  leases,
  makeWorkspace,
  registration,
  type Built,
  type Workspace,
} from './support.ts'

const THRESHOLDS = {
  checkpointIntervalMs: 20,
  checkpointWalBytes: 8000,
  walReadPauseBytes: 30000,
  walWriteStopBytes: 60000,
}

describe('WalMaintainer', () => {
  let dir: string
  let writer: DatabaseSync
  let reader: DatabaseSync | null
  let clock: number
  const emitted: WalState[] = []

  const maintainer = (): WalMaintainer =>
    new WalMaintainer(
      { file: join(dir, 'm.sqlite'), lockWaitMs: 5000, ...THRESHOLDS },
      () => writer,
      state => emitted.push(state),
      () => clock,
    )

  const grow = (rows: number): void => {
    for (let index = 0; index < rows; index += 1)
      writer.prepare('insert into t(v) values (?)').run('x'.repeat(3000))
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-wal-'))
    writer = new DatabaseSync(join(dir, 'm.sqlite'), { timeout: 5000 })
    writer.exec('pragma journal_mode=WAL; pragma synchronous=FULL; pragma wal_autocheckpoint=0')
    writer.exec('create table t(id integer primary key, v text)')
    writer.prepare('insert into t(v) values (?)').run('seed')
    reader = null
    clock = 1_000_000
    emitted.length = 0
  })

  afterEach(async () => {
    reader?.close()
    writer.close()
    await rm(dir, { recursive: true, force: true })
  })

  const holdReader = (): void => {
    reader = new DatabaseSync(join(dir, 'm.sqlite'), { readOnly: true })
    reader.exec('begin')
    reader.prepare('select count(*) from t').get()
  }

  it('runs a PASSIVE checkpoint when the interval passed or the WAL is over checkpointWalBytes, and not before', () => {
    const wal = maintainer()
    expect(wal.tick()).toEqual({ ran: null })
    clock += THRESHOLDS.checkpointIntervalMs
    expect(wal.tick()).toEqual({ ran: 'PASSIVE' })
    expect(wal.tick()).toEqual({ ran: null })
    grow(8)
    expect(wal.tick()).toEqual({ ran: 'PASSIVE' })
  })

  it('goes read-paused, then write-stopped, and back to normal once the reader is gone', () => {
    const wal = maintainer()
    holdReader()
    grow(24)
    for (let turn = 0; turn < 8; turn += 1) {
      clock += THRESHOLDS.checkpointIntervalMs
      wal.tick()
    }
    expect(emitted).toEqual(['read-paused', 'write-stopped'])
    expect(wal.state).toBe('write-stopped')
    reader?.exec('rollback')
    clock += THRESHOLDS.checkpointIntervalMs
    expect(wal.tick()).toEqual({ ran: 'TRUNCATE' })
    expect(emitted).toEqual(['read-paused', 'write-stopped', 'normal'])
  })

  it('does not go read-paused for a large WAL that the checkpoint keeps shrinking', () => {
    const wal = maintainer()
    grow(24)
    let ran = 0
    for (let turn = 0; turn < 6; turn += 1) {
      clock += THRESHOLDS.checkpointIntervalMs
      if (wal.tick().ran !== null) ran += 1
      grow(2)
    }
    expect(ran).toBe(6)
    expect(wal.state).toBe('normal')
    expect(emitted).toEqual([])
  })

  it('keeps synchronous FULL and journal_mode WAL in every state', () => {
    const wal = maintainer()
    holdReader()
    grow(24)
    let ran = 0
    for (let turn = 0; turn < 8; turn += 1) {
      clock += THRESHOLDS.checkpointIntervalMs
      if (wal.tick().ran !== null) ran += 1
      const sync = writer.prepare('pragma synchronous').get() as { synchronous: number }
      const mode = writer.prepare('pragma journal_mode').get() as { journal_mode: string }
      expect(sync.synchronous).toBe(2)
      expect(mode.journal_mode).toBe('wal')
    }
    expect(ran).toBeGreaterThan(0)
  })
})

describe('write-stopped through the provider', () => {
  let workspace: Workspace
  let built: Built
  let closing: Promise<StorageCloseResult> | null = null

  beforeEach(async () => {
    workspace = await makeWorkspace()
    built = await buildMaterials(workspace)
  })

  afterEach(async () => {
    await closing?.catch(() => undefined)
    await workspace.remove()
  })

  it('refuses commit with domain_unavailable, still answers query, pauses reads, and recovers', async () => {
    const calls: string[] = []
    const readPool: ReadPoolPort = {
      pause: domain => void calls.push(`pause:${domain}`),
      resume: domain => void calls.push(`resume:${domain}`),
      close: () => Promise.resolve(),
      residuals: () => [],
    }
    const created = await createSqliteStorage(
      {
        config: {
          ...defaultConfig(workspace.storageRoot),
          checkpointIntervalMs: 20,
          checkpointWalBytes: 6000,
          journalSizeLimitBytes: 6000,
          walReadPauseBytes: 24000,
          walWriteStopBytes: 48000,
        },
        materials: built.catalog,
        closeLeases: leases,
      },
      { readPool },
    )
    if (created.kind !== 'created') throw new Error('rejected')
    const { storage, control } = created
    expect((await storage.registerCombination(registration(built))).kind).toBe('registered')
    const file = join(
      workspace.storageRoot,
      'domains',
      `${Buffer.from(DOMAIN).toString('hex')}.sqlite`,
    )
    const reader = new DatabaseSync(file, { readOnly: true })
    reader.exec('begin')
    reader.prepare('select count(*) from t_ledger').get()
    try {
      let stopped = false
      for (let index = 0; index < 60 && !stopped; index += 1) {
        const result = await storage.commit(
          commitRequest(built, { identity: identity({ operationKey: `k${String(index)}` }) }),
        )
        if (kindOf(result) === 'rejected_before_accept/domain_unavailable') stopped = true
        else expect(kindOf(result)).toBe('committed')
        await new Promise(resolve => setTimeout(resolve, 40))
      }
      expect(stopped).toBe(true)
      const began = Date.now()
      expect(kindOf(await storage.query(identity({ operationKey: 'k0' })))).toBe('committed')
      expect(Date.now() - began).toBeLessThan(1500)
      expect(calls).toContain(`pause:${DOMAIN}`)
    } finally {
      reader.exec('rollback')
      reader.close()
    }
    await vi.waitFor(
      async () => {
        const again = await storage.commit(
          commitRequest(built, {
            identity: identity({ operationKey: `again-${String(Date.now())}` }),
          }),
        )
        expect(kindOf(again)).toBe('committed')
      },
      { timeout: 5000, interval: 100 },
    )
    expect(calls).toContain(`resume:${DOMAIN}`)
    closing = control.close({ initiator: 'disposal' })
  })
})
