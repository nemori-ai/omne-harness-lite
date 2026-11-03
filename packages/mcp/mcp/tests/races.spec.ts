// Interleavings across the publish boundary, the connection build and the close: a late result
// never acts on a connection it did not produce, every phase is bounded, and a close and an
// ensure of the same key both leave their connection with an owner. Steps are ordered with
// deferred promises; the only timers are the connection bounds under test.
import { describe, expect, it } from 'vitest'
import type { ListingPage, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { admit } from '../src/internal/gate.ts'
import { createConnectionTable } from '../src/internal/table.ts'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { stallingEligibility, stallingLanding } from './doubles/stalls.ts'
import { alice, millis, peerIdentity, ref } from './doubles/values.ts'
import { VALUE, adoptStdio, page, usualScript, world, type World } from './doubles/world.ts'

const files = ref('files')
const peer = peerIdentity()
const anonymousKey = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}

async function stored(w: World) {
  const read = await w.store.read(anonymousKey)
  if (!('ok' in read)) throw new Error('store unavailable')
  return read.ok
}

/** A world whose eligibility port stalls its `which`-th check on a gate. */
function stalledWorld(w: World, which: number) {
  const stalled = stallingEligibility(w.eligibility, which)
  return { gate: stalled.gate, c: core({ ...w, ports: { ...w.ports, eligibility: stalled.port } }) }
}

describe('publish boundary (B1): the checks sit next to the write', () => {
  // A refresh asks eligibility twice: at the gate (call 1) and at the boundary (call 2).
  it('a connection replaced while the boundary waits on eligibility: kept (superseded)', async () => {
    const listing = deferred<ListingPage>()
    const second = deferred<ListingPage>()
    const w = world({
      script: [
        { discover: peer },
        { listActions: listing },
        { discover: peer },
        { listActions: second },
      ],
    })
    adoptStdio(w, files)
    const { gate, c } = stalledWorld(w, 2)
    const late = c.discovery.refresh(alice, { ref: files })
    await settled()
    listing.resolve(page(['stale']))
    await settled()
    // The boundary is now waiting on eligibility. Replace the connection meanwhile, without
    // publishing: the late result is the only writer, so only the boundary can stop it.
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    const next = c.discovery.refresh(alice, { ref: files })
    await settled()
    gate.resolve()
    expect(await late).toEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
    expect(await stored(w)).toBe('absent')
    second.resolve(page(['fresh']))
    expect(await next).toEqual({ ok: { kind: 'published', revision: 1 } })
    const record = await stored(w)
    if (record === 'absent') throw new Error('nothing stored')
    expect(record.actions.map(action => action.name)).toEqual(['fresh'])
    expect(record.basis.generation).toBe(2)
  })

  it('aborted while the boundary waits on eligibility: kept (cancelled)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const { gate, c } = stalledWorld(w, 2)
    const controller = new AbortController()
    const pending = c.discovery.refresh(alice, { ref: files, signal: controller.signal })
    await settled()
    controller.abort()
    gate.resolve()
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'cancelled' } } })
    expect(await stored(w)).toBe('absent')
  })

  it('the adoption revision changed while the boundary waits on eligibility: kept (superseded)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const { gate, c } = stalledWorld(w, 2)
    const pending = c.discovery.refresh(alice, { ref: files })
    await settled()
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    gate.resolve()
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
    expect(await stored(w)).toBe('absent')
  })
})

describe('late results (B2): a page from an earlier generation does not touch the new connection', () => {
  it('keeps the rebuilt connection ready, its transport open and its process running', async () => {
    const first = deferred<ListingPage | TransportFailure>()
    const w = world({
      script: [
        { discover: peer },
        { listActions: first },
        { listActions: { kind: 'not-sent', cause: 'connection-unavailable' } },
        { discover: peer },
        { listActions: page(['fresh']) },
      ],
    })
    adoptStdio(w, files)
    const c = core(w)
    const late = c.discovery.refresh(alice, { ref: files })
    await settled()
    // A second refresh on generation 1 finds the connection gone; a third rebuilds generation 2.
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
    const closesBefore = w.transports.calls.filter(call => call.kind === 'close').length
    first.resolve({ kind: 'not-sent', cause: 'connection-unavailable' })
    expect(await late).toEqual({ ok: { kind: 'kept', reason: { kind: 'superseded' } } })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(w.transports.calls.filter(call => call.kind === 'close')).toHaveLength(closesBefore)
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
    const record = await stored(w)
    if (record === 'absent') throw new Error('nothing stored')
    expect(record.actions.map(action => [action.name, action.availability.kind])).toEqual([
      ['fresh', 'available'],
    ])
  })
})

describe('listing bound (B3): reading pages is bounded like the build', () => {
  it('a page that never comes: listing-incomplete (page-failed) at the bound, connection degraded', async () => {
    const never = deferred<ListingPage>()
    const w = world({ script: [{ discover: peer }, { listActions: never }] })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millis(50)) } })
    const c = core(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'kept', reason: { kind: 'listing-incomplete', defect: 'page-failed' } },
    })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'degraded', reason: 'list-failed' } },
    })
    expect(await stored(w)).toBe('absent')
  })

  it('aborted while a page is pending: kept (cancelled) at once, the connection untouched', async () => {
    const never = deferred<ListingPage>()
    const w = world({ script: [{ discover: peer }, { listActions: never }] })
    adoptStdio(w, files)
    const c = core(w)
    const controller = new AbortController()
    const pending = c.discovery.refresh(alice, { ref: files, signal: controller.signal })
    await settled()
    controller.abort()
    expect(await pending).toEqual({ ok: { kind: 'kept', reason: { kind: 'cancelled' } } })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(await stored(w)).toBe('absent')
  })
})

describe('close against ensure (B4): both connections keep an owner', () => {
  it('a refresh during a slow release waits for the close; the new connection is closable', async () => {
    const closing = deferred<'closed'>()
    const w = world({
      script: [
        { discover: peer },
        { listActions: page(['a']) },
        { close: closing },
        ...usualScript(['b']),
      ],
    })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const c = core(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const releasing = c.connections.release(alice, files)
    await settled()
    const refreshing = c.discovery.refresh(alice, { ref: files })
    await settled()
    closing.resolve('closed')
    expect(await releasing).toEqual({ ok: { kind: 'released', process: 'tree-confirmed' } })
    expect(await refreshing).toMatchObject({ ok: { kind: 'published' } })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
    expect(await c.connections.closeAll()).toEqual([{ ref: files, process: 'tree-confirmed' }])
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 1 }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 1 },
    ])
  })
})

describe('build bound (B5): credentials and the landing are bounded too', () => {
  it('a landing that never answers: connection-unavailable at the bound; release returns', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millis(50)) } })
    const stalled = stallingLanding(w.landing)
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.connections.release(alice, files)).toMatchObject({ ok: {} })
    // The process that lands too late is stopped by the table.
    stalled.gate.resolve()
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
  })
})

describe('a port that throws (N1)', () => {
  it('a rejected discover is torn down; the next ensure builds again', async () => {
    const broken = deferred<typeof peer>()
    const w = world({ script: [{ discover: broken }, ...usualScript()] })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const c = core(w)
    const first = c.discovery.refresh(alice, { ref: files })
    await settled()
    broken.reject(new Error('transport bug'))
    await expect(first).rejects.toThrow('transport bug')
    expect(w.trace).toEqual(['transport.close', 'process.stop', 'credential.release'])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'preparation-failed' } },
    })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
  })
})

describe('caller abort during the build (O3)', () => {
  it('answers kept (cancelled), marks nothing, and leaves the shared build to the other caller', async () => {
    const discover = deferred<typeof peer>()
    const w = world({ script: [{ discover }, { listActions: page(['a']) }] })
    adoptStdio(w, files)
    const c = core(w)
    const controller = new AbortController()
    const cancelled = c.discovery.refresh(alice, { ref: files, signal: controller.signal })
    const other = c.discovery.refresh(alice, { ref: files })
    await settled()
    controller.abort()
    expect(await cancelled).toEqual({ ok: { kind: 'kept', reason: { kind: 'cancelled' } } })
    discover.resolve(peer)
    expect(await other).toEqual({ ok: { kind: 'published', revision: 1 } })
    expect(w.landing.processes()).toEqual([{ stops: 0 }])
  })
})

describe('an old adoption revision (O2)', () => {
  it('ensure with a token of an earlier revision answers unknown and leaves the new connection alone', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    adoptStdio(w, files)
    const table = createConnectionTable(w.ports, w.config)
    const old = await admit(w.ports, alice, files)
    if (old.kind !== 'admitted') throw new Error('not admitted')
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const current = await admit(w.ports, alice, files)
    if (current.kind !== 'admitted') throw new Error('not admitted')
    const fresh = await table.ensure(current.endpoint, alice)
    if (!('ok' in fresh)) throw new Error('ensure failed')
    expect(await table.ensure(old.endpoint, alice)).toEqual({
      failure: { stage: 'settings', reason: { kind: 'unknown' } },
    })
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'ready' })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    expect(w.landing.processes()).toEqual([{ stops: 0 }])
  })
})

describe('the gate the services walk through (D1)', () => {
  it('does not ask eligibility for an endpoint that is not adopted', async () => {
    const w = world()
    adoptStdio(w, files)
    const c = core(w)
    const nowhere = ref('nowhere')
    await c.discovery.refresh(alice, { ref: nowhere })
    await c.discovery.current(alice, nowhere)
    await c.status.inspect(alice, nowhere)
    await c.connections.release(alice, nowhere)
    expect(w.eligibility.calls()).toBe(0)
  })

  it('another principal without eligibility does not close the connection of the tenant (O1)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const c = core(w)
    await c.discovery.refresh(alice, { ref: files })
    const bob = { ...alice, principal: { id: 'bob' } }
    expect(await c.status.inspect(bob, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
  })
})
