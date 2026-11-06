// The shutdown (SPEC decisions 5 and 6): `closeAll` releases the handles of the landings in flight
// at once, whatever another entry's close waits on, and a build that is under way when the table
// shuts goes no further than the step it is in. Steps are ordered with deferred promises; the only
// timers are the connection bounds under test.
import { describe, expect, it } from 'vitest'
import { only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { stallingCredentials, stallingLanding, stallingStops } from './doubles/stalls.ts'
import type { PeerIdentity } from '@omne-harness/mcp-contract'
import { millisOf, peerIdentityOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { VALUE, adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = endpointRefOf('files')
const notes = endpointRefOf('notes')
const WITH_CREDENTIAL = {
  auth: 'static',
  env: [{ name: 'TOKEN', source: 'credential' }],
} as const
const REFUSED = { failure: { kind: 'connection-unavailable' } }
const ANONYMOUS_KEY = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}

function opens(w: World): number {
  return w.transports.calls.filter(call => call.kind === 'open').length
}

describe('closeAll releases the handles of the landings in flight at once (decision 6)', () => {
  it('while the close of another entry waits on its transport', async () => {
    const closing = deferred<'closed'>()
    const w = world({ script: [...usualScript(), { close: closing }] })
    adoptStdio(w, files)
    adoptStdio(w, notes, {
      ...WITH_CREDENTIAL,
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    // The start for `files` is call 1 and lands; the start for `notes` is call 2 and never does.
    const stalled = stallingLanding(w.landing, only(2))
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(await c.discovery.refresh(alice, { ref: notes })).toEqual(REFUSED)
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    const all = c.connections.closeAll()
    await settled()
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    closing.resolve('closed')
    expect(await all).toEqual([
      { ref: files, process: 'tree-confirmed' },
      { ref: notes, process: 'unconfirmed' },
    ])
  })

  it('for a landing that outlives its bound after the shutdown began; the late process is stopped once', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      ...WITH_CREDENTIAL,
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    const stalled = stallingLanding(w.landing)
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(1)
    const all = c.connections.closeAll()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'unconfirmed' }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    stalled.gate.resolve()
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('for a landing still within its bound: released before the landing answers; the process that lands is stopped and its handle not released again', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const bounds = manualBounds()
    const stalled = stallingLanding(w.landing)
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } }, bounds.runtime)
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(1)
    const all = c.connections.closeAll()
    await settled()
    // No bound fired: the landing is in flight within its bound, and its handle is released.
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    stalled.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'no-process' }])
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('not for a landing that already handed over its process: the handle waits for its stop (S9)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      ...WITH_CREDENTIAL,
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    const stops = stallingStops(w.landing, only(1))
    const landing = stallingLanding(stops.port)
    const c = core({ ...w, ports: { ...w.ports, landing: landing.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual(REFUSED)
    landing.gate.resolve()
    await settled()
    // The late process is being stopped; it carries the handle in its environment.
    const all = c.connections.closeAll()
    await settled()
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    stops.gate.resolve()
    await all
    await settled()
    expect(w.trace).toEqual(['process.stop', 'credential.release'])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })
})

describe('a build under way when the table shuts goes no further (decision 5)', () => {
  it('shut while the credential is asked: no process starts, no transport opens, the handle is released once', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const credentials = stallingCredentials(w.ports.credentials)
    const c = core({ ...w, ports: { ...w.ports, credentials: credentials.port } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    const all = c.connections.closeAll()
    await settled()
    credentials.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'no-process' }])
    expect(w.landing.processes()).toEqual([])
    expect(opens(w)).toBe(0)
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('shut while the process starts: the process that lands is stopped and no transport opens', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const stalled = stallingLanding(w.landing)
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(1)
    const all = c.connections.closeAll()
    await settled()
    stalled.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'no-process' }])
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(opens(w)).toBe(0)
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('shut while negotiating: the same refusal as after the shutdown, not a connection about to be torn down (decision 23)', async () => {
    const discover = deferred<PeerIdentity>()
    const w = world({ script: [{ discover }] })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const c = core(w)
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    const all = c.connections.closeAll()
    await settled()
    discover.resolve(peerIdentityOf())
    expect(await refreshed).toEqual(REFUSED)
    await all
    expect(w.trace).toEqual(['transport.close', 'process.stop', 'credential.release'])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })
})

describe('a build cut off by the shutdown marks nothing', () => {
  it('the catalog keeps its revision: the shutdown is a fact of this instance, not of the endpoint', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptStdio(w, files)
    // The first start lands at once; the start of the rebuild waits until the table is shut.
    const stalled = stallingLanding(w.landing, only(2))
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const published = await w.store.read(ANONYMOUS_KEY)
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(2)
    const all = c.connections.closeAll()
    await settled()
    stalled.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'no-process' }])
    expect(await w.store.read(ANONYMOUS_KEY)).toEqual(published)
  })

  it('a build that fails after the shutdown began marks nothing either, and answers as after the shutdown (takeover ruling K3)', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptStdio(w, files)
    const bounds = manualBounds()
    const stalled = stallingLanding(w.landing, only(2))
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } }, bounds.runtime)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const published = await w.store.read(ANONYMOUS_KEY)
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(2)
    const all = c.connections.closeAll()
    await settled()
    // The rebuild's bound fires after the shutdown began: the build fails at the landing.
    bounds.fire('build', 1)
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files, process: 'unconfirmed' }])
    expect(await w.store.read(ANONYMOUS_KEY)).toEqual(published)
  })
})

describe('closeAll hands the errors of the background work to its caller (SPEC P7)', () => {
  it('rejects once with an AggregateError that holds them; an error after it goes to the outlet of the scope', async () => {
    const w = world()
    const late: unknown[] = []
    const bounds = manualBounds(error => late.push(error))
    const c = core(w, bounds.runtime)
    const bug = new Error('an error of this package in the background')
    c.table.runtime.scope.spawn(Promise.reject(bug))
    await settled()
    const thrown = await c.connections.closeAll().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(thrown).toBeInstanceOf(AggregateError)
    expect(thrown instanceof AggregateError ? thrown.errors : []).toEqual([bug])
    expect(await c.connections.closeAll()).toEqual([])
    const after = new Error('after the exit')
    c.table.runtime.scope.spawn(Promise.reject(after))
    await settled()
    expect(late).toEqual([after])
  })
})
