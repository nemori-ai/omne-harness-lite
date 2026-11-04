// Read ports in breach (SPEC decision 4): a port that rejects instead of answering an `Outcome`
// is read as `unknown` (adoption, eligibility) or `unavailable` (the store). The close-order
// ports that reject are in `teardown.spec.ts`; a transport or landing that rejects within the
// bound keeps the `failed()` wrap-up of `races.spec.ts` (N1).
import { describe, expect, it } from 'vitest'
import type { AdoptionView, UseEligibility } from '@omne-harness/mcp-contract/provider'
import { admit } from '../src/internal/gate.ts'
import { createConnectionTable } from '../src/internal/table.ts'
import { core } from './doubles/core.ts'
import type { Principal } from './doubles/values.ts'
import { alice, ref } from './doubles/values.ts'
import { adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = ref('files')

function down(port: string): Promise<never> {
  return Promise.reject(new Error(`${port} port down`))
}

const ADOPTION_DOWN: AdoptionView<Principal, string> = {
  endpoints: () => down('adoption'),
  endpoint: () => down('adoption'),
}

const ELIGIBILITY_DOWN: UseEligibility<Principal> = { check: () => down('eligibility') }

/** The adoption view whose `endpoint` answers `until` times, then rejects. */
function adoptionDownAfter(w: World, until: number): AdoptionView<Principal, string> {
  let count = 0
  return {
    endpoints: (access, scope) => w.adoption.endpoints(access, scope),
    endpoint(access, endpoint) {
      count += 1
      return count <= until ? w.adoption.endpoint(access, endpoint) : down('adoption')
    },
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

  it('adoption rejecting at the re-read before a build: ensure answers unknown and builds nothing', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const ports = { ...w.ports, adoption: adoptionDownAfter(w, 1) }
    const table = createConnectionTable(ports, w.config)
    const decision = await admit(ports, alice, files)
    if (decision.kind !== 'admitted') throw new Error('not admitted')
    expect(await table.ensure(decision.endpoint, alice)).toEqual({
      failure: { stage: 'settings', reason: { kind: 'unknown' } },
    })
    expect(w.transports.calls).toHaveLength(0)
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
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
