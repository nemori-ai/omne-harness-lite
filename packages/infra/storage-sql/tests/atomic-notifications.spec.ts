import { afterEach, expect, it, vi } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { openStorage } from '../src/index.ts'
import { tempSqliteFile } from './support.ts'

afterEach(() => vi.restoreAllMocks())

it('commit acknowledgment failure does not publish notifications or claim rollback', async () => {
  const storage = await openStorage({ dialect: 'sqlite', file: tempSqliteFile('atomic-unknown') })
  try {
    await storage.write(tx =>
      tx.db.schema.createTable('probe').addColumn('value', 'text').execute(),
    )
    const original = storage.write.bind(storage)
    const failure = new StorageUnavailable('synthetic lost commit acknowledgment')
    // 真实提交后注入边界失败；不是声称模拟了设备 I/O 故障。
    vi.spyOn(storage, 'write').mockImplementation(async fn => {
      await original(fn)
      throw failure
    })
    let notified = false
    await expect(
      storage.atomic(async unit => {
        await unit.mutate(tx => tx.db.insertInto('probe').values({ value: 'committed' }).execute())
        unit.afterCommit(() => {
          notified = true
        })
      }),
    ).rejects.toBe(failure)
    expect(notified).toBe(false)
    expect(await storage.read(tx => tx.db.selectFrom('probe').selectAll().execute())).toEqual([
      { value: 'committed' },
    ])
  } finally {
    await storage.close()
  }
})

it('notification failures are diagnosed without exposing the error or reversing success', async () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const storage = await openStorage(
    { dialect: 'sqlite', file: tempSqliteFile('atomic-notification') },
    { logger },
  )
  const secret = 'synthetic-secret-not-for-diagnostics'
  try {
    await storage.write(tx =>
      tx.db.schema.createTable('probe').addColumn('value', 'text').execute(),
    )
    const result = await storage.atomic(async unit => {
      await unit.mutate(tx => tx.db.insertInto('probe').values({ value: 'committed' }).execute())
      unit.afterCommit(() => {
        throw new Error(secret)
      })
      unit.afterCommit(async () => {
        throw new Error(secret)
      })
      return 'success'
    })
    expect(result).toBe('success')
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(logger.error).toHaveBeenCalled()
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(secret)
    expect(await storage.read(tx => tx.db.selectFrom('probe').selectAll().execute())).toEqual([
      { value: 'committed' },
    ])
  } finally {
    await storage.close()
  }
})
