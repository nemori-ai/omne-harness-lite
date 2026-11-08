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

it('waits for every concurrent operation before reporting close completion', async () => {
  const f = await fixture()
  const entered = latch(),
    first = latch(),
    second = latch()
  let reads = 0
  const scope = f.build({
    store: {
      ...f.store,
      read: async domain => {
        const waiting = reads++ === 0 ? first.promise : second.promise
        if (reads === 2) entered.resolve()
        await waiting
        return f.store.read(domain)
      },
    },
  })
  const a = scope.expire(f.parent),
    b = scope.expire(f.parent)
  await entered.promise
  let closed = false
  const closing = scope.close().then(() => {
    closed = true
  })
  first.resolve()
  expect(await a).toHaveProperty('failure.kind', 'unavailable')
  expect(closed).toBe(false)
  second.resolve()
  expect(await b).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(closed).toBe(true)
})

it('does not sample time when close occurs during the preceding ledger read', async () => {
  const f = await fixture()
  await seedMaterial(f, true)
  const entered = latch(),
    resume = latch()
  const sample = vi.fn(async () => succeed(instant(10)))
  const scope = f.build({
    materials: { ...f.input.materials, clock: { sample } },
    store: {
      ...f.store,
      read: async domain => {
        entered.resolve()
        await resume.promise
        return f.store.read(domain)
      },
    },
  })
  const running = scope.expire(f.parent)
  await entered.promise
  const closing = scope.close()
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(sample).not.toHaveBeenCalled()
})

it('preserves an unknown commit while open and recognizes it without a new write', async () => {
  const f = await fixture()
  const commit = vi.fn(async (input: Parameters<typeof f.store.commit>[0]) => {
    await f.store.commit(input)
    return { kind: 'unknown' as const, diagnostic: 'reply lost' }
  })
  const scope = f.build({ store: { ...f.store, commit } })
  expect(await scope.expire(f.parent)).toHaveProperty(
    'failure.diagnostic',
    'expiration commit is unknown',
  )
  expect(ok(await scope.expire(f.parent)).expiredBodies).toBe(0)
  expect(commit).toHaveBeenCalledTimes(1)
  await scope.close()
})

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

it('waits for an accepted ledger read and forbids its later commit after close', async () => {
  const f = await fixture()
  const entered = latch()
  const resume = latch()
  const commit = vi.fn(f.store.commit)
  const scope = f.build({
    store: {
      ...f.store,
      read: async domain => {
        entered.resolve()
        await resume.promise
        return f.store.read(domain)
      },
      commit,
    },
  })
  const running = scope.expire(f.parent)
  await entered.promise
  let closed = false
  const closing = scope.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(commit).not.toHaveBeenCalled()
  const businessRead = await f.store.read({
    kind: 'call',
    tenant: f.parent.tenant,
    call: f.parent.call,
  })
  expect(businessRead.kind).toBe('complete')
})

it('closes once and admits no later maintenance, scans or provider calls', async () => {
  const f = await fixture()
  const qualify = vi.fn(f.input.access.qualify)
  const scan = vi.fn(f.input.source.scan)
  const scope = f.build({ access: { qualify }, source: { scan } })
  const closed = scope.close()
  expect(scope.close()).toBe(closed)
  await closed
  expect(await scope.expire(f.parent)).toHaveProperty('failure.kind', 'unavailable')
  expect(await scope.reclaim(f.parent)).toHaveProperty('failure.kind', 'unavailable')
  expect(await scope.scan(scanInput(f))).toHaveProperty('failure.kind', 'unavailable')
  expect(qualify).not.toHaveBeenCalled()
  expect(scan).not.toHaveBeenCalled()
})

it('registers the operation before a synchronous authorization callback closes the scope', async () => {
  const f = await fixture()
  const resume = latch()
  let scope: LocalToolMaterialMaintenance<string>
  let closed = false
  scope = f.build({
    access: {
      qualify: () => {
        void scope.close().then(() => {
          closed = true
        })
        return resume.promise.then(() => ({ kind: 'allowed' }))
      },
    },
  })
  const read = vi.spyOn(f.store, 'read')
  const running = scope.expire(f.parent)
  await Promise.resolve()
  expect(closed).toBe(false)
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await scope.close()
  expect(closed).toBe(true)
  expect(read).not.toHaveBeenCalled()
})

it('does not commit expiry after closing during a clock sample', async () => {
  const f = await fixture()
  await seedMaterial(f, true)
  const entered = latch(),
    resume = latch()
  const commit = vi.fn(f.store.commit)
  const scope = f.build({
    store: { ...f.store, commit },
    materials: {
      ...f.input.materials,
      clock: {
        sample: async () => {
          entered.resolve()
          await resume.promise
          return succeed(instant(10))
        },
      },
    },
  })
  const running = scope.expire(f.parent)
  await entered.promise
  const closing = scope.close()
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(commit).not.toHaveBeenCalled()
})

it.each(['committed', 'unknown'] as const)(
  'waits for an accepted %s commit without reporting success after close',
  async kind => {
    const f = await fixture()
    const entered = latch(),
      resume = latch()
    const scope = f.build({
      store: {
        ...f.store,
        commit: async input => {
          entered.resolve()
          await resume.promise
          const answer = await f.store.commit(input)
          return kind === 'unknown' ? { kind: 'unknown', diagnostic: 'reply lost' } : answer
        },
      },
    })
    const running = scope.expire(f.parent)
    await entered.promise
    let closed = false
    const closing = scope.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    resume.resolve()
    const answer = await running
    expect(answer).toHaveProperty('failure.kind', 'unavailable')
    expect(answer).toHaveProperty(
      'failure.diagnostic',
      'maintenance scope is closed; an accepted operation may have completed',
    )
    await closing
    const fresh = f.build()
    expect(ok(await fresh.expire(f.parent)).expiredBodies).toBe(0)
    await fresh.close()
  },
)

it.each(['inspectErase', 'erase'] as const)(
  'stops after an accepted %s and recovers the original deletion identity in a new scope',
  async method => {
    const f = await fixture()
    const seeded = await seedMaterial(f, false)
    const entered = latch(),
      resume = latch()
    const erase = vi.fn(f.material.store.erase)
    const inspectErase = vi.fn(f.material.store.inspectErase)
    const store = { inspectErase, erase }
    const wrapped =
      method === 'inspectErase'
        ? {
            ...store,
            inspectErase: async (input: Parameters<typeof inspectErase>[0]) => {
              entered.resolve()
              await resume.promise
              return inspectErase(input)
            },
          }
        : {
            ...store,
            erase: async (input: Parameters<typeof erase>[0]) => {
              entered.resolve()
              await resume.promise
              return erase(input)
            },
          }
    const scope = f.build({ materials: { ...f.input.materials, store: wrapped } })
    const running = scope.reclaim(f.parent)
    await entered.promise
    const closing = scope.close()
    resume.resolve()
    expect(await running).toHaveProperty('failure.kind', 'unavailable')
    await closing
    expect(erase).toHaveBeenCalledTimes(method === 'erase' ? 1 : 0)
    const afterClose = await f.store.read(seeded.domain)
    if (afterClose.kind !== 'complete') throw new Error('fixture read failed')
    const pending = afterClose.records.find(row => row.kind === 'material')
    expect(pending).toMatchObject({ material: { state: { kind: 'deleting' } } })
    const fresh = f.build({ materials: { ...f.input.materials, store } })
    expect(ok(await fresh.reclaim(f.parent)).kind).toBe('deleted')
    expect(erase).toHaveBeenCalledTimes(1)
    expect(inspectErase).toHaveBeenCalledTimes(2)
    expect(inspectErase.mock.calls[1]?.[0].operation).toBe(
      inspectErase.mock.calls[0]?.[0].operation,
    )
    expect(
      await f.material.store.read({
        ...f.parent,
        material: seeded.material,
        offset: '0',
        maxBytes: 20,
      }),
    ).toHaveProperty('failure.kind', 'unavailable')
    await fresh.close()
  },
)

it('discards a scan page after close and does not requalify', async () => {
  const f = await fixture()
  const entered = latch(),
    resume = latch()
  const qualify = vi.fn(f.input.scanAccess.qualify)
  const scope = f.build({
    scanAccess: { qualify },
    source: {
      scan: async input => {
        entered.resolve()
        await resume.promise
        return f.input.source.scan(input)
      },
    },
  })
  const running = scope.scan(scanInput(f))
  await entered.promise
  const closing = scope.close()
  resume.resolve()
  expect(await running).toHaveProperty('failure.kind', 'unavailable')
  await closing
  expect(qualify).toHaveBeenCalledTimes(1)
})

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
