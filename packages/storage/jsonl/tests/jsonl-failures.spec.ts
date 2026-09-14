import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fault = vi.hoisted(() => ({ path: '', rollbackFails: false }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (args[0] === fault.path && args[1] === 'a') {
        const write = handle.writeFile.bind(handle)
        vi.spyOn(handle, 'writeFile').mockImplementation(async () => {
          await write('partial') // Actual bytes reach the temporary test file.
          throw new Error('injected write failure')
        })
      }
      if (args[0] === fault.path && args[1] === 'r+' && fault.rollbackFails) {
        vi.spyOn(handle, 'truncate').mockRejectedValue(new Error('injected rollback failure'))
      }
      return handle
    },
  }
})
import { appendSyncedBytes, writeSyncedFile } from '../dist/index.js'

describe('JSONL source append failure at real file boundaries', () => {
  it('restores the prior length after a partial write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omne-source-jsonl-fault-'))
    try {
      const path = join(dir, 'log')
      await writeSyncedFile(path, 'original\n')
      fault.path = path
      fault.rollbackFails = false
      await expect(appendSyncedBytes(path, 'next\n')).rejects.toThrow('injected write failure')
      expect(await readFile(path, 'utf8')).toBe('original\n')
    } finally {
      fault.path = ''
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('retains both failures and does not claim rollback when truncation fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omne-source-jsonl-fault-'))
    try {
      const path = join(dir, 'log')
      await writeSyncedFile(path, 'original\n')
      fault.path = path
      fault.rollbackFails = true
      await expect(appendSyncedBytes(path, 'next\n')).rejects.toMatchObject({
        name: 'AggregateError',
        errors: [
          expect.objectContaining({ message: 'injected write failure' }),
          expect.objectContaining({ message: 'injected rollback failure' }),
        ],
      })
      expect(await readFile(path, 'utf8')).toBe('original\npartial')
    } finally {
      fault.path = ''
      await rm(dir, { recursive: true, force: true })
    }
  })
})
