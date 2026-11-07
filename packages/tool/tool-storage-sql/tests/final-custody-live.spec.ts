// @module-tag slow
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createSqlToolMaterialStore } from '@omne-harness/tool-storage-sql'
import {
  decodeToolMaterialInstant,
  type ToolFinalEnvelope,
} from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Principal } from './fixtures/ledger.ts'
import { judgeContentBlock } from '@omne-harness/content-block'
import { decodeToolOperationId } from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
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

it.each([5 * 1024 * 1024])(
  'preserves an exact %i byte final outside the call ledger and recalls it after restart',
  async bytes => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-final-capacity-')))
    const storage = await openStorage(root, [tenant], { maxCommandBytes: 1_048_576 })
    try {
      const world = await ledgerWorld(tenant)
      const provider = {
        owner: 'tool-sql',
        name: 'final-materials',
        revision: '1',
        digest: 'sha256:final-materials',
      }
      const materials = (opened: typeof storage) => ({
        provider,
        store: createSqlToolMaterialStore<Principal>({
          storage: opened.storage,
          domains: opened.domains,
          combination: opened.combination,
          provider,
          maxCommandBytes: 1_048_576,
          maxChunkBytes: 16_384,
        }),
        clock: {
          sample: async () => succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z'))),
        },
      })
      const ledger = world.ledgerOver(storage.store, materials(storage))
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
          bytes: new TextEncoder().encode('raw source differs from the rendered final'),
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
      const final: ToolFinalEnvelope<ContentBlock> = {
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
      }
      const input = {
        ...world.access,
        start,
        source: evidence,
        operation: ok(decodeToolOperationId('exact-final')),
        final,
      }
      const pointer = ok(await ledger.finalCustody.preserveFinal(input))
      expect(Number(pointer.envelope.bytes)).toBeGreaterThan(bytes)
      const domain = { kind: 'call' as const, tenant, call: world.access.call }
      const retained = await storage.store.read(domain)
      expect(retained.kind).toBe('complete')
      expect(Buffer.byteLength(JSON.stringify(retained))).toBeLessThan(100_000)
      const reader = materials(storage).store
      const pages: Uint8Array[] = []
      let offset = '0'
      for (;;) {
        const page = ok(
          await reader.read({
            ...world.access,
            material: pointer.envelope.material,
            offset,
            maxBytes: 65_536,
          }),
        )
        pages.push(page.bytes)
        if (page.next === null) break
        offset = page.next
      }
      expect(JSON.parse(Buffer.concat(pages).toString('utf8'))).toEqual(final)
      await storage.close()
      const reopened = await openStorage(root, [tenant], { maxCommandBytes: 1_048_576 })
      try {
        const available = materials(reopened)
        const recovering = world.ledgerOver(reopened.store, {
          ...available,
          clock: {
            sample: async () =>
              fail({ kind: 'unavailable', dependency: 'clock', diagnostic: 'offline' }),
          },
          store: {
            ...available.store,
            inspect: async () => {
              throw new Error('replay must not inspect bytes')
            },
          },
        })
        expect(ok(await recovering.finalCustody.preserveFinal(input))).toEqual(pointer)
      } finally {
        await reopened.close()
      }
    } finally {
      await storage.close()
      await rm(root, { recursive: true, force: true })
    }
  },
  60_000,
)
