import { mkdir, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeMigrations, type Storage } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import {
  createModelCallContentStore,
  modelCallContentMigrations,
} from '../src/reference-content.ts'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type { SettlementStagedBatch } from '../src/settlement-types.ts'
import { session, tenant } from './log-codec-fixture.ts'

const policy = { maxConcurrentWrites: 4, maxContentBytes: 1000000 }
const generation = Object.freeze({})
const unused = async (): Promise<never> => {
  throw new Error('the work store never touches the session log')
}
const binding: SettlementLogBinding = {
  tenant,
  session,
  log: { append: unused, readSince: unused, readByKey: unused },
  generation,
  currentGeneration: () => generation,
}
const key = { binding, call: 'call-w', response: 'response-w' }

function batch(marker: string): SettlementStagedBatch {
  return {
    target: { call: 'call-w', dispatch: 1, response: 'response-w' },
    current: { messageId: 'message-w', disposition: { vetoed: { by: 'gate' } } },
    entries: [{ tenant, dedupeKey: `dedupe-${marker}`, readKeys: ['read-w'], payload: { marker } }],
    condition: { kind: 'unconditional' },
  }
}

async function withStorage(run: (storage: Storage) => Promise<void>) {
  const root = fileURLToPath(
    new URL('../../../../tmp/model-request-runtime/ref-runtime/work/', import.meta.url),
  )
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'sqlite-'))
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(dir, 'work.sqlite'),
    upgrade: false,
    migrations: composeMigrations(modelCallContentMigrations('sqlite')),
  })
  try {
    await run(storage)
  } finally {
    await storage.close()
  }
}

/** Real SQLite underneath; `write` may commit and then lose its receipt, `read` may fail. */
function faulty(storage: Storage) {
  const faults = { loseWriteReceipt: false, failRead: false }
  const wrapped: Storage = {
    read: async fn => {
      if (faults.failRead) throw new Error('read unavailable')
      return await storage.read(fn)
    },
    write: async fn => {
      const result = await storage.write(fn)
      if (faults.loseWriteReceipt) throw new Error('receipt lost after commit')
      return result
    },
  }
  return { storage: wrapped, faults }
}

describe('RT12 S-99⑧ settlement work rows on real SQLite', () => {
  it('stages once per ResponseId, returns an occupying work and replaces only its own generation', async () => {
    await withStorage(async storage => {
      const store = createModelCallContentStore({ storage, policy }).work
      expect(await store.read(key)).toEqual({ absent: true })
      expect(
        await store.stage({ ...key, workId: 'work-a', owner: 'runtime-1', staged: batch('a1') }),
      ).toEqual({ staged: { generation: 1 } })
      // The same stage read back is recognized; another work never replaces the row.
      expect(
        await store.stage({ ...key, workId: 'work-a', owner: 'runtime-1', staged: batch('a1') }),
      ).toEqual({ staged: { generation: 1 } })
      expect(
        await store.stage({ ...key, workId: 'work-b', owner: 'runtime-2', staged: batch('b1') }),
      ).toMatchObject({ occupied: { workId: 'work-a', generation: 1, owner: 'runtime-1' } })
      expect(
        await store.replace({ ...key, workId: 'work-a', generation: 1, staged: batch('a2') }),
      ).toEqual({ staged: { generation: 2 } })
      // A late worker holding generation 1 is refused; the durable batch stays a2.
      expect(
        await store.replace({ ...key, workId: 'work-a', generation: 1, staged: batch('stale') }),
      ).toEqual({ rejected: true })
      expect(await store.remove({ ...key, workId: 'work-a', generation: 1 })).toEqual({
        rejected: true,
      })
      const read = await store.read(key)
      expect(read).toMatchObject({ work: { workId: 'work-a', generation: 2 } })
      if (!('work' in read)) throw new Error('work')
      expect(read.work.staged).toEqual(batch('a2'))
      expect(await store.remove({ ...key, workId: 'work-a', generation: 2 })).toEqual({
        removed: true,
      })
      expect(await store.read(key)).toEqual({ absent: true })
    })
  })

  it('A22-V14 (seam E): a late worker of an older work never writes or deletes the new work row', async () => {
    await withStorage(async storage => {
      const store = createModelCallContentStore({ storage, policy }).work
      expect(
        await store.stage({ ...key, workId: 'old', owner: 'runtime-1', staged: batch('old') }),
      ).toEqual({ staged: { generation: 1 } })
      expect(await store.remove({ ...key, workId: 'old', generation: 1 })).toEqual({
        removed: true,
      })
      expect(
        await store.stage({ ...key, workId: 'new', owner: 'runtime-1', staged: batch('new') }),
      ).toEqual({ staged: { generation: 1 } })
      // The old work's late replace and delete, generation equal to the new row's, are refused.
      expect(
        await store.replace({ ...key, workId: 'old', generation: 1, staged: batch('late') }),
      ).toEqual({ rejected: true })
      expect(await store.remove({ ...key, workId: 'old', generation: 1 })).toEqual({
        rejected: true,
      })
      const read = await store.read(key)
      expect(read).toMatchObject({ work: { workId: 'new', generation: 1 } })
      if (!('work' in read)) throw new Error('work')
      expect(read.work.staged).toEqual(batch('new'))
    })
  })

  it('R3: a lost delete receipt counts as deleted only when the row is read as absent', async () => {
    await withStorage(async real => {
      const { storage, faults } = faulty(real)
      const store = createModelCallContentStore({ storage, policy }).work
      expect(
        await store.stage({ ...key, workId: 'w', owner: 'runtime-1', staged: batch('w') }),
      ).toEqual({ staged: { generation: 1 } })
      // The delete commits, its receipt is lost, and the recognition read also fails.
      faults.loseWriteReceipt = true
      faults.failRead = true
      expect(await store.remove({ ...key, workId: 'w', generation: 1 })).toEqual({
        pending: 'receipt_unknown',
      })
      // A failed read never proves absence; a later exact read does.
      faults.failRead = false
      expect(await store.remove({ ...key, workId: 'w', generation: 1 })).toEqual({ removed: true })
      faults.loseWriteReceipt = false
      expect(await store.read(key)).toEqual({ absent: true })
      faults.failRead = true
      expect(await store.read(key)).toEqual({ unavailable: true })
    })
  })

  it('a stage or replace whose receipt is lost is recognized from the row itself', async () => {
    await withStorage(async real => {
      const { storage, faults } = faulty(real)
      const store = createModelCallContentStore({ storage, policy }).work
      faults.loseWriteReceipt = true
      expect(
        await store.stage({ ...key, workId: 'w', owner: 'runtime-1', staged: batch('w1') }),
      ).toEqual({ staged: { generation: 1 } })
      expect(
        await store.replace({ ...key, workId: 'w', generation: 1, staged: batch('w2') }),
      ).toEqual({ staged: { generation: 2 } })
      faults.failRead = true
      expect(
        await store.replace({ ...key, workId: 'w', generation: 2, staged: batch('w3') }),
      ).toEqual({ unavailable: true })
    })
  })
})
