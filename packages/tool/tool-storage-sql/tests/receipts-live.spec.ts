// @module-tag slow
// Tool commits on the real SQLite provider keep no SQL receipt (sql-contract §3.1): the ports
// recognise their own outcomes from the ledger and the manifests. The second case shows that
// recognition after an unknown answer still holds without a receipt and runs no chunk again.
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import type { CommitRequestV2, CommitResultV2 } from '@omne-harness/sql-contract'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialGeneration,
  decodeToolMaterialId,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolMaterialStore } from '@omne-harness/tool-storage-sql'
import { TENANT_A } from './fixtures/app.ts'
import { openStorage } from './windows-composition/storage.ts'

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
const provider = { owner: 'tool-sql', name: 'materials', revision: '1', digest: 'sha256:provider' }
const access = { principal: 'tool-runtime', tenant: TENANT_A, call: ok(decodeToolCallId('call-1')) }
const input = {
  ...access,
  material: {
    id: ok(decodeToolMaterialId('body-1')),
    generation: ok(decodeToolMaterialGeneration('generation-1')),
    provider,
  },
  codec: { owner: 'tool', name: 'bytes', revision: '1', digest: 'sha256:codec' },
  source: { owner: 'tool', record: 'source', revision: '1', digest: 'sha256:source' },
  operation: ok(decodeToolOperationId('write-1')),
}
const MAX_CHUNK = 16_384
const BYTES = Buffer.alloc(64 * MAX_CHUNK, 7)

function receipts(root: string, transactionDomain: string): number {
  const file = join(root, 'domains', `${Buffer.from(transactionDomain).toString('hex')}.sqlite`)
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return (db.prepare('select count(*) as n from _sql_receipt').get() as { n: number }).n
  } finally {
    db.close()
  }
}

async function withStorage(
  run: (opened: Awaited<ReturnType<typeof openStorage>>, root: string) => Promise<void>,
): Promise<void> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-receipts-')))
  try {
    const opened = await openStorage(root, [TENANT_A], { maxCommandBytes: 1_048_576 })
    try {
      await run(opened, root)
    } finally {
      await opened.close()
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

it('preserves a 1 MiB material in 64 chunks and adds no SQL receipt to the tenant database', async () => {
  await withStorage(async (opened, root) => {
    const domain = 'windows-tool-0'
    const before = receipts(root, domain)
    let commits = 0
    const store = createSqlToolMaterialStore<string>({
      storage: {
        ...opened.storage,
        commit: async (...args: Parameters<typeof opened.storage.commit>) => {
          commits += 1
          return opened.storage.commit(...args)
        },
      },
      domains: opened.domains,
      combination: opened.combination,
      provider,
      maxCommandBytes: 1_048_576,
      maxChunkBytes: MAX_CHUNK,
    })
    ok(await store.write({ ...input, bytes: BYTES }))
    expect(commits).toBeGreaterThan(64)
    expect(receipts(root, domain)).toBe(before)
  })
})

it('recognises a seal whose answer was lost without a receipt, and writes no chunk again', async () => {
  await withStorage(async opened => {
    const intents: string[] = []
    let loseNextSeal = true
    const commit = async (request: CommitRequestV2): Promise<CommitResultV2> => {
      const intent = String(request.commands[0]?.facts['intent'] ?? '')
      intents.push(intent)
      const result = await opened.storage.commit(request)
      if (intent !== 'material-seal' || !loseNextSeal || result.kind !== 'committed') return result
      loseNextSeal = false
      return { kind: 'unknown', identity: request.identity, diagnostic: 'injected lost answer' }
    }
    const store = createSqlToolMaterialStore<string>({
      storage: { ...opened.storage, commit },
      domains: opened.domains,
      combination: opened.combination,
      provider,
      maxCommandBytes: 1_048_576,
      maxChunkBytes: MAX_CHUNK,
    })
    expect(await store.write({ ...input, bytes: BYTES })).toEqual({
      failure: { kind: 'commit-unknown', operation: input.operation },
    })
    expect(loseNextSeal).toBe(false)
    expect(ok(await store.inspect(input)).kind).toBe('sealed')
    intents.length = 0
    const seal = ok(await store.write({ ...input, bytes: BYTES }))
    expect(seal.bytes).toBe(String(BYTES.length))
    expect(intents.filter(intent => intent === 'material-chunk')).toEqual([])
  })
})
