// The teardown of one entry (SPEC MC-10, decision 21): one entry point for the close order,
// every step runs when a port rejects, and the breach is absorbed as decision 4 says. Also the
// landing still in flight at a release and at the shutdown (decisions 5 and 6).
import { describe, expect, it } from 'vitest'
import { core } from './doubles/core.ts'
import { settled } from './doubles/deferred.ts'
import { faulty, type Fault } from './doubles/faults.ts'
import { stallingLanding } from './doubles/stalls.ts'
import { alice, millis, ref } from './doubles/values.ts'
import { VALUE, adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = ref('files')
const WITH_CREDENTIAL = {
  auth: 'static',
  env: [{ name: 'TOKEN', source: 'credential' }],
} as const

/** Every non-empty combination of the three steps that can reject. */
const COMBINATIONS: readonly (readonly Fault[])[] = [
  ['close'],
  ['stop'],
  ['release'],
  ['close', 'stop'],
  ['close', 'release'],
  ['stop', 'release'],
  ['close', 'stop', 'release'],
]

function closes(w: World): number {
  return w.transports.calls.filter(call => call.kind === 'close').length
}

describe('teardown: every step runs, whichever port rejects (decision 21)', () => {
  it.each(COMBINATIONS.map(faults => [faults.join(' + '), faults] as const))(
    '%s rejecting: the transport is closed, the process stopped, the handle released once',
    async (_name, faults) => {
      const w = world({ script: usualScript() })
      adoptStdio(w, files, WITH_CREDENTIAL)
      const c = core({ ...w, ports: faulty(w, faults) })
      expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
        ok: { kind: 'published' },
      })
      const released = await c.connections.release(alice, files)
      expect(w.trace).toEqual(['transport.close', 'process.stop', 'credential.release'])
      expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
      if (faults.includes('stop')) {
        // A stop that rejected confirmed nothing: the process stays, to be stopped again.
        expect(released).toEqual({ ok: { kind: 'released', process: 'unconfirmed' } })
        expect(await c.status.inspect(alice, files)).toMatchObject({
          ok: {
            connection: {
              kind: 'lost',
              reason: 'close-unconfirmed',
              residual: [{ kind: 'process', confirmed: 'unconfirmed' }],
            },
          },
        })
        expect(await c.connections.release(alice, files)).toEqual({
          ok: { kind: 'released', process: 'unconfirmed' },
        })
        expect(w.landing.processes()).toEqual([{ stops: 2 }])
      } else {
        expect(released).toEqual({ ok: { kind: 'released', process: 'tree-confirmed' } })
        expect(await c.status.inspect(alice, files)).toMatchObject({
          ok: { connection: { kind: 'none' } },
        })
        expect(await c.connections.release(alice, files)).toEqual({
          ok: { kind: 'no-connection' },
        })
        expect(w.landing.processes()).toEqual([{ stops: 1 }])
      }
      // Whatever rejected: the transport was closed once and the handle released once.
      expect(closes(w)).toBe(1)
      expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    },
  )

  it('a close that rejects, then a new adoption revision: the old process is stopped and its handle released', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptStdio(w, files, WITH_CREDENTIAL)
    const c = core({ ...w, ports: faulty(w, ['close']) })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 0 }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 0 },
    ])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(await c.connections.closeAll()).toEqual([{ ref: files, process: 'tree-confirmed' }])
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 1 }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 1 },
    ])
  })
})

describe('a landing still in flight at the close (decisions 5, 6)', () => {
  function stalledLanding(w: World) {
    const stalled = stallingLanding(w.landing)
    return { stalled, c: core({ ...w, ports: { ...w.ports, landing: stalled.port } }) }
  }

  it('release and closeAll report unconfirmed, not no-process; after closeAll nothing connects', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millis(50)) } })
    const { stalled, c } = stalledLanding(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'unconfirmed' },
    })
    expect(await c.connections.closeAll()).toEqual([{ ref: files, process: 'unconfirmed' }])
    const opens = w.transports.calls.filter(call => call.kind === 'open').length
    const starts = stalled.calls()
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(opens)
    expect(stalled.calls()).toBe(starts)
  })

  it('closeAll releases the process credential handle at once; the process that lands later is stopped once, the handle not released again', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, {
      ...WITH_CREDENTIAL,
      settings: { connectTimeout: VALUE(millis(50)) },
    })
    const { stalled, c } = stalledLanding(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    expect(await c.connections.closeAll()).toEqual([{ ref: files, process: 'unconfirmed' }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.trace).toEqual(['credential.release'])
    stalled.gate.resolve()
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.trace).toEqual(['credential.release', 'process.stop'])
  })
})
