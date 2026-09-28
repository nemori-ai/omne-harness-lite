import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { dirname } from 'node:path'
import { expect, it } from 'vitest'
import { createAcceptanceApplication } from '../src/index.ts'
import { deployment, evidence, persisted } from './support.ts'

it('AB-V3: actual deletion followed by denied directory fsync remains failed even with pending:clear', async () => {
  const config = await deployment('confirm-post-delete-fail')
  const original = fs.rm
  let deleted = false,
    pendingClear = false,
    actualFailure = ''
  const app = createAcceptanceApplication(config, {
    diagnostics: { record() {} },
    hooks: {
      beforeConfirm(guard) {
        const confirm = guard.confirm.bind(guard)
        guard.confirm = async () => {
          const pending = await guard.pending()
          if (typeof pending !== 'object') throw new Error('actual snapshot absent')
          const target = pending.pending.location
          fs.rm = async (path, options) => {
            await original(path, options)
            if (String(path) === target) {
              deleted = true
              await fs.chmod(dirname(config.databaseFile), 0o000)
            }
          }
          syncBuiltinESMExports()
          try {
            return await confirm()
          } catch (error) {
            actualFailure =
              error instanceof Error && 'code' in error ? String(error.code) : 'non-io'
            await fs.chmod(dirname(config.databaseFile), 0o700)
            pendingClear = (await guard.pending()) === 'clear'
            throw error
          } finally {
            fs.rm = original
            syncBuiltinESMExports()
            await fs.chmod(dirname(config.databaseFile), 0o700)
          }
        }
      },
    },
  })
  try {
    await expect(app.ready).rejects.toMatchObject({ phase: 'confirm', category: 'confirmation' })
    expect(deleted).toBe(true)
    expect(actualFailure).toBe('EACCES')
    expect(pendingClear).toBe(true)
    expect(app.status().serving).toBe(false)
    expect((await app.close()).complete).toBe(true)
    const state = persisted(config.databaseFile)
    expect(state.manifest).toBe('0')
    expect(Object.values(state.counts)).toEqual([0, 0, 0, 0, 0, 0])
    await evidence('AB-V3-post-delete', {
      deleted,
      pendingClear,
      actualFailure,
      state,
      pendingGap: 'snapshot deletion succeeded but directory sync failed; no rollback proof',
    })
  } finally {
    fs.rm = original
    syncBuiltinESMExports()
    await fs.chmod(dirname(config.databaseFile), 0o700)
    await app.close()
  }
})
