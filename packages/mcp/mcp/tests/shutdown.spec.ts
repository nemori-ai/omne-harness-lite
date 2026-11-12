// The shutdown (SPEC decision 6): a build that is under way when the table shuts goes no further
// than the step it is in, and marks nothing. Steps are ordered with deferred promises; the only
// timers are the connection bounds under test.
import { describe, expect, it } from 'vitest'
import { only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { stallingCredentials, stallingOpens } from './doubles/stalls.ts'
import type { PeerIdentity } from '@omne-harness/mcp-contract'
import { peerIdentityOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { adoptHttp, usualScript, world, type World } from './doubles/world.ts'

const files = endpointRefOf('files')
const WITH_CREDENTIAL = { auth: 'static' } as const
const REFUSED = { failure: { kind: 'connection-unavailable' } }
const ANONYMOUS_KEY = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}

function opens(w: World): number {
  return w.transports.calls.filter(call => call.kind === 'open').length
}

describe('a build under way when the table shuts goes no further (MC-5)', () => {
  it('shut while the credential is asked: no transport opens, the handle is released once', async () => {
    const w = world({ script: usualScript() })
    adoptHttp(w, files, WITH_CREDENTIAL)
    const credentials = stallingCredentials(w.ports.credentials)
    const c = core({ ...w, ports: { ...w.ports, credentials: credentials.port } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    const all = c.connections.closeAll()
    await settled()
    credentials.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files }])
    expect(opens(w)).toBe(0)
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('shut while negotiating: the same refusal as after the shutdown, not a connection about to be torn down (MC-5)', async () => {
    const discover = deferred<PeerIdentity>()
    const w = world({ script: [{ discover }] })
    adoptHttp(w, files, WITH_CREDENTIAL)
    const c = core(w)
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    const all = c.connections.closeAll()
    await settled()
    discover.resolve(peerIdentityOf())
    expect(await refreshed).toEqual(REFUSED)
    await all
    expect(w.trace).toEqual(['transport.close', 'credential.release'])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })
})

describe('a build cut off by the shutdown marks nothing', () => {
  it('the catalog keeps its revision: the shutdown is a fact of this instance, not of the endpoint', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptHttp(w, files, { auth: 'none' })
    // The first open answers at once; the open of the rebuild waits until the table is shut.
    const stalled = stallingOpens(w.transports, only(2))
    const c = core({ ...w, ports: { ...w.ports, transports: stalled.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const published = await w.store.read(ANONYMOUS_KEY)
    expect(await c.connections.release(alice, files)).toEqual({ ok: { kind: 'released' } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(2)
    const all = c.connections.closeAll()
    await settled()
    stalled.gate.resolve()
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files }])
    expect(await w.store.read(ANONYMOUS_KEY)).toEqual(published)
  })

  it('a build that fails after the shutdown began marks nothing either, and answers as after the shutdown (MC-5, MC-10)', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptHttp(w, files, { auth: 'none' })
    const bounds = manualBounds()
    const stalled = stallingOpens(w.transports, only(2))
    const c = core({ ...w, ports: { ...w.ports, transports: stalled.port } }, bounds.runtime)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const published = await w.store.read(ANONYMOUS_KEY)
    expect(await c.connections.release(alice, files)).toEqual({ ok: { kind: 'released' } })
    const refreshed = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(2)
    const all = c.connections.closeAll()
    await settled()
    // The rebuild's bound fires after the shutdown began: the build fails at the open.
    bounds.fire('build', 1)
    expect(await refreshed).toEqual(REFUSED)
    expect(await all).toEqual([{ ref: files }])
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
