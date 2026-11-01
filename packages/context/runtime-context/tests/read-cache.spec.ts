import { describe, expect, it } from 'vitest'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type { RuntimeContextConfig } from '@omne-harness/runtime-context'
import { createReadCache } from '../src/read-cache.js'
import {
  cacheCount,
  firstBlock,
  harness,
  issue,
  open,
  producer,
  reader,
  register,
  scope,
  supplied,
  tenantA,
  tenantB,
} from './support.js'

const key = (tenant: string, ref = 'shared') => ({
  tenant,
  scope: ref,
  eligibility: 'eligibility-1',
  registration: 1,
  projection: 3,
})

describe('read cache entries', () => {
  it('keys keep tenants apart even when every other part is equal', () => {
    const cache = createReadCache<string>(4, () => {})
    cache.set(key('tenant-a'), 'a')
    expect(cache.get(key('tenant-b'))).toBeUndefined()
    expect(cache.get(key('tenant-a'))).toBe('a')
  })

  it('evicts the least recently used entry beyond the capacity', () => {
    const events: string[] = []
    const cache = createReadCache<string>(2, event => void events.push(event))
    cache.set(key('t', 'one'), '1')
    cache.set(key('t', 'two'), '2')
    expect(cache.get(key('t', 'one'))).toBe('1')
    cache.set(key('t', 'three'), '3')
    expect(cache.size).toBe(2)
    expect(cache.get(key('t', 'two'))).toBeUndefined()
    expect(cache.get(key('t', 'one'))).toBe('1')
    expect(events.filter(e => e === 'evicted')).toHaveLength(1)
  })
})

async function setup(config: RuntimeContextConfig = {}) {
  const h = harness(config)
  const a = scope('cache/a')
  await open(h, a, tenantA)
  const handle = await producer(h, tenantA, 'test.value')
  await register(h, a, tenantA, 'test.value')
  await handle.publish({ scope: a, tenant: tenantA, value: 1 })
  const eligibility = await issue(h, a, tenantA, ['test.value'])
  const r = await reader(h, eligibility)
  return { h, a, handle, eligibility, r }
}

describe('read cache in the mechanism', () => {
  it('a repeated snapshot on the same projection is a hit with the same result', async () => {
    const { h, r } = await setup()
    const first = await r.snapshot()
    const second = await r.snapshot()
    expect(cacheCount(h, 'miss')).toBe(1)
    expect(cacheCount(h, 'hit')).toBe(1)
    expect(second.kind).toBe('success')
    if (first.kind !== 'success' || second.kind !== 'success') return
    expect(second.value.blocks).toEqual(first.value.blocks)
  })

  it('a publication advances the projection, so the next read sees the new value', async () => {
    const { h, a, handle, r } = await setup()
    expect(await firstBlock(r)).toEqual({ kind: 'value', value: 1 })
    await handle.publish({ scope: a, tenant: tenantA, value: 2 })
    expect(await firstBlock(r)).toEqual({ kind: 'value', value: 2 })
    expect(cacheCount(h, 'hit')).toBe(0)
  })

  it('a hit still checks the current eligibility: revocation refuses the next read', async () => {
    const { h, r, eligibility } = await setup()
    await r.snapshot()
    expect((await h.rc.revokeEligibility('holder', eligibility.id)).kind).toBe('revoked')
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
  })

  it('a hit still asks the reader authority: a refusal refuses the next read', async () => {
    const { h, r } = await setup()
    await r.snapshot()
    h.ports.script(call => (call.face === 'reader' ? { kind: 'refused' } : undefined))
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(cacheCount(h, 'hit')).toBe(0)
  })

  it('a hit calls current() before disclosure: a stale decision refuses the read', async () => {
    const { h, r } = await setup()
    await r.snapshot()
    h.ports.script(call =>
      call.face === 'reader'
        ? { kind: 'authorized', principal: call.principal, current: () => false }
        : undefined,
    )
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(cacheCount(h, 'hit')).toBe(1)
  })

  it('a reader of another tenant never reaches an entry of tenant A', async () => {
    const { h, a, r } = await setup()
    await r.snapshot()
    await r.snapshot()
    const hits = cacheCount(h, 'hit')
    // The binding source now names tenant B. Tenant B's holder cannot get an eligibility on the
    // scope text, because the recorded tenant conflicts, and tenant A's reader is refused.
    h.ports.bind(a, tenantB)
    const other = await h.rc.issueEligibility('holder', {
      supersedes: null,
      scope: a,
      consumer: 'model',
      principal: 'reader-b',
      tenant: tenantB,
      keys: ['test.value'],
      bindings: [],
      registrationRevision: 0,
    })
    expect(other.kind).toBe('refused')
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'unauthorized' })
    expect(cacheCount(h, 'hit')).toBe(hits)
  })

  it('separate tenants read their own values and never share an entry', async () => {
    const h = harness()
    const a = scope('tenant-a/s')
    const b = scope('tenant-b/s')
    await open(h, a, tenantA)
    await open(h, b, tenantB)
    const ha = await producer(h, tenantA, 'test.value')
    const hb = await producer(h, tenantB, 'test.value')
    await register(h, a, tenantA, 'test.value')
    await register(h, b, tenantB, 'test.value')
    await ha.publish({ scope: a, tenant: tenantA, value: 1 })
    await hb.publish({ scope: b, tenant: tenantB, value: 2 })
    const ra = await reader(h, await issue(h, a, tenantA, ['test.value']))
    const rb = await reader(h, await issue(h, b, tenantB, ['test.value']))
    expect(await firstBlock(ra)).toEqual({ kind: 'value', value: 1 })
    expect(await firstBlock(rb)).toEqual({ kind: 'value', value: 2 })
    expect(cacheCount(h, 'hit')).toBe(0)
    expect(cacheCount(h, 'miss')).toBe(2)
  })

  it('with a capacity of two, three scopes read in turn evict the oldest entry', async () => {
    const h = harness({ readCacheEntries: 2 })
    const refs = ['one', 'two', 'three'].map(ref => scope(`cache/${ref}`))
    const handle = await producer(h, tenantA, 'test.value')
    const readers = []
    for (const [n, target] of refs.entries()) {
      await open(h, target, tenantA)
      await register(h, target, tenantA, 'test.value')
      await handle.publish({ scope: target, tenant: tenantA, value: n })
      readers.push(await reader(h, await issue(h, target, tenantA, ['test.value'])))
    }
    for (const r of readers) await r.snapshot()
    expect(cacheCount(h, 'evicted')).toBe(1)
    await readers[2]?.snapshot()
    await readers[1]?.snapshot()
    expect(cacheCount(h, 'hit')).toBe(2)
    await readers[0]?.snapshot()
    expect(cacheCount(h, 'hit')).toBe(2)
  })

  it('a capacity of zero never caches', async () => {
    const { h, r } = await setup({ readCacheEntries: 0 })
    await r.snapshot()
    await r.snapshot()
    expect(cacheCount(h, 'hit')).toBe(0)
  })

  it.each([-1, 1.5, Number.NaN])('rejects the illegal capacity %s at construction', capacity => {
    const h = harness()
    expect(() =>
      createRuntimeContext({
        trust: { authority: h.ports.authority, bindings: h.ports.bindings },
        config: { readCacheEntries: capacity },
      }),
    ).toThrow(RangeError)
  })
})

describe('projection version advances on every change that alters a filtered read', () => {
  it('a new generation of the same producer drops the stored value, so no cached value is served', async () => {
    const { h, r } = await setup()
    expect(await firstBlock(r)).toEqual({ kind: 'value', value: 1 })
    await producer(h, tenantA, 'test.value')
    expect(await firstBlock(r)).toEqual({ kind: 'none' })
  })

  it('a declaration that arrives from another tenant makes the next read of tenant A a miss', async () => {
    const { h, r } = await setup()
    await r.snapshot()
    await r.snapshot()
    expect(cacheCount(h, 'miss')).toBe(1)
    // Same digest, new declaration object: the catalog entry of the key is replaced.
    await producer(h, tenantB, 'test.value', { declaration: supplied('test.value') })
    await r.snapshot()
    expect(cacheCount(h, 'miss')).toBe(2)
  })

  it('a declaration that makes a registration incompatible turns the block missing for that scope', async () => {
    const h = harness()
    const a = scope('decl/a')
    const b = scope('decl/b')
    const strict = {
      '~standard': {
        version: 1 as const,
        vendor: 'tests',
        validate: (value: unknown) =>
          value === 'ok' ? { value } : { issues: [{ message: 'Expected ok' }] },
      },
    }
    const declaration = supplied('test.param', { parameterSchema: strict })
    await open(h, a, tenantA)
    await open(h, b, tenantB)
    // Tenant B registers the key before any declaration exists, with a parameter the
    // declaration will reject. Tenant A's producer then brings the declaration into the catalog.
    await register(h, b, tenantB, 'test.param', 0, { parameters: 'bad' })
    await producer(h, tenantA, 'test.param', { declaration })
    const rb = await reader(h, await issue(h, b, tenantB, ['test.param']))
    await rb.snapshot()
    await rb.snapshot()
    const after = await rb.snapshot()
    expect(after.kind).toBe('success')
    if (after.kind !== 'success') return
    // The arrival is judged against every registration of the key, across tenants.
    expect(after.value.blocks).toEqual([])
    expect(after.value.missing.map(item => item.cause)).toEqual(['no-value'])
    expect(h.diagnostics.some(d => d.kind === 'incompatible-registration')).toBe(true)
  })
})
