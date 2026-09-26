import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../src/sqlite/driver.ts'

describe('partial SQLite handle initialization', () => {
  it.each(['read', 'write'] as const)(
    '%s PRAGMA failure closes the unregistered real handle',
    async role => {
      const directory = mkdtempSync(join(tmpdir(), 'omne-sql-init-'))
      const driver = new NodeSqliteDriver({ file: join(directory, 'db.sqlite'), role })
      const handles: DatabaseSync[] = []
      const exec = DatabaseSync.prototype.exec
      const fault = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementationOnce(function (
        this: DatabaseSync,
      ) {
        handles.push(this)
        exec.call(this, 'SELECT * FROM deliberately_missing_table')
      })
      try {
        await expect(driver.init()).rejects.toThrow()
        expect(handles).toHaveLength(1)
        expect(handles[0]?.isOpen).toBe(false)
      } finally {
        fault.mockRestore()
        await driver.destroy()
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )

  it('failed reader initialization does not consume all available pool slots', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'omne-sql-read-init-'))
    const driver = new NodeSqliteDriver({ file: join(directory, 'db.sqlite'), role: 'read' })
    await driver.init()
    const held = await driver.acquireConnection()
    const exec = DatabaseSync.prototype.exec
    const handles: DatabaseSync[] = []
    const fault = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: DatabaseSync,
    ) {
      handles.push(this)
      exec.call(this, 'SELECT * FROM deliberately_missing_table')
    })
    try {
      for (let i = 0; i < 3; i += 1) await expect(driver.acquireConnection()).rejects.toThrow()
      expect(handles).toHaveLength(3)
      expect(handles.every(db => !db.isOpen)).toBe(true)
    } finally {
      fault.mockRestore()
    }
    const next = driver.acquireConnection()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('reader pool capacity was lost')), 500)
      })
      await Promise.race([next, timeout])
    } finally {
      clearTimeout(timer)
      await driver.releaseConnection(held)
      await driver.releaseConnection(await next)
      await driver.destroy()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
