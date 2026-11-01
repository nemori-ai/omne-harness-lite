// DO-1 steps 3 and 4 as units: the version floor and the PRAGMA read-back (SQL contract SPEC 5.3).
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { MIN_SQLITE_VERSION, applyPragmas, isSupportedSqliteVersion } from '../src/worker/open.ts'

const settings = { walAutocheckpointPages: 1000, journalSizeLimitBytes: 67108864 }

describe('sqlite version floor', () => {
  it('states the floor of the spec', () => {
    expect(MIN_SQLITE_VERSION).toBe('3.51.3')
  })

  it('refuses a version below 3.51.3 and accepts the floor and above', () => {
    for (const low of ['3.51.2', '3.50.9', '3.9.0', '2.99.99', '3.0.0']) {
      expect(isSupportedSqliteVersion(low), low).toBe(false)
    }
    for (const fine of ['3.51.3', '3.51.10', '3.52.0', '3.54.0', '4.0.0']) {
      expect(isSupportedSqliteVersion(fine), fine).toBe(true)
    }
  })

  it('refuses a text that is not a version', () => {
    expect(isSupportedSqliteVersion('')).toBe(false)
    expect(isSupportedSqliteVersion('abc')).toBe(false)
  })

  it('the Node SQLite of this host meets the floor', () => {
    const db = new DatabaseSync(':memory:')
    const row = db.prepare('select sqlite_version() as v').get() as { v: string }
    db.close()
    expect(isSupportedSqliteVersion(row.v)).toBe(true)
  })
})

describe('pragma read-back', () => {
  const dir = Promise.resolve().then(async () =>
    realpath(await mkdtemp(join(tmpdir(), 'sqlite-pragma-'))),
  )
  afterAll(async () => rm(await dir, { recursive: true, force: true }))

  it('accepts a file database that takes WAL, FULL and foreign keys', async () => {
    const db = new DatabaseSync(join(await dir, 'ok.sqlite'))
    expect(applyPragmas(db, settings)).toEqual({ kind: 'ok' })
    expect(db.prepare('pragma journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(db.prepare('pragma synchronous').get()).toEqual({ synchronous: 2 })
    expect(db.prepare('pragma foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(db.prepare('pragma wal_autocheckpoint').get()).toEqual({ wal_autocheckpoint: 1000 })
    expect(db.prepare('pragma journal_size_limit').get()).toEqual({ journal_size_limit: 67108864 })
    db.close()
  })

  it('reports a mismatch when the database cannot take WAL', () => {
    const db = new DatabaseSync(':memory:')
    const judged = applyPragmas(db, settings)
    db.close()
    expect(judged.kind).toBe('mismatch')
  })
})
