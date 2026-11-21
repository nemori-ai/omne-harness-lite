import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { NewRow } from '@omne-harness/media-contract'
import { mediaIndexConformanceCases } from '@omne-harness/media-contract/testing'
import type { SqlStorage } from '@omne-harness/sql-contract'
import migration from '../src/migration.ts'
import participant from '../src/participant.ts'
import reader from '../src/read.ts'
import { TABLES } from '../src/schema.ts'
import { createInProcessIndex } from './in-process.ts'

describe('the SQL scripts and reads conform to the index contract, in the test process', () => {
  it.each(mediaIndexConformanceCases)('$name', async conformance => {
    await expect(conformance.run(async () => createInProcessIndex())).resolves.toBeUndefined()
  })
})

const key = (letter: string): string => letter.repeat(32)
const uploading = (letter: string, tenant = 'tenant-one'): NewRow => ({
  key: key(letter),
  tenant,
  storage: 'local',
  mediaType: 'image/png',
  bytes: 10,
  upload: `up-${letter}`,
  expiresAt: '2026-10-19T01:00:00.000Z',
})

describe('the index over its storage', () => {
  it('sends a write as one commit, and a read as one request, of the domain of the tenant', async () => {
    const commits: Parameters<SqlStorage['commit']>[0][] = []
    const reads: Parameters<SqlStorage['read']>[0][] = []
    const index = createInProcessIndex({
      wrap: storage => ({
        ...storage,
        commit: request => (commits.push(request), storage.commit(request)),
        read: request => (reads.push(request), storage.read(request)),
      }),
    })
    await index.insertUploading(uploading('a'))
    await index.readUpload('tenant-one', 'up-a')
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({
      identity: {
        scope: { kind: 'tenant', tenant: 'tenant-one' },
        transactionDomain: 'tenant/in-process/tenant-one',
        operation: 'media.insertUploading',
        protocolVersion: '2',
        recall: 'never',
      },
      combinationVersion: 'in-process/1',
      manifestDigest: 'in-process',
      commands: [{ participant: 'media.index', facts: { script: 'insertUploading' } }],
    })
    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatchObject({
      domain: {
        scope: { kind: 'tenant', tenant: 'tenant-one' },
        transactionDomain: 'tenant/in-process/tenant-one',
      },
      handler: 'media.index.read',
      protocol: 'media-index/1',
      input: { read: 'readUpload', name: 'up-a' },
    })
  })

  it('answers unavailable for a tenant with no storage domain, on a write and on a read', async () => {
    const index = createInProcessIndex({ unbound: ['tenant-two'] })
    const none = {
      failure: { kind: 'unavailable', diagnostic: 'the tenant has no storage domain' },
    }
    expect(await index.insertUploading(uploading('a', 'tenant-two'))).toEqual(none)
    expect(await index.readLive(key('a'), 'tenant-two')).toEqual(none)
    expect(await index.insertUploading(uploading('a'))).toEqual({ ok: null })
  })

  it('answers unknown when the storage does not know whether a commit took place, or broke after it', async () => {
    let mode: 'unknown' | 'throw' = 'unknown'
    const index = createInProcessIndex({
      wrap: storage => ({
        ...storage,
        commit: async request => {
          const result = await storage.commit(request)
          if (request.identity.operation !== 'media.attachWrite') return result
          if (mode === 'throw') throw new Error('the connection broke')
          return { kind: 'unknown', identity: request.identity, diagnostic: null } as never
        },
      }),
    })
    await index.insertUploading(uploading('a'))
    expect(await index.attachWrite('tenant-one', key('a'), 'write-a')).toEqual({
      failure: { kind: 'unknown', diagnostic: 'media.attachWrite has no known result' },
    })
    mode = 'throw'
    expect(await index.attachWrite('tenant-one', key('a'), 'write-b')).toEqual({
      failure: { kind: 'unknown', diagnostic: 'Error: the connection broke' },
    })
    expect(await index.readUpload('tenant-one', 'up-a')).toMatchObject({ ok: { write: 'write-b' } })
  })

  it('answers unavailable for a commit the storage did not take', async () => {
    const index = createInProcessIndex({
      wrap: storage => ({
        ...storage,
        commit: async () => ({ kind: 'rejected' }) as never,
      }),
    })
    expect(await index.insertUploading(uploading('a'))).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media.insertUploading rejected' },
    })
  })

  it('answers unavailable when a read fails, throws or answers another request', async () => {
    let answer: 'unavailable' | 'throw' | 'other' = 'unavailable'
    const index = createInProcessIndex({
      wrap: storage => ({
        ...storage,
        read: async request => {
          if (answer === 'throw') throw new Error('no reader')
          if (answer === 'other')
            return { ...(await storage.read(request)), requestKey: 'another-request' } as never
          return { kind: 'unavailable', requestKey: request.requestKey } as never
        },
      }),
    })
    await index.insertUploading(uploading('a'))
    const read = () => index.readUpload('tenant-one', 'up-a')
    expect(await read()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media.readUpload unavailable' },
    })
    answer = 'other'
    expect(await read()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'media.readUpload read' },
    })
    answer = 'throw'
    expect(await read()).toEqual({
      failure: { kind: 'unavailable', diagnostic: 'Error: no reader' },
    })
  })
})

describe('the modules the storage worker loads', () => {
  const port = (db: DatabaseSync) => ({
    execute(sql: string) {
      db.exec(sql)
      return { columns: [], rows: [], changes: 0n, lastInsertRowid: null }
    },
    requireFact(): never {
      throw new Error('no facts')
    },
    provideFact(): never {
      throw new Error('no facts')
    },
  })

  it('the migration creates every table it declares and verifies them', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(migration.verify(port(db))).toEqual({ kind: 'verified' })
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => (row as { name: string }).name)
    expect(names).toEqual([...TABLES].sort())
  })

  it('the migration does not verify a database that lacks a table', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    db.exec('DROP TABLE md_holds')
    expect(() => migration.verify(port(db))).toThrow(/md_holds/)
  })

  it('a script or a read this member does not know fails, and writes nothing', () => {
    const db = new DatabaseSync(':memory:')
    migration.up(port(db))
    expect(participant.execute({ script: 'dropEverything', command: {} }, port(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_media_script',
    })
    expect(reader.read({ read: 'everything', name: '', limit: 1 }, port(db))).toEqual({
      kind: 'failed',
      diagnostic: 'unknown_media_read',
    })
  })
})
