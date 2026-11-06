// Interleavings across the publish boundary, the connection build and the close: a late result
// never acts on a connection it did not produce, every phase is bounded, and a close and an
// ensure of the same key both leave their connection with an owner. Steps are ordered with
// deferred promises; the only timers are the connection bounds under test.
import { describe, expect, it } from 'vitest'
import { connectionKeyOf } from '@omne-harness/mcp-contract'
import type { ListingPage, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { admit } from '../src/internal/gate.ts'
import { createConnectionTable } from '../src/internal/table.ts'
import { between, only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { core } from './doubles/core.ts'
import { deferred, settled } from './doubles/deferred.ts'
import {
  silentAdoption,
  stallingAdoption,
  stallingCredentials,
  stallingEligibility,
  stallingLanding,
} from './doubles/stalls.ts'
import { millisOf, peerIdentityOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import {
  VALUE,
  adoptHttp,
  adoptStdio,
  page,
  usualScript,
  world,
  type World,
} from './doubles/world.ts'

const files = endpointRefOf('files')
const peer = peerIdentityOf()
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
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
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
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
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

describe('a port that breaches its contract (MC-15, contract T9)', () => {
  it('a rejected discover answers effect-unknown (abandoned) and is torn down; the next ensure builds again', async () => {
    const broken = deferred<typeof peer>()
    const w = world({ script: [{ discover: broken }, ...usualScript()] })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const c = core(w)
    const first = c.discovery.refresh(alice, { ref: files })
    await settled()
    broken.reject(new Error('transport bug'))
    expect(await first).toEqual({ failure: { kind: 'effect-unknown', cause: 'abandoned' } })
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
    const nowhere = endpointRefOf('nowhere')
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

const NOT_SENT: TransportFailure = { kind: 'not-sent', cause: 'connection-unavailable' }

describe('lose shares the close (R3-1): one teardown per entry, in the close order', () => {
  it('a release during the teardown of a lost connection waits for it; the next refresh builds', async () => {
    const closing = deferred<'closed'>()
    const w = world({
      script: [{ discover: peer }, { listActions: NOT_SENT }, { close: closing }, ...usualScript()],
    })
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    const c = core(w)
    const losing = c.discovery.refresh(alice, { ref: files })
    await settled()
    // The transport is closing. Nothing else of the close order has happened yet.
    expect(w.transports.calls.filter(call => call.kind === 'close')).toHaveLength(1)
    expect(w.trace).toEqual([])
    let released = false
    const releasing = c.connections.release(alice, files).then(report => {
      released = true
      return report
    })
    await settled()
    expect(released).toBe(false)
    expect(w.trace).toEqual([])
    closing.resolve('closed')
    expect(await releasing).toEqual({ ok: { kind: 'released', process: 'tree-confirmed' } })
    expect(await losing).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(w.trace).toEqual(['transport.close', 'process.stop', 'credential.release'])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 1 },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 0 },
    ])
  })

  it('a refresh during the teardown of a lost connection waits for it, then builds', async () => {
    const closing = deferred<'closed'>()
    const w = world({
      script: [{ discover: peer }, { listActions: NOT_SENT }, { close: closing }, ...usualScript()],
    })
    adoptStdio(w, files)
    const c = core(w)
    const losing = c.discovery.refresh(alice, { ref: files })
    await settled()
    let answered = false
    const next = c.discovery.refresh(alice, { ref: files }).then(answer => {
      answered = true
      return answer
    })
    await settled()
    expect(answered).toBe(false)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    closing.resolve('closed')
    expect(await losing).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(await next).toEqual({ ok: { kind: 'published', revision: 1 } })
    expect(w.trace).toEqual(['transport.close', 'process.stop'])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
  })
})

describe('a process that lands after the bound (R3-2, S9)', () => {
  function stalledLanding(w: World) {
    const stalled = stallingLanding(w.landing)
    return { gate: stalled.gate, c: core({ ...w, ports: { ...w.ports, landing: stalled.port } }) }
  }

  it('is stopped on arrival; a stop that is not tree-confirmed is a residual that release and closeAll report', async () => {
    const w = world({ script: usualScript(), stop: 'unconfirmed' })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
    const { gate, c } = stalledLanding(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.status.inspect(alice, files)).toEqual({
      ok: {
        ref: files,
        connection: { kind: 'lost', reason: 'preparation-failed' },
        credential: 'not-required',
        use: { kind: 'usable' },
      },
    })
    gate.resolve()
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: {
        connection: {
          kind: 'lost',
          reason: 'preparation-failed',
          residual: [{ kind: 'process', confirmed: 'unconfirmed' }],
        },
      },
    })
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'unconfirmed' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 2 }])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: {
        connection: {
          kind: 'lost',
          reason: 'close-unconfirmed',
          residual: [{ kind: 'process', confirmed: 'unconfirmed' }],
        },
      },
    })
    expect(await c.connections.closeAll()).toEqual([{ ref: files, process: 'unconfirmed' }])
  })

  it('the process credential handle is released after the late stop() returned (S9)', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    const { gate, c } = stalledLanding(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    // No process yet, but one may still land with the handle in its environment: the handle waits.
    expect(w.trace).toEqual([])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    gate.resolve()
    await settled()
    expect(w.trace).toEqual(['process.stop', 'credential.release'])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
  })

  it('a landing that fails after the bound: no process, the handle released on the answer', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
      facilities: ['gpu'],
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    const { gate, c } = stalledLanding(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(w.trace).toEqual([])
    gate.resolve()
    await settled()
    expect(w.trace).toEqual(['credential.release'])
    expect(w.landing.processes()).toEqual([])
  })

  it('a landing that rejects after the bound: no process, the handle released, the entry forgotten', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      auth: 'static',
      env: [{ name: 'TOKEN', source: 'credential' }],
      settings: { connectTimeout: VALUE(millisOf(50)) },
    })
    const stalled = stallingLanding({ start: () => Promise.reject(new Error('landing bug')) })
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'unconfirmed' },
    })
    stalled.gate.resolve()
    await settled()
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(await c.connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it('a credential handle that arrives after the bound is released; a release that rejects is dropped, not unhandled', async () => {
    const w = world({ script: usualScript() })
    adoptHttp(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
    const stalled = stallingCredentials(w.ports.credentials, handle => ({
      ...handle,
      release: () => Promise.reject(new Error('release failed')),
    }))
    const c = core({ ...w, ports: { ...w.ports, credentials: stalled.port } })
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
        failure: { kind: 'connection-unavailable' },
      })
      stalled.gate.resolve()
      await settled()
      await settled()
      expect(stalled.releases()).toBe(1)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})

describe('the adoption read again in the critical section is bounded (decision 22)', () => {
  it('a re-read that never answers: connection-unavailable at the bound, and the next ensure of the holding answers within its own bound', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
    // Calls 1 and 2 are the gates of the two refreshes; calls 3 and 4, the re-reads of the
    // critical section, never answer.
    const silent = silentAdoption(w.ports.adoption, between(3, 4))
    const c = core({ ...w, ports: { ...w.ports, adoption: silent.port } })
    const [first, second] = await Promise.all([
      c.discovery.refresh(alice, { ref: files }),
      c.discovery.refresh(alice, { ref: files }),
    ])
    const refused = { failure: { kind: 'connection-unavailable' } }
    expect(first).toEqual(refused)
    expect(second).toEqual(refused)
    expect(silent.calls()).toBe(4)
    expect(w.transports.calls).toHaveLength(0)
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
  })
})

describe('a teardown that does not answer holds no ensure past its bound (decision 22)', () => {
  const REFUSED = { failure: { kind: 'connection-unavailable' } }

  it('the close of an earlier revision hangs: two refreshes of the new revision answer connection-unavailable, then the close ends on its own', async () => {
    const closing = deferred<'closed'>()
    const w = world({ script: [...usualScript(), { close: closing }, ...usualScript()] })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
    const c = core(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const [one, two] = await Promise.all([
      c.discovery.refresh(alice, { ref: files }),
      c.discovery.refresh(alice, { ref: files }),
    ])
    expect(one).toEqual(REFUSED)
    expect(two).toEqual(REFUSED)
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    closing.resolve('closed')
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
  }, 2000)

  it('a release of the same key still closing the transport: a refresh answers connection-unavailable within its bound', async () => {
    const closing = deferred<'closed'>()
    const w = world({ script: [...usualScript(), { close: closing }, ...usualScript()] })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
    const c = core(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const released = c.connections.release(alice, files)
    await settled()
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual(REFUSED)
    closing.resolve('closed')
    expect(await released).toEqual({ ok: { kind: 'released', process: 'tree-confirmed' } })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
  }, 2000)
})

describe('two tokens of two revisions at the re-read (observation)', () => {
  it('leaves one entry, on the newer revision; the older build is closed, the newer one is not', async () => {
    const w = world({ script: [{ discover: peer }, { discover: peer }] })
    adoptStdio(w, files)
    // Call 1 is the gate for the old token; call 2 is the re-read of its ensure, answered at once
    // (revision 1) but delivered after the adoption moved on and a newer token asked.
    const stalled = stallingAdoption(w.ports.adoption, 2)
    const ports = { ...w.ports, adoption: stalled.port }
    const table = createConnectionTable(ports, w.config)
    const old = await admit(ports, alice, files)
    if (old.kind !== 'admitted') throw new Error('not admitted')
    const first = table.ensure(old.endpoint, alice)
    await settled()
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const current = await admit(ports, alice, files)
    if (current.kind !== 'admitted') throw new Error('not admitted')
    const second = table.ensure(current.endpoint, alice)
    await settled()
    stalled.gate.resolve()
    const [a, b] = await Promise.all([first, second])
    if (!('ok' in b)) throw new Error('the newer token did not connect')
    expect(b.ok.connection.isCurrent(b.ok.generation)).toBe(true)
    if ('ok' in a) expect(a.ok.connection.isCurrent(a.ok.generation)).toBe(false)
    const anonymous = { kind: 'anonymous' as const }
    expect(table.current(connectionKeyOf(alice.tenant, current.endpoint, anonymous))).toBeDefined()
    expect(table.current(connectionKeyOf(alice.tenant, old.endpoint, anonymous))).toBeUndefined()
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'ready' })
    expect(await table.closeAll()).toHaveLength(1)
  })
})

describe('each ensure waits at most to its own bounds (SPEC P8 T2)', () => {
  const REFUSED = { failure: { kind: 'connection-unavailable' } }

  it('a call queued behind one that holds the critical section answers at its own bound, and asks no port after', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    // Calls 1 and 2 are the gates of the two refreshes; call 3, the re-read of the first in the
    // critical section, never answers.
    const silent = silentAdoption(w.ports.adoption, between(3, 4))
    const bounds = manualBounds()
    const c = core({ ...w, ports: { ...w.ports, adoption: silent.port } }, bounds.runtime)
    const first = c.discovery.refresh(alice, { ref: files })
    const second = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(silent.calls()).toBe(3)
    bounds.fire('section', 1)
    expect(await second).toEqual(REFUSED)
    bounds.fire('section', 0)
    expect(await first).toEqual(REFUSED)
    await settled()
    expect(silent.calls()).toBe(3)
    expect(w.transports.calls).toHaveLength(0)
  })

  it('a call that joins the build of another answers at its own bound; the build goes on for the call that began it', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const stalled = stallingLanding(w.landing)
    const bounds = manualBounds()
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } }, bounds.runtime)
    const first = c.discovery.refresh(alice, { ref: files })
    await settled()
    const second = c.discovery.refresh(alice, { ref: files })
    await settled()
    bounds.fire('join')
    expect(await second).toEqual(REFUSED)
    expect(stalled.calls()).toBe(1)
    stalled.gate.resolve()
    expect(await first).toMatchObject({ ok: { kind: 'published' } })
  })

  it('at the table, a call queued past its section bound answers at the settings stage', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    // Call 1 is the gate; call 2, the re-read of the first ensure in the critical section, never
    // answers.
    const silent = silentAdoption(w.ports.adoption, only(2))
    const bounds = manualBounds()
    const ports = { ...w.ports, adoption: silent.port }
    const table = createConnectionTable(ports, w.config, bounds.runtime)
    const admitted = await admit(ports, alice, files)
    if (admitted.kind !== 'admitted') throw new Error('not admitted')
    const first = table.ensure(admitted.endpoint, alice)
    const second = table.ensure(admitted.endpoint, alice)
    await settled()
    const refused = { failure: { stage: 'settings', reason: { kind: 'connection-unavailable' } } }
    bounds.fire('section', 1)
    expect(await second).toEqual(refused)
    bounds.fire('section', 0)
    expect(await first).toEqual(refused)
  })

  it('at the table, a call that joins past its own bound answers at the connect stage with the mark pending', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files)
    const stalled = stallingLanding(w.landing)
    const bounds = manualBounds()
    const ports = { ...w.ports, landing: stalled.port }
    const table = createConnectionTable(ports, w.config, bounds.runtime)
    const admitted = await admit(ports, alice, files)
    if (admitted.kind !== 'admitted') throw new Error('not admitted')
    const first = table.ensure(admitted.endpoint, alice)
    await settled()
    const second = table.ensure(admitted.endpoint, alice)
    await settled()
    bounds.fire('join')
    expect(await second).toEqual({
      failure: { stage: 'connect', reason: { kind: 'connection-unavailable' }, catalog: 'pending' },
    })
    stalled.gate.resolve()
    expect('ok' in (await first)).toBe(true)
    await table.closeAll()
  })

  it('a refresh stops reading pages at its listing bound: the cut-off page has no answer', async () => {
    const w = world({
      script: [{ discover: peerIdentityOf() }, { listActions: deferred<ListingPage>() }],
    })
    adoptStdio(w, files)
    const bounds = manualBounds()
    const c = core(w, bounds.runtime)
    const refreshing = c.discovery.refresh(alice, { ref: files })
    await settled()
    bounds.fire('listing')
    expect(await refreshing).toEqual({
      ok: { kind: 'kept', reason: { kind: 'listing-incomplete', defect: 'page-failed' } },
    })
  })
})
