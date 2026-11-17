import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import {
  compactionSqlCatalog,
  compactionRequestDigest,
  createCompactionSqlStore,
  createContextCompaction,
} from '@omne-harness/context-compaction'
import { succeed } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import { judgeMessage } from '@omne-harness/message'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { access, adoption, operation, ref, request, ok, tenant } from './request-fixture.ts'
import { sqliteConfig } from './sqlite-config.ts'

async function open(root: string, adapt: (storage: SqlStorage) => SqlStorage = storage => storage) {
  const created = await createSqliteStorage({
    config: sqliteConfig(join(root, 'storage')),
    materials: compactionSqlCatalog(),
    closeLeases: { admit: () => ({}), release: () => undefined },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const store = ok(await createCompactionSqlStore(adapt(created.storage)))
  const provider = createContextCompaction({
    authority: ref.authority,
    adoption,
    store,
    authorize: async () => succeed(undefined),
    custody: async () => succeed(undefined),
    executor: {
      advance: async () =>
        succeed({ phase: 'pending', knowledge: 'accepted', physical: 'pending' }),
      cancel: async () => succeed('settled'),
    },
  })
  return { ...created, ...provider, store }
}

it('recovers admission and early cancellation from SQLite after all live objects are rebuilt', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'compaction-sql-')))
  let current = await open(root)
  try {
    const input = request()
    const states = await Promise.all(
      Array.from({ length: 6 }, () => current.service.admit({ ...access, request: input })),
    )
    expect(states.every(state => 'ok' in state && state.ok.revision === '1')).toBe(true)
    const sealed = {
      ...input.ref,
      task: ok((await import('@omne-harness/agent-contract')).decodeCompactionTaskId('early')),
    }
    ok(await current.service.cancel({ ...access, ref: sealed, operation }))
    await current.control.close({ initiator: 'disposal' })
    current = await open(root)
    const recovered = ok(await current.store.read(input.ref))
    expect(recovered?.request).toEqual(input)
    if (recovered === null) throw new Error('lost task')
    expect(tenantEquals(recovered.state.ref.tenant, tenant)).toBe(true)
    expect(ok(await current.service.inspect({ ...access, ref: sealed }))).toMatchObject({
      kind: 'found',
      state: { phase: 'terminal', outcome: { kind: 'cancelled' } },
    })
    const listed = ok(
      await current.store.pending({ authority: ref.authority, after: null, limit: 10 }),
    )
    expect(listed.refs).toEqual([input.ref])
  } finally {
    await current.control.close({ initiator: 'disposal' })
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it.each(['applied', 'not-applied'] as const)(
  'does not publish a partial input when a chunk commit is unknown (%s)',
  async effect => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'compaction-chunk-unknown-')))
    let hidden: string | null = null
    let current = await open(root, storage => ({
      database: storage.database,
      registerCombination: input => storage.registerCombination(input),
      read: (input, options) => storage.read(input, options),
      async commit(input, options) {
        const facts = input.commands[0]?.facts
        if (hidden === null && facts?.kind === 'content' && facts.part === 1) {
          hidden = input.identity.operationKey
          if (effect === 'applied')
            expect((await storage.commit(input, options)).kind).toBe('committed')
          return { kind: 'unknown', identity: input.identity, diagnostic: 'lost chunk response' }
        }
        return storage.commit(input, options)
      },
      query: identity =>
        identity.operationKey === hidden
          ? Promise.resolve({
              kind: 'unknown',
              identity,
              diagnostic: 'chunk response still unavailable',
            })
          : storage.query(identity),
    }))
    try {
      const original = request()
      const frame = judgeMessage({
        id: original.input.outputMessageId,
        role: 'user',
        blocks: [
          {
            kind: 'text',
            id: 'large-frame',
            visibility: { toHuman: true, toModel: true },
            text: 'instruction '.repeat(20_000),
          },
        ],
      })
      if ('rejected' in frame || frame.ok.role !== 'user') throw new Error('invalid test frame')
      const candidate = {
        ...original,
        input: { ...original.input, frame: { ...original.input.frame, system: frame.ok.blocks } },
      }
      const input = {
        ...candidate,
        ref: { ...candidate.ref, requestDigest: compactionRequestDigest(candidate) },
      }
      expect(await current.service.admit({ ...access, request: input })).toMatchObject({
        failure: { kind: 'commit-unknown', ref: input.ref },
      })
      expect(hidden).not.toBeNull()
      expect(ok(await current.store.read(input.ref))).toBeNull()
      expect(
        ok(await current.store.pending({ authority: ref.authority, after: null, limit: 10 })).refs,
      ).toEqual([])
      await current.control.close({ initiator: 'disposal' })
      current = await open(root)
      expect(ok(await current.service.admit({ ...access, request: input })).revision).toBe('1')
      expect(ok(await current.store.read(input.ref))?.request).toEqual(input)
    } finally {
      await current.control.close({ initiator: 'disposal' })
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)

it('keeps the executor checkpoint across cancellation and a cold restart', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'compaction-checkpoint-')))
  let current = await open(root)
  try {
    const input = request()
    ok(await current.service.admit({ ...access, request: input }))
    const checkpoint = JSON.stringify({ phase: 'admitting', call: 'mcall_summary_1', attempt: 1 })
    ok(
      await current.store.change(input.ref, record => {
        if (record === null) throw new Error('lost task')
        return succeed({
          record: {
            ...record,
            execution: checkpoint,
            state: { ...record.state, revision: String(BigInt(record.state.revision) + 1n) },
          },
          value: undefined,
        })
      }),
    )
    ok(await current.service.cancel({ ...access, ref: input.ref, operation }))
    await current.control.close({ initiator: 'disposal' })
    current = await open(root)
    const recovered = ok(await current.store.read(input.ref))
    expect(recovered).toMatchObject({
      execution: checkpoint,
      state: { phase: 'terminal', outcome: { kind: 'cancelled' }, physical: 'unknown' },
    })
  } finally {
    await current.control.close({ initiator: 'disposal' })
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('retains handed-off cancellation in the physical recovery index until settlement', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'compaction-sql-')))
  const current = await open(root)
  try {
    const input = request()
    ok(await current.service.admit({ ...access, request: input }))
    const cancelled = ok(await current.service.cancel({ ...access, ref: input.ref, operation }))
    if (cancelled.phase !== 'terminal') throw new Error('no result')
    ok(
      await current.service.acknowledge({
        ...access,
        ref: input.ref,
        operation,
        result: cancelled.result,
        handoff: {
          kind: 'retained',
          consumer: request().consumer,
          custody: cancelled.result.evidence,
        },
      }),
    )
    expect(
      ok(await current.store.pending({ authority: ref.authority, after: null, limit: 10 })).refs,
    ).toEqual([input.ref])
    expect(ok(await current.reconcile(input.ref))).toMatchObject({
      phase: 'handed-off',
      physical: 'settled',
    })
    expect(
      ok(await current.store.pending({ authority: ref.authority, after: null, limit: 10 })).refs,
    ).toEqual([])
  } finally {
    await current.control.close({ initiator: 'disposal' })
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)

it('admits and restores a complete current history larger than one SQL command', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'compaction-large-history-')))
  let current = await open(root)
  try {
    const original = request()
    const candidate = {
      ...original,
      input: {
        ...original.input,
        history: {
          ...original.input.history,
          entries: original.input.history.entries.map(entry => {
            const message = judgeMessage({
              ...entry.message,
              blocks: entry.message.blocks.map(block =>
                block.kind === 'text' ? { ...block, text: 'history '.repeat(200_000) } : block,
              ),
            })
            if ('rejected' in message) throw new Error(JSON.stringify(message.rejected))
            return { ...entry, message: message.ok }
          }),
        },
      },
    }
    const input = {
      ...candidate,
      ref: { ...candidate.ref, requestDigest: compactionRequestDigest(candidate) },
    }
    expect(Buffer.byteLength(JSON.stringify(input))).toBeGreaterThan(1_048_576)
    ok(await current.service.admit({ ...access, request: input }))
    const checkpoint = JSON.stringify({ fixed: 'summary '.repeat(200_000), attempt: 1 })
    ok(
      await current.store.change(input.ref, record => {
        if (record === null) throw new Error('lost task')
        return succeed({
          record: {
            ...record,
            execution: checkpoint,
            state: { ...record.state, revision: String(BigInt(record.state.revision) + 1n) },
          },
          value: undefined,
        })
      }),
    )
    ok(await current.service.cancel({ ...access, ref: input.ref, operation }))
    await current.control.close({ initiator: 'disposal' })
    current = await open(root)
    expect(ok(await current.store.read(input.ref))).toMatchObject({
      request: input,
      execution: checkpoint,
      state: { phase: 'terminal', outcome: { kind: 'cancelled' } },
    })
  } finally {
    await current.control.close({ initiator: 'disposal' })
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
