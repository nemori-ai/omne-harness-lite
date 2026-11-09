import { expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createMemoryToolMaterials } from '@omne-harness/tool/testing'
import type { LedgerWrite } from '@omne-harness/tool'
import {
  decodeToolBodyId,
  decodeToolMaterialGeneration,
  decodeToolMaterialId,
  decodeToolMaterialInstant,
  decodeToolResultVersion,
  decodeToolRevision,
} from '@omne-harness/tool-contract/provider'
import {
  createLocalToolMaterialMaintenance,
  type LocalToolMaterialMaintenanceInput,
  type LocalToolMaterialMaintenance,
} from '@omne-harness/tool-host-local'
import { forwardingFixture, ok } from './forwarding-values.ts'
import { adoption, evidence, operationId, tenantB } from './coordinator-values.ts'

function latch() {
  return Promise.withResolvers<void>()
}

async function fixture() {
  const f = await forwardingFixture()
  const material = createMemoryToolMaterials<string>()
  const input: LocalToolMaterialMaintenanceInput<string> = {
    store: f.store,
    access: { qualify: async () => ({ kind: 'allowed' }) },
    materials: material,
    ledgerCommitAttempts: 4,
    source: { scan: async () => succeed({ calls: [f.parent.call], next: null }) },
    scanAccess: { qualify: async () => ({ kind: 'allowed' }) },
  }
  return {
    ...f,
    input,
    material,
    build: (overrides: Partial<typeof input> = {}) =>
      createLocalToolMaterialMaintenance({ ...input, ...overrides }),
  }
}

const instant = (ms: number) => ok(decodeToolMaterialInstant(new Date(ms).toISOString()))
type Fixture = Awaited<ReturnType<typeof fixture>>
const scanInput = (f: Fixture) => ({ ...f.parent, at: instant(10), after: null, limit: 1 })

async function seedMaterial(f: Fixture, timed: boolean) {
  const material = {
    id: ok(decodeToolMaterialId('body')),
    generation: ok(decodeToolMaterialGeneration('1')),
    provider: f.material.provider,
  }
  const writeOperation = operationId('body-write')
  const codec = adoption('body-codec')
  const seal = ok(
    await f.material.store.write({
      ...f.parent,
      material,
      operation: writeOperation,
      codec,
      source: evidence('body-source'),
      bytes: new TextEncoder().encode('body bytes'),
    }),
  )
  const domain = { kind: 'call' as const, tenant: f.parent.tenant, call: f.parent.call }
  const current = await f.store.read(domain)
  if (current.kind !== 'complete') throw new Error('fixture read failed')
  const writes: LedgerWrite[] = [
    {
      kind: 'put',
      record: {
        kind: 'material',
        material: {
          purpose: 'body',
          material,
          writeOperation,
          codec,
          input: {
            codec: 'tool-canonical-json-v1',
            algorithm: 'sha256',
            digest: 'a'.repeat(64),
            bytes: '10',
          },
          state: { kind: 'sealed', seal },
        },
      },
    },
  ]
  writes.push(
    timed
      ? {
          kind: 'put',
          record: {
            kind: 'material-use',
            use: {
              id: 'body-use',
              kind: 'offloaded-body',
              material,
              basis: evidence('body-use'),
              result: ok(decodeToolResultVersion('parent-result')),
              bodyId: ok(decodeToolBodyId('body')),
              expiresAt: instant(10),
              writeOperation,
            },
          },
        }
      : {
          kind: 'put',
          record: {
            kind: 'material-cleanup',
            cleanup: { material, writeOperation, basis: evidence('cleanup') },
          },
        },
  )
  expect(
    (
      await f.store.commit({
        domain,
        expected: current.revision,
        revision: ok(decodeToolRevision(String(Number(current.revision) + 1))),
        writes,
      })
    ).kind,
  ).toBe('committed')
  return { material, writeOperation, domain }
}

it('keeps the original scan tenant across awaits and requalifies before disclosure', async () => {
  const f = await fixture()
  const entered = latch(),
    resume = latch()
  let allowed = true
  const scan = vi.fn(f.input.source.scan)
  const qualify = vi.fn(async () => {
    entered.resolve()
    await resume.promise
    return allowed ? { kind: 'allowed' as const } : { kind: 'denied' as const, reason: 'revoked' }
  })
  const scope = f.build({ scanAccess: { qualify }, source: { scan } })
  const input = scanInput(f)
  const running = scope.scan(input)
  await entered.promise
  input.tenant = tenantB
  resume.resolve()
  expect(ok(await running).calls).toEqual([f.parent.call])
  expect(scan.mock.calls[0]?.[0].tenant).toBe(f.parent.tenant)
  expect(scan.mock.calls[0]?.[0]).not.toHaveProperty('principal')
  expect(qualify).toHaveBeenCalledTimes(2)
  allowed = false
  expect(await scope.scan(scanInput(f))).toHaveProperty('failure.kind', 'denied')
  expect(scan).toHaveBeenCalledTimes(1)
  await scope.close()
})

it('does not disclose a page when scan permission is revoked during the read', async () => {
  const f = await fixture()
  let allowed = true
  const scope = f.build({
    scanAccess: {
      qualify: async () => (allowed ? { kind: 'allowed' } : { kind: 'denied', reason: 'revoked' }),
    },
    source: {
      scan: async input => {
        allowed = false
        return f.input.source.scan(input)
      },
    },
  })
  expect(await scope.scan(scanInput(f))).toEqual({
    failure: { kind: 'denied', action: 'scan-materials' },
  })
  await scope.close()
})

it('suppresses a completed page when the final qualification synchronously closes the scope', async () => {
  const f = await fixture()
  let calls = 0
  let scope: LocalToolMaterialMaintenance<string>
  scope = f.build({
    scanAccess: {
      qualify: async () => {
        calls += 1
        if (calls === 2) void scope.close()
        return { kind: 'allowed' }
      },
    },
  })
  expect(await scope.scan(scanInput(f))).toHaveProperty('failure.kind', 'unavailable')
  await scope.close()
  expect(calls).toBe(2)
})

it('does not start a scan when closing during its initial authorization', async () => {
  const f = await fixture()
  const entered = latch(),
    resume = latch()
  const scan = vi.fn(f.input.source.scan)
  const scope = f.build({
    scanAccess: {
      qualify: async () => {
        entered.resolve()
        await resume.promise
        return { kind: 'allowed' }
      },
    },
    source: { scan },
  })
  const running = scope.scan(scanInput(f))
  await entered.promise
  const closing = scope.close()
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(scan).not.toHaveBeenCalled()
})
