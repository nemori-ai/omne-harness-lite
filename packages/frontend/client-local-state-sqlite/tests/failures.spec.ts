import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { sql } from 'kysely'
import { LocalState } from '../src/store.ts'
import { createStatePersistence } from '../src/state-sql.ts'
import type { LocalStateStorage } from '@omne-harness-lite/client-local-state'
import { config, deferred, fixtures, logged, read } from './support.ts'

describe('commit uncertainty and ownership', () => {
  const f = fixtures()
  async function fixture() {
    const directory = await f.directory()
    const initialized = await f.open(directory)
    await initialized.close()
    return openStorage({
      dialect: 'sqlite',
      file: join(directory, 'client.sqlite'),
      synchronous: 'full',
    })
  }

  it('does not call a completed but unconfirmed commit not-installed', async () => {
    const storage = await fixture()
    const wrapped: LocalStateStorage = {
      read: fn => storage.read(fn),
      write: fn => storage.write(fn),
      close: () => storage.close(),
      async atomic(fn) {
        await storage.atomic(fn)
        throw new StorageUnavailable('lost confirmation')
      },
    }
    const s = f.own(
      new LocalState(
        createStatePersistence(wrapped),
        async () => {},
        async () => {},
      ),
    )
    const first = await read(s)
    expect(await s.compareAndReplace(first.token, logged, 'unknown-commit')).toEqual({
      kind: 'unconfirmed',
    })
    expect(await read(s)).toMatchObject({
      storeId: first.storeId,
      operationId: 'unknown-commit',
      value: logged,
    })
  })

  it('keeps uncertainty when an unavailable transaction leaves the original version visible', async () => {
    const storage = await fixture()
    const wrapped: LocalStateStorage = {
      read: fn => storage.read(fn),
      write: fn => storage.write(fn),
      close: () => storage.close(),
      atomic: async () => {
        throw new StorageUnavailable('cannot begin')
      },
    }
    const s = f.own(
      new LocalState(
        createStatePersistence(wrapped),
        async () => {},
        async () => {},
      ),
    )
    expect(await s.compareAndReplace((await read(s)).token, logged, 'unseen')).toEqual({
      kind: 'unconfirmed',
    })
    expect(await read(s)).toMatchObject({ revision: 0, operationId: null, value: null })
  })

  it('rolls back provisional mutation when the transaction fails', async () => {
    const storage = await fixture()
    const wrapped: LocalStateStorage = {
      read: fn => storage.read(fn),
      write: fn => storage.write(fn),
      close: () => storage.close(),
      atomic: fn =>
        storage.atomic(async unit => {
          await fn(unit)
          throw new StorageUnavailable('rollback after update')
        }),
    }
    const s = f.own(
      new LocalState(
        createStatePersistence(wrapped),
        async () => {},
        async () => {},
      ),
    )
    expect(await s.compareAndReplace((await read(s)).token, logged, 'rolled-back')).toEqual({
      kind: 'unconfirmed',
    })
    expect((await read(s)).value).toBe(null)
  })

  it('requires postcommit directory sync before reporting installed', async () => {
    const storage = await fixture()
    const s = f.own(
      new LocalState(
        createStatePersistence(storage),
        async () => {
          throw Object.assign(new Error('fsync'), { code: 'EIO' })
        },
        async () => {},
      ),
    )
    expect(await s.compareAndReplace((await read(s)).token, config, 'directory-unknown')).toEqual({
      kind: 'unconfirmed',
    })
    expect((await read(s)).operationId).toBe('directory-unknown')
  })

  it('handles actual SQLITE_FULL as an unconfirmed replace and retains the previous record', async () => {
    const storage = await fixture()
    const s = f.own(
      new LocalState(
        createStatePersistence(storage),
        async () => {},
        async () => {},
      ),
    )
    await s.compareAndReplace((await read(s)).token, logged, 'before-full')
    await storage.write(async tx => {
      const pages = (await sql<{ page_count: number }>`PRAGMA page_count`.execute(tx.db)).rows[0]!
        .page_count
      await sql.raw(`PRAGMA max_page_count = ${pages}`).execute(tx.db)
    })
    const original = await read(s)
    const larger = {
      ...logged,
      center: {
        ...logged.center,
        endpoint: `https://center.example.invalid/${'x'.repeat(1024 * 1024)}`,
      },
    }
    expect(await s.compareAndReplace(original.token, larger, 'actual-full')).toEqual({
      kind: 'unconfirmed',
    })
    expect(await read(s)).toMatchObject({
      revision: original.revision,
      operationId: 'before-full',
      value: logged,
    })
    expect((await s.compareAndReplace((await read(s)).token, config, 'after-full')).kind).toBe(
      'installed',
    )
  })

  it.each([new StorageDefect('broken storage invariant'), new Error('undeclared fault')])(
    'propagates defects instead of reporting normal unavailability: %s',
    async fault => {
      const storage = await fixture()
      const wrapped: LocalStateStorage = {
        read: fn => storage.read(fn),
        write: fn => storage.write(fn),
        close: () => storage.close(),
        atomic: async () => {
          throw fault
        },
      }
      const s = f.own(
        new LocalState(
          createStatePersistence(wrapped),
          async () => {},
          async () => {},
        ),
      )
      await expect(s.compareAndReplace((await read(s)).token, config, 'defect')).rejects.toBe(fault)
    },
  )

  it('closes admission immediately but retains storage until postcommit work finishes', async () => {
    const storage = await fixture(),
      entered = deferred(),
      release = deferred()
    let directoryClosed = false
    const s = f.own(
      new LocalState(
        createStatePersistence(storage),
        async () => {
          entered.resolve()
          await release.promise
        },
        async () => {
          directoryClosed = true
        },
      ),
    )
    const original = await read(s)
    const writing = s.compareAndReplace(original.token, logged, 'in-flight')
    await entered.promise
    let closed = false
    const closing = s.close().then(() => {
      closed = true
    })
    try {
      await expect(s.read()).rejects.toMatchObject({ reason: 'closed' })
      expect(closed).toBe(false)
      expect(directoryClosed).toBe(false)
      expect(
        await storage.read(
          async tx =>
            (
              await tx.db
                .selectFrom('client_local_state')
                .select('operation_id')
                .executeTakeFirstOrThrow()
            )['operation_id'],
        ),
      ).toBe('in-flight')
    } finally {
      release.resolve()
    }
    expect((await writing).kind).toBe('installed')
    await closing
    expect(directoryClosed).toBe(true)
    await expect(storage.read(async () => null)).rejects.toBeInstanceOf(StorageUnavailable)
  })
})
