// @module-tag slow
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import { decodeToolOperationId, type ToolBodyDeclaration } from '@omne-harness/tool-contract'
import {
  decodeToolInstanceId,
  decodeToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import { createSqlToolMaterialMaintenanceSource, createSqlToolMaterialStore } from '../src/index.ts'
import { TENANT_A, TENANT_B } from './fixtures/app.ts'
import { ledgerWorld, type Principal } from './fixtures/ledger.ts'
import { openStorage } from './windows-composition/storage.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

const operation = (name: string) => ok(decodeToolOperationId(name))
const at = ok(decodeToolMaterialInstant('2026-11-08T00:00:00.000Z'))
const evidence = {
  owner: 'writer-fixture',
  record: 'source',
  revision: '1',
  digest: 'sha256:source',
}
const provider = {
  owner: 'writer-fixture',
  name: 'materials',
  revision: '1',
  digest: 'sha256:materials',
}

function materials(storage: Awaited<ReturnType<typeof openStorage>>) {
  return {
    provider,
    store: createSqlToolMaterialStore<Principal>({
      ...storage,
      provider,
      maxCommandBytes: 1_048_576,
      maxChunkBytes: 16_384,
    }),
    clock: { sample: async () => succeed(at) },
  }
}

it.each(['append', 'seal', 'json-seal'] as const)(
  'discovers and recovers unknown %s custody after SQLite workers restart',
  async phase => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-writer-inventory-')))
    let storage: Awaited<ReturnType<typeof openStorage>> | null = null
    try {
      storage = await openStorage(root, [TENANT_A, TENANT_B])
      const json = phase === 'json-seal'
      const limits = {
        maxBytes: 256,
        maxDepth: 8,
        maxItems: 32,
        maxMembers: 16,
        maxStringLength: 128,
        maxNumberLength: 32,
      }
      const schema = readJsonText('{"type":"object","required":["rows"]}', limits)
      if (schema.kind !== 'ok') throw new Error('invalid schema fixture')
      const body: ToolBodyDeclaration = {
        kind: 'json-document',
        codec: provider,
        document: {
          identity: { id: 'rows', revision: '1', digest: 'rows-v1' },
          definition: { schema: schema.value, vocabulary: provider, descriptions: [] },
        },
      }
      const text = json ? '{ "rows": [1.0, "正文🙂"] }' : 'durable 正文🙂'
      let checks = 0
      const schemas = {
        check: async (fixed: typeof body.document, read: ReturnType<typeof readJsonText>) => {
          expect(fixed).toEqual(body.document)
          if (read.kind !== 'ok') throw new Error('unreadable body')
          expect(writeJsonText(read.value)).toBe('{"rows":[1.0,"正文🙂"]}')
          checks++
          return succeed(undefined)
        },
      }
      const world = await ledgerWorld(TENANT_A, json ? body : undefined)
      const originalMaterials = materials(storage)
      let loseReply = false
      const ledger = world.ledgerOver(
        storage.store,
        {
          ...originalMaterials,
          store: {
            ...originalMaterials.store,
            write: async request => {
              const saved = await originalMaterials.store.write(request)
              if (loseReply && 'ok' in saved) {
                loseReply = false
                return fail({ kind: 'commit-unknown', operation: request.operation })
              }
              return saved
            },
          },
        },
        { schemas, limits },
      )
      ok(await ledger.admissions.admit(world.input))
      const context = async (name: string) => ({
        ...world.access,
        operation: operation(name),
        instance: ok(decodeToolInstanceId('writer-fixture')),
        generation: '1',
        expected: ok(await ledger.commands.loadRecovery(world.access)).state.revision,
      })
      const preparation = ok(
        await ledger.commands.planPreparation({
          ...(await context('prepare')),
          request: world.input.request,
          purpose: 'initial',
          environmentAdoption: {
            owner: 'fixture',
            name: 'environment',
            revision: '1',
            digest: 'sha256:env',
          },
        }),
      )
      ok(
        await ledger.commands.prepared({
          ...(await context('prepared')),
          preparation,
          resources: evidence,
        }),
      )
      ok(await ledger.commands.enqueue(await context('enqueue')))
      const start = ok(await ledger.commands.prepareStart(await context('start'))).start
      ok(
        await ledger.commands.recordStart({
          ...(await context('started')),
          invocation: start,
          outcome: { kind: 'started', acceptance: evidence },
        }),
      )
      const input = { ...world.access, start, source: evidence, key: 'answer' }
      const definition = world.input.request.availability.definition
      if (definition.kind !== 'function') throw new Error('function declaration required')
      const declared = definition.returns.body
      if (declared.kind !== 'text' && declared.kind !== 'json-document')
        throw new Error('unexpected representation')
      const representation =
        declared.kind === 'text'
          ? declared
          : {
              kind: 'json-document' as const,
              codec: declared.codec,
              schema: declared.document.identity,
            }
      ok(
        await ledger.bodyWrites.begin({
          ...input,
          operation: operation('begin'),
          representation,
        }),
      )
      loseReply = phase === 'append'
      const append = await ledger.bodyWrites.append({
        ...input,
        operation: operation('append'),
        sequence: '1',
        frame: json
          ? { kind: 'json-fragment', text }
          : { kind: 'text', block: 'one', text, end: true },
      })
      if (phase === 'append') expect(append).toHaveProperty('failure.kind', 'unknown')
      else {
        ok(append)
        loseReply = true
        expect(
          await ledger.bodyWrites.seal({
            ...input,
            operation: operation('seal'),
            afterSequence: '1',
          }),
        ).toHaveProperty('failure.kind', 'unknown')
      }
      ok(await ledger.bodyWrites.close({ ...input, operation: operation('close'), exit: 'failed' }))
      await storage.close()
      storage = null
      storage = await openStorage(root, [TENANT_A, TENANT_B])
      const source = createSqlToolMaterialMaintenanceSource(storage)
      const scan = { tenant: TENANT_A, at, after: null, limit: 1 }
      expect(ok(await source.scan(scan))).toEqual({ calls: [world.access.call], next: null })
      expect(ok(await source.scan({ ...scan, tenant: TENANT_B }))).toEqual({
        calls: [],
        next: null,
      })
      const restoredMaterials = materials(storage)
      const restored = world.ledgerOver(storage.store, restoredMaterials, {
        schemas,
        limits: { ...limits, maxBytes: 1, maxDepth: 1 },
      })
      const recovery = ok(await restored.commands.loadRecovery(world.access))
      if (recovery.start === null) throw new Error('original start missing')
      expect(recovery.start).toEqual(start)
      expect(
        ok(
          await restored.bodyWrites.reconcile({
            ...world.access,
            start: recovery.start,
            maxOperations: 2,
          }),
        ),
      ).toMatchObject({ pending: 0 })
      expect(ok(await restored.bodyWrites.inspect(input))).toHaveProperty(
        'kind',
        phase === 'append' ? 'open' : 'sealed',
      )
      const read = await storage.store.read({ kind: 'call', ...world.access })
      if (read.kind !== 'complete') throw new Error('unreadable call')
      const material = read.records.find(
        record =>
          record.kind === 'material' &&
          record.material.purpose === (phase === 'append' ? 'body-fragment' : 'body'),
      )
      if (material?.kind !== 'material') throw new Error('recovered material missing')
      const page = ok(
        await restoredMaterials.store.read({
          ...world.access,
          material: material.material.material,
          offset: '0',
          maxBytes: 128,
        }),
      )
      expect(new TextDecoder().decode(page.bytes)).toBe(text)
      if (json) expect(checks).toBe(2)
      expect(page.next).toBeNull()
      expect(ok(await source.scan(scan))).toEqual({ calls: [world.access.call], next: null })
    } finally {
      await storage?.close()
      await rm(root, { recursive: true, force: true })
    }
  },
)
