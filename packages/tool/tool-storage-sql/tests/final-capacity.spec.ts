// @module-tag slow
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createSqlToolMaterialStore } from '@omne-harness/tool-storage-sql'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { judgeContentBlock } from '@omne-harness/content-block'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId, type FactBatch } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { ledgerWorld } from './fixtures/ledger.ts'
import { openStorage } from './windows-composition/storage.ts'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

const tenant = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
const evidence = {
  owner: 'capacity-fixture',
  record: 'resources',
  revision: '1',
  digest: 'sha256:resources',
}

it.each([
  { bytes: 32, settle: false },
  { bytes: 5 * 1024 * 1024, settle: false },
  { bytes: 32, settle: true },
  { bytes: 5 * 1024 * 1024, settle: true },
])(
  'receives a $bytes byte final and settles=$settle through the real SQLite command limit',
  async ({ bytes, settle }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-final-capacity-')))
    const storage = await openStorage(root, [tenant], { maxCommandBytes: 1_048_576 })
    try {
      const world = await ledgerWorld(tenant)
      const provider = {
        owner: 'capacity-fixture',
        name: 'materials',
        revision: '1',
        digest: 'sha256:materials',
      }
      const materialStore = createSqlToolMaterialStore({
        storage: storage.storage,
        domains: storage.domains,
        combination: storage.combination,
        provider,
        maxCommandBytes: 1_048_576,
        maxChunkBytes: 16_384,
      })
      const ledger = world.ledgerOver(
        storage.store,
        {
          provider,
          store: materialStore,
          clock: {
            sample: async () => succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z'))),
          },
        },
        storage.custody,
      )
      ok(await ledger.admissions.admit(world.input))
      const context = async (name: string) => ({
        ...world.access,
        operation: ok(decodeToolOperationId(name)),
        instance: ok(decodeToolInstanceId('capacity-fixture')),
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
      const raw = ok(
        await storage.custody.preserve({
          ...world.access,
          operation: ok(decodeToolOperationId('raw')),
          codec: { owner: 'fixture', name: 'text', revision: '1', digest: 'sha256:text' },
          bytes: new TextEncoder().encode('x'.repeat(bytes)),
          source: evidence,
        }),
      )
      const judged = judgeContentBlock({
        kind: 'text',
        id: 'answer',
        visibility: { toHuman: true, toModel: true },
        text: 'x'.repeat(bytes),
      })
      if (!('ok' in judged)) throw new Error(JSON.stringify(judged.rejected))
      const block = judged.ok
      const final = {
        kind: 'final',
        raw,
        result: {
          content: [block],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        },
        terminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence },
      } as const
      const batch: FactBatch = {
        start,
        source: evidence,
        batch: 'final',
        after: null,
        cursor: 'final/end',
        events: [
          {
            event: 'final',
            fact: ok(
              await ledger.finalCustody.preserveFinal({
                ...world.access,
                start,
                source: evidence,
                operation: ok(decodeToolOperationId('final-envelope')),
                final,
              }),
            ),
          },
        ],
      }
      const received = await ledger.commands.receiveFacts({ ...world.access, start, batch })
      expect(received, JSON.stringify(received)).toHaveProperty('ok')
      expect(await ledger.commands.receiveFacts({ ...world.access, start, batch })).toEqual(
        received,
      )
      const tasks = ok(await ledger.commands.loadRecovery(world.access)).tasks.filter(
        task => task.kind === 'settle',
      )
      expect(tasks).toHaveLength(1)
      const task = tasks[0]
      if (task?.kind !== 'settle') throw new Error('missing final recovery duty')
      const restored = ok(await ledger.facts.read({ ...world.access, basis: task.basis }))
      expect(restored.fact).toEqual(final)
      if (settle) {
        const input = { ...(await context('settle')), basis: task.basis }
        const settled = await ledger.commands.preserveResult(input)
        expect(settled, JSON.stringify(settled)).toHaveProperty('ok.phase', 'settled')
        expect(await ledger.commands.preserveResult(input)).toEqual(settled)
        expect(
          ok(await ledger.facts.read({ ...world.access, basis: task.basis })).fact,
        ).toHaveProperty('kind', 'settled-final')
      }
      const retained = await storage.store.read({ kind: 'call', tenant, call: world.access.call })
      expect(retained.kind).toBe('complete')
      expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThan(100_000)
    } finally {
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  60_000,
)
