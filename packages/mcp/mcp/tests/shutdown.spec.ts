// The shutdown (SPEC decisions 5 and 6): `closeAll` releases the handles of the landings in flight
// at once, whatever another entry's close waits on, and a build that is under way when the table
// shuts goes no further than the step it is in. Steps are ordered with deferred promises; the only
// timers are the connection bounds under test.
import { describe, expect, it } from 'vitest'
import { only } from './doubles/calls.ts'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import { stallingCredentials, stallingLanding } from './doubles/stalls.ts'
import { alice, millis, ref } from './doubles/values.ts'
import { VALUE, adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = ref('files')
const notes = ref('notes')
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
      settings: { connectTimeout: VALUE(millis(50)) },
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
      settings: { connectTimeout: VALUE(millis(50)) },
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
})
