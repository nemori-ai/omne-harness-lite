// @module-tag slow
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolMaterialStore } from '@omne-harness/tool-storage-sql'
import { openStorage } from './windows-composition/storage.ts'
import { TENANT_A } from './fixtures/app.ts'

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const provider = { owner: 'tool-sql', name: 'materials', revision: '1', digest: 'sha256:provider' }
const codec = { owner: 'tool', name: 'bytes', revision: '1', digest: 'sha256:codec' }
const source = { owner: 'tool', record: 'source', revision: '1', digest: 'sha256:source' }
const material = {
  id: ok(decodeToolMaterialId('body-1')),
  generation: ok(decodeToolMaterialGeneration('generation-1')),
  provider,
}
const access = { principal: 'tool-runtime', tenant: TENANT_A, call: ok(decodeToolCallId('call-1')) }
const input = {
  ...access,
  material,
  codec,
  source,
  operation: ok(decodeToolOperationId('write-1')),
}
const deletion = {
  ...access,
  material,
  authorization: source,
  operation: ok(decodeToolOperationId('delete-1')),
}
it('preserves 5 MiB through the public port and resumes an unknown deletion after restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-material-port-')))
  const bytes = Buffer.alloc(5 * 1024 * 1024, 120)
  for (let offset = 0; offset < bytes.length; offset += 16_384)
    bytes.writeUInt32LE(offset / 16_384, offset)
  const digest = createHash('sha256').update(bytes).digest('hex')
  try {
    const initial = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      let armed = true
      const storage = {
        ...initial.storage,
        commit: async (...args: Parameters<typeof initial.storage.commit>) => {
          const result = await initial.storage.commit(...args)
          if (
            armed &&
            args[0].commands[0]?.facts['intent'] === 'material-prune' &&
            result.kind === 'committed'
          ) {
            armed = false
            return {
              kind: 'unknown',
              identity: args[0].identity,
              diagnostic: 'injected lost prune answer',
            } as const
          }
          return result
        },
      }
      const store = createSqlToolMaterialStore<string>({
        storage,
        domains: initial.domains,
        combination: initial.combination,
        provider,
        maxCommandBytes: 1_048_576,
        maxChunkBytes: 16_384,
      })
      const seal = ok(await store.write({ ...input, bytes }))
      expect(seal.sha256).toBe(digest)
      expect(ok(await store.inspect(input))).toEqual({ kind: 'sealed', seal })
      const received = createHash('sha256')
      let offset = '0',
        total = 0
      for (;;) {
        const page = ok(await store.read({ ...access, material, offset, maxBytes: 1_000_000 }))
        expect(page.bytes.length).toBeGreaterThan(0)
        expect(page.bytes.length).toBeLessThanOrEqual(65_536)
        received.update(page.bytes)
        total += page.bytes.length
        if (page.next === null) break
        expect(page.next).toBe(String(total))
        offset = page.next
      }
      expect(total).toBe(bytes.length)
      expect(received.digest('hex')).toBe(digest)
      expect(await store.erase(deletion)).toEqual({
        failure: { kind: 'commit-unknown', operation: deletion.operation },
      })
      expect(ok(await store.inspectErase(deletion))).toEqual({ kind: 'pending' })
    } finally {
      await initial.close()
    }
    const restarted = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      const store = createSqlToolMaterialStore<string>({
        storage: restarted.storage,
        domains: restarted.domains,
        combination: restarted.combination,
        provider,
        maxCommandBytes: 1_048_576,
        maxChunkBytes: 32_768,
      })
      expect(await store.write({ ...input, bytes })).toEqual({
        failure: { kind: 'conflict', operation: input.operation },
      })
      const receipt = ok(await store.erase(deletion))
      expect(ok(await store.inspectErase(deletion))).toEqual({ kind: 'deleted', receipt })
      expect(ok(await store.inspect(input))).toEqual({ kind: 'excluded', evidence: receipt })
      expect(await store.read({ ...access, material, offset: '0', maxBytes: 1 })).toMatchObject({
        failure: { kind: 'unavailable' },
      })
    } finally {
      await restarted.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
