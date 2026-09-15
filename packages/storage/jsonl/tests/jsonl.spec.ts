import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendSyncedBytes, readFirstLine, syncDirectory, writeSyncedFile } from '../dist/index.js'

describe('selected JSONL ordinary file mechanisms', () => {
  it('creates without clobber, appends and reads across a chunk boundary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omne-source-jsonl-'))
    try {
      const path = join(dir, 'events.jsonl')
      const header = JSON.stringify({ note: '多'.repeat(5000) })
      await writeSyncedFile(path, header + '\n')
      await syncDirectory(dir)
      await expect(writeSyncedFile(path, 'overwrite')).rejects.toMatchObject({ code: 'EEXIST' })
      await appendSyncedBytes(path, '{"event":1}\n')
      expect(await readFirstLine(path)).toBe(header)
      expect(await readFile(path, 'utf8')).toBe(header + '\n{"event":1}\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('does not treat an incomplete first line as a complete record and propagates cancellation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'omne-source-jsonl-'))
    try {
      const path = join(dir, 'tail.jsonl')
      await writeSyncedFile(path, '{"tail":')
      expect(await readFirstLine(path)).toBeUndefined()
      const aborted = AbortSignal.abort(new Error('caller stopped reading'))
      await expect(readFirstLine(path, aborted)).rejects.toThrow('caller stopped reading')
      expect(await readFile(path, 'utf8')).toBe('{"tail":')
      await expect(readFirstLine(join(dir, 'missing'))).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
