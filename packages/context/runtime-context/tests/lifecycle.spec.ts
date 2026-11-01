import { describe, expect, it } from 'vitest'
import type { HolderDecision, ScopeBinding } from '@omne-harness/runtime-context-contract'
import {
  deferred,
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
} from './support.js'

// Review N2: an operation in flight when close begins answers `closed`, never success, and close
// waits for the operations of the holder and producer faces, not only for reads.

describe('closing with holder operations in flight', () => {
  it('finishReplay waiting for the holder authority answers closed and installs nothing', async () => {
    const h = harness()
    const a = scope('close/finish')
    h.ports.bind(a, tenantA)
    const begun = await h.rc.beginReplay('holder', {
      scope: a,
      tenant: tenantA,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(begun.kind)
    const gate = deferred<HolderDecision<string>>()
    const holder = h.ports.authority.holder
    let held = false
    h.ports.authority.holder = (principal, action) => {
      if (action.kind !== 'finish-replay') return holder(principal, action)
      held = true
      return gate.promise
    }
    const finishing = h.rc.finishReplay('holder', {
      replay: begun.replay,
      material: { registrations: [], checkpoints: [], end: null },
    })
    await Promise.resolve()
    expect(held).toBe(true)
    const closing = h.rc.close()
    gate.resolve({ kind: 'authorized', principal: 'holder', current: () => true })
    expect(await finishing).toEqual({ kind: 'refused', reason: 'closed' })
    await closing
  })

  it('an answer that arrives just before close does not let the final segment report success', async () => {
    const h = harness()
    const a = scope('close/binding')
    h.ports.bind(a, tenantA)
    const begun = await h.rc.beginReplay('holder', {
      scope: a,
      tenant: tenantA,
      through: null,
      supersedes: null,
    })
    if (begun.kind !== 'replaying') throw new Error(begun.kind)
    // The holder authority answers at once; the trusted binding is held. The binding answer is
    // delivered and close begins in the same turn, before the operation resumes.
    const binding = deferred<ScopeBinding>()
    const lookup = h.ports.bindings.lookup
    let held = false
    h.ports.bindings.lookup = target => {
      if (!held) {
        held = true
        return binding.promise
      }
      return lookup(target)
    }
    const finishing = h.rc.finishReplay('holder', {
      replay: begun.replay,
      material: { registrations: [], checkpoints: [], end: null },
    })
    while (!held) await Promise.resolve()
    binding.resolve({ kind: 'bound', tenant: tenantA })
    const closing = h.rc.close()
    expect(await finishing).toEqual({ kind: 'refused', reason: 'closed' })
    await closing
  })

  it('applyCommit and issueEligibility in flight answer closed', async () => {
    const h = harness()
    const a = scope('close/commit')
    await open(h, a, tenantA)
    await producer(h, tenantA, 'test.value')
    const gate = deferred<HolderDecision<string>>()
    const holder = h.ports.authority.holder
    h.ports.authority.holder = (principal, action) =>
      action.kind === 'commit' || action.kind === 'issue' ? gate.promise : holder(principal, action)
    const committing = h.rc.applyCommit('holder', {
      kind: 'registration',
      commit: { commit: 'c1' },
      change: {
        kind: 'add',
        creating: true,
        scope: a,
        tenant: tenantA,
        key: 'test.value',
        basedOn: 0,
        required: false,
        bindings: [],
        parameters: undefined,
      },
    })
    const issuing = h.rc.issueEligibility('holder', {
      supersedes: null,
      scope: a,
      consumer: 'model',
      principal: 'reader',
      tenant: tenantA,
      keys: [],
      bindings: [],
      registrationRevision: 0,
    })
    const closing = h.rc.close()
    gate.resolve({ kind: 'authorized', principal: 'holder', current: () => true })
    expect(await committing).toEqual({ kind: 'refused', reason: 'closed' })
    expect(await issuing).toEqual({ kind: 'refused', reason: 'closed' })
    await closing
  })

  it('close settles within the bound even when a port never answers', async () => {
    const h = harness({ settleBoundMs: 20 })
    const a = scope('close/hang')
    h.ports.bind(a, tenantA)
    h.ports.authority.holder = () => new Promise(() => {})
    const begun = h.rc.beginReplay('holder', {
      scope: a,
      tenant: tenantA,
      through: null,
      supersedes: null,
    })
    const started = Date.now()
    await h.rc.close()
    expect(Date.now() - started).toBeLessThan(1000)
    expect(await begun).toEqual({ kind: 'refused', reason: 'closed' })
  })

  it('close waits for an operation that settles inside the bound', async () => {
    const h = harness({ settleBoundMs: 1000 })
    const a = scope('close/wait')
    await open(h, a, tenantA)
    const gate = deferred<HolderDecision<string>>()
    const holder = h.ports.authority.holder
    h.ports.authority.holder = (principal, action) =>
      action.kind === 'prepare' ? gate.promise : holder(principal, action)
    let settled = false
    const preparing = h.rc
      .prepareRegistration('holder', {
        kind: 'remove',
        creating: false,
        scope: a,
        tenant: tenantA,
        key: 'test.value',
        basedOn: 0,
      })
      .then(result => {
        settled = true
        return result
      })
    const closing = h.rc.close().then(() => settled)
    gate.resolve({ kind: 'authorized', principal: 'holder', current: () => true })
    expect(await closing).toBe(true)
    expect(await preparing).toEqual({ kind: 'refused', reason: 'closed' })
  })
})

describe('closing with reads and callbacks in flight', () => {
  it('a read waiting on a supply callback settles without success, and later reads answer closed', async () => {
    const h = harness({ settleBoundMs: 50 })
    const a = scope('close/read')
    await open(h, a, tenantA)
    const hanging = deferred<never>()
    let calls = 0
    await producer(h, tenantA, 'test.request', {
      declaration: { ...supplied('test.request'), volatility: 'per-request' },
      supply: () => {
        calls++
        return hanging.promise
      },
    })
    await register(h, a, tenantA, 'test.request')
    const r = await reader(h, await issue(h, a, tenantA, ['test.request']))
    const reading = r.snapshot()
    while (calls === 0) await new Promise(resolve => setTimeout(resolve, 1))
    const started = Date.now()
    await h.rc.close()
    expect(Date.now() - started).toBeLessThan(1000)
    const settled = await reading
    expect(settled.kind).not.toBe('success')
    expect(await r.snapshot()).toEqual({ kind: 'refused', reason: 'closed' })
    expect(await h.rc.bind({ eligibility: 'eligibility-1' })).toEqual({
      kind: 'refused',
      reason: 'closed',
    })
  })

  it('close ends every bound reader', async () => {
    const h = harness()
    const a = scope('close/readers')
    await open(h, a, tenantA)
    const r = await reader(h, await issue(h, a, tenantA, []))
    await h.rc.close()
    expect(await r.changes({ cursor: 'cursor-1' })).toEqual({ kind: 'refused', reason: 'closed' })
  })

  it('a handle disposed after close returns at once and changes nothing', async () => {
    const h = harness()
    const handle = await producer(h, tenantA, 'test.value')
    await h.rc.close()
    await expect(handle.dispose()).resolves.toBeUndefined()
    expect(await handle.publish({ scope: scope('x'), tenant: tenantA, value: 1 })).toEqual({
      kind: 'rejected',
      reason: 'closed',
    })
  })
})

describe('withdrawing a producer handle', () => {
  it('settles the generation reads in flight within the bound, then reads miss the block', async () => {
    const h = harness({ settleBoundMs: 30, supplyBoundMs: 100 })
    const a = scope('dispose/read')
    await open(h, a, tenantA)
    const hanging = deferred<never>()
    let calls = 0
    const handle = await producer(h, tenantA, 'test.request', {
      declaration: { ...supplied('test.request', { required: true }), volatility: 'per-request' },
      supply: () => {
        calls++
        return hanging.promise
      },
    })
    await register(h, a, tenantA, 'test.request')
    const r = await reader(h, await issue(h, a, tenantA, ['test.request']))
    const reading = r.snapshot()
    while (calls === 0) await new Promise(resolve => setTimeout(resolve, 1))
    const started = Date.now()
    await handle.dispose()
    expect(Date.now() - started).toBeLessThan(1000)
    const next = await r.snapshot()
    expect(next.kind).toBe('success')
    if (next.kind !== 'success') return
    expect(next.value.perRequest).toEqual([
      { key: 'test.request', kind: 'missing', cause: 'producer-withdrawn' },
    ])
    expect(calls).toBe(1)
    expect((await reading).kind).toBe('success')
  })

  it('a withdrawn stable block reads missing, not its old value', async () => {
    const h = harness()
    const a = scope('dispose/stable')
    await open(h, a, tenantA)
    const handle = await producer(h, tenantA, 'test.value', {
      declaration: supplied('test.value', { required: true }),
    })
    await register(h, a, tenantA, 'test.value')
    await handle.publish({ scope: a, tenant: tenantA, value: 5 })
    const r = await reader(h, await issue(h, a, tenantA, ['test.value']))
    expect(await firstBlock(r)).toEqual({ kind: 'value', value: 5 })
    await handle.dispose()
    expect(await firstBlock(r)).toEqual({ missing: ['producer-withdrawn'] })
  })
})
