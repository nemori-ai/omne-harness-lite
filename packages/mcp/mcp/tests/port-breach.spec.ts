import { describe, expect, it } from 'vitest'
import type { AdoptionView, UseEligibility } from '@omne-harness/mcp-contract/provider'
import { only, picker, type Which } from './doubles/calls.ts'
import { core } from './doubles/core.ts'
import type { Principal } from './doubles/identities.ts'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = endpointRefOf('files')

function down(port: string): Promise<never> {
  return Promise.reject(new Error(`${port} port down`))
}

const ADOPTION_DOWN: AdoptionView<Principal, string> = {
  endpoints: () => down('adoption'),
  endpoint: () => down('adoption'),
}

const ELIGIBILITY_DOWN: UseEligibility<Principal> = { check: () => down('eligibility') }

function adoptionDownAt(w: World, which: Which): AdoptionView<Principal, string> {
  const asked = picker(which)
  return {
    endpoints: (access, scope) => w.adoption.endpoints(access, scope),
    endpoint: (access, endpoint) =>
      asked.next() ? down('adoption') : w.adoption.endpoint(access, endpoint),
  }
}

describe('a read port that rejects is read as unknown', () => {
  it('adoption rejecting at the gate: inspect, list, refresh and release answer unknown, nothing connects', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const c = core({ ...w, ports: { ...w.ports, adoption: ADOPTION_DOWN } })
    expect(await c.status.inspect(alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(await c.status.list(alice, 'ws')).toEqual({ failure: 'unknown' })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(await c.connections.release(alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('eligibility rejecting at the gate: inspect and refresh answer unknown', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const c = core({ ...w, ports: { ...w.ports, eligibility: ELIGIBILITY_DOWN } })
    expect(await c.status.inspect(alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('adoption rejecting at the re-read before a build: refresh answers unknown and builds nothing', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const c = core({ ...w, ports: { ...w.ports, adoption: adoptionDownAt(w, only(2)) } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.eligibility.calls()).toBe(1)
    expect(w.transports.calls).toHaveLength(0)
    expect(w.landing.processes()).toEqual([])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
  })

  it('the store rejecting at the marking of a connection failure: the catalog is unavailable, refresh answers unknown', async () => {
    const w = world({
      script: [{ discover: { kind: 'not-sent', cause: 'connection-unavailable' } }],
    })
    adoptStdio(w, files)
    const store = { read: () => down('store'), write: () => down('store') }
    const c = core({ ...w, ports: { ...w.ports, store } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
  })

  it('the store rejecting at the read before the listing: refresh answers unknown and lists nothing', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const store = { read: () => down('store'), write: w.store.write }
    const c = core({ ...w, ports: { ...w.ports, store } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.transports.calls.filter(call => call.kind === 'listActions')).toHaveLength(0)
    expect(await c.discovery.current(alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('the store rejecting at the write: refresh answers unknown', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const store = { read: w.store.read, write: () => down('store') }
    const c = core({ ...w, ports: { ...w.ports, store } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
  })
})

describe('a port that throws when it is called answers as one that rejects', () => {
  const WITH_CREDENTIAL = {
    auth: 'static',
    env: [{ name: 'TOKEN', source: 'credential' }],
  } as const

  function thrower(port: string): () => never {
    return () => {
      throw new Error(`${port} threw`)
    }
  }

  it('adoption throwing at the gate: inspect and refresh answer unknown, nothing connects', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const adoption = { endpoints: thrower('adoption'), endpoint: thrower('adoption') }
    const c = core({ ...w, ports: { ...w.ports, adoption } })
    expect(await c.status.inspect(alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.transports.calls).toHaveLength(0)
  })

  it('the landing throwing: refresh answers landing-unavailable and the handle is released once', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const c = core({ ...w, ports: { ...w.ports, landing: { start: thrower('landing') } } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'landing-unavailable' },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('the transport factory throwing: refresh answers connection-unavailable and the process is stopped', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const c = core({ ...w, ports: { ...w.ports, transports: { open: thrower('open') } } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(w.trace).toEqual(['process.stop', 'credential.release'])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })
})
