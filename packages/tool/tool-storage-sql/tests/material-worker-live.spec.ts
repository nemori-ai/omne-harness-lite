// @module-tag slow
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { JsonValue } from '@omne-harness/sql-contract'
import { isObject } from '../src/worker/support.ts'
import { openStorage } from './windows-composition/storage.ts'
import { TENANT_A, textOf } from './fixtures/app.ts'

it('keeps 5 MiB outside a ledger command, reads it and retains the fence across a worker restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-material-live-')))
  const tenant = textOf(TENANT_A)
  const address = { tenant, call: 'large', material: 'generation-1' }
  const domain = { scope: { kind: 'tenant', tenant } as const, transactionDomain: 'windows-tool-0' }
  const write = { ...address, operation: 'write', digest: 'input-sha' }
  const erase = { ...address, operation: 'delete', digest: 'authorization-sha' }
  const bytes = Buffer.alloc(5 * 1024 * 1024, 120)
  const chunkBytes = 16_384
  for (let offset = 0; offset < bytes.length; offset += chunkBytes)
    bytes.writeUInt32LE(offset / chunkBytes, offset)
  const hash = createHash('sha256').update(bytes).digest('hex')
  function commands(storage: Awaited<ReturnType<typeof openStorage>>) {
    return {
      commit: (facts: Readonly<Record<string, JsonValue>>) =>
        storage.storage.commit({
          ...storage.combination,
          identity: {
            ...domain,
            operation: 'material-live',
            protocolVersion: '2',
            operationKey: randomUUID(),
          },
          commands: [{ participant: 'tool', facts }],
        }),
      read: (input: Readonly<Record<string, JsonValue>>) =>
        storage.storage.read({
          domain,
          handler: 'tool.material.read',
          protocol: '1',
          requestKey: randomUUID(),
          input,
        }),
    }
  }
  try {
    const initial = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      const { commit, read } = commands(initial)
      expect(
        await commit({
          ...write,
          intent: 'material-begin',
          bytes: bytes.length,
          chunkBytes,
          sha256: hash,
          seal: { hash },
        }),
      ).toMatchObject({ kind: 'committed' })
      for (let offset = 0; offset < bytes.length; offset += chunkBytes)
        expect(
          await commit({
            ...write,
            intent: 'material-chunk',
            index: offset / chunkBytes,
            data: bytes.subarray(offset, offset + chunkBytes).toString('base64'),
          }),
        ).toMatchObject({ kind: 'committed' })
      expect(await commit({ ...write, intent: 'material-seal' })).toMatchObject({
        kind: 'committed',
      })
      const received = createHash('sha256')
      let offset = 0
      for (;;) {
        const response = await read({ ...address, mode: 'bytes', offset, maxBytes: 1_000_000 })
        expect(response.kind).toBe('read')
        if (response.kind !== 'read' || !isObject(response.output))
          throw new Error(JSON.stringify(response))
        const page = response.output
        expect(page['kind']).toBe('bytes')
        if (typeof page['data'] !== 'string') throw new Error('missing page bytes')
        const data = Buffer.from(page['data'], 'base64')
        expect(data.length).toBeGreaterThan(0)
        expect(data.length).toBeLessThanOrEqual(65_536)
        received.update(data)
        offset += data.length
        if (page['next'] === null) break
        expect(page['next']).toBe(String(offset))
      }
      expect(offset).toBe(bytes.length)
      expect(received.digest('hex')).toBe(hash)
      expect(
        await commit({ ...erase, intent: 'material-fence', receipt: { operation: 'delete' } }),
      ).toMatchObject({ kind: 'committed' })
      expect(await commit({ ...erase, intent: 'material-prune' })).toMatchObject({
        kind: 'committed',
        responses: [{ reply: { response: { kind: 'pending' } } }],
      })
    } finally {
      await initial.close()
    }
    const restarted = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      const { commit, read } = commands(restarted)
      expect(
        await commit({
          ...write,
          intent: 'material-chunk',
          index: 0,
          data: bytes.subarray(0, chunkBytes).toString('base64'),
        }),
      ).toMatchObject({ kind: 'rolled_back' })
      expect(await commit({ ...write, intent: 'material-seal' })).toMatchObject({
        kind: 'rolled_back',
      })
      expect(await commit({ ...erase, intent: 'material-prune' })).toMatchObject({
        kind: 'committed',
        responses: [{ reply: { response: { kind: 'pending' } } }],
      })
      expect(await commit({ ...erase, intent: 'material-prune' })).toMatchObject({
        kind: 'committed',
        responses: [{ reply: { response: { kind: 'deleted' } } }],
      })
      expect(await read({ ...address, mode: 'bytes', offset: 0, maxBytes: 10 })).toMatchObject({
        kind: 'read',
        output: { kind: 'excluded', deleted: true },
      })
    } finally {
      await restarted.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
