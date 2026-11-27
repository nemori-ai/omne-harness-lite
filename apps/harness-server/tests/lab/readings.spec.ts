import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { StorageReadings } from '@omne-harness/sql-contract'
import { stepLine, storageLine, type ReadingsSource } from '../../src/lab/readings.ts'

const COUNTED: StorageReadings = {
  reads: [{ domain: 'session', handler: 'read-history', read: 2, unavailable: 0, cancelled: 0 }],
  commits: [],
  participants: [],
  queries: [],
}
const up: ReadingsSource = { read: () => COUNTED }
const down: ReadingsSource = { read: null }

describe('the line a model request leaves in the lab', () => {
  it('numbers the requests from one, and says the bytes and the digest of what was sent', () => {
    const rawBody = '{"model":"m","messages":[{"role":"user","content":"你好"}]}'
    expect(stepLine({ index: 0, rawBody, path: '/api/v1/responses' }, up)).toEqual({
      kind: 'lab-step',
      request: 1,
      path: '/api/v1/responses',
      requestBytes: Buffer.byteLength(rawBody),
      requestDigest: `sha256:${createHash('sha256').update(rawBody).digest('hex')}`,
      storage: COUNTED,
    })
    expect(stepLine({ index: 4, rawBody, path: '/p' }, up).request).toBe(5)
  })

  it('carries no readings while the storage is not up, and says so when asked for them', () => {
    expect(stepLine({ index: 0, rawBody: '{}', path: '/p' }, down).storage).toBeNull()
    expect(storageLine(down)).toEqual({
      kind: 'lab-storage',
      ok: false,
      error: 'the storage is not up',
    })
    expect(storageLine(up)).toEqual({ kind: 'lab-storage', ok: true, storage: COUNTED })
  })
})
