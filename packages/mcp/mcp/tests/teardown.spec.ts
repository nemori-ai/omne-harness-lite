import { describe, expect, it } from 'vitest'
import { only } from './doubles/calls.ts'
import { manualBounds } from './doubles/bounds.ts'
import { core, type Core } from './doubles/core.ts'
import { deferred, settled, type Deferred } from './doubles/deferred.ts'
import { faulty, landingStoppingAs, type Fault, type StopAnswer } from './doubles/faults.ts'
import { stallingLanding, stallingReleases, stallingStops } from './doubles/stalls.ts'
import { millisOf, endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { VALUE, adoptStdio, usualScript, world, type World } from './doubles/world.ts'

const files = endpointRefOf('files')
const WITH_CREDENTIAL = {
  auth: 'static',
  env: [{ name: 'TOKEN', source: 'credential' }],
} as const

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

describe('teardown: every step runs, whichever port rejects (MC-14)', () => {
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

describe('every process is asked to stop, whichever stop rejects (MC-14)', () => {
  const CLOSES = [
    [
      'release',
      (c: Core) => c.connections.release(alice, files),
      { ok: { kind: 'released', process: 'unconfirmed' } },
    ],
    ['closeAll', (c: Core) => c.connections.closeAll(), [{ ref: files, process: 'unconfirmed' }]],
  ] as const

  it.each(CLOSES)(
    '%s: the own process rejects its stop, the lingering one is still asked',
    async (_name, close, report) => {
      const w = world({ script: [...usualScript(), ...usualScript()] })
      adoptStdio(w, files, WITH_CREDENTIAL)
      const answers: StopAnswer[] = ['root-only']
      const c = core({
        ...w,
        ports: { ...w.ports, landing: landingStoppingAs(w.landing, index => answers[index]) },
      })
      expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
        ok: { kind: 'published' },
      })
      expect(await c.connections.release(alice, files)).toEqual({
        ok: { kind: 'released', process: 'root-only' },
      })
      expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
        ok: { kind: 'published' },
      })
      expect(w.landing.processes()).toEqual([{ stops: 2 }, { stops: 0 }])
      answers[1] = 'reject'
      expect(await close(c)).toEqual(report)
      expect(w.landing.processes()).toEqual([{ stops: 3 }, { stops: 1 }])
      expect(w.credentials.handles()).toEqual([
        { acquired: 1, released: 1 },
        { acquired: 1, released: 1 },
      ])
    },
  )

  it("a process an earlier adoption revision left lingering is asked again by the new revision's entry", async () => {
    const w = world({ script: [...usualScript(), ...usualScript()], stop: 'root-only' })
    adoptStdio(w, files)
    const c = core(w)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 2 }, { stops: 0 }])
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'root-only' },
    })
    expect(w.landing.processes()).toEqual([{ stops: 3 }, { stops: 1 }])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: {
        connection: {
          kind: 'lost',
          reason: 'close-unconfirmed',
          residual: [
            { kind: 'process', confirmed: 'root-only' },
            { kind: 'process', confirmed: 'root-only' },
          ],
        },
      },
    })
  })
})

describe('the entry stays while its teardown waits on a port (MC-14)', () => {
  const SHORT = { settings: { connectTimeout: VALUE(millisOf(50)) } }
  const RELEASED = { ok: { kind: 'released', process: 'tree-confirmed' } }

  async function releaseWhileALandingAnswers(c: Core, landing: Deferred<void>) {
    expect(await c.discovery.refresh(alice, { ref: files })).toEqual({
      failure: { kind: 'connection-unavailable' },
    })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const first = c.connections.release(alice, files)
    await settled()
    landing.resolve()
    await settled()
    const second = c.connections.release(alice, files)
    let answered = false
    void second.then(() => {
      answered = true
    })
    await settled()
    return { first, second, answered: () => answered }
  }

  it('a landing that answers while the process is still stopping: the entry stays, a second release joins the first', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, SHORT)
    const stopping = stallingStops(w.landing, only(1))
    const stalled = stallingLanding(stopping.port, only(1))
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } })
    const { first, second, answered } = await releaseWhileALandingAnswers(c, stalled.gate)
    expect(w.landing.processes()).toEqual([{ stops: 0 }, { stops: 1 }])
    expect(answered()).toBe(false)
    stopping.gate.resolve()
    expect(await first).toEqual(RELEASED)
    expect(await second).toEqual(RELEASED)
    expect(await c.connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it('a landing that answers while the handle is still being released: the entry stays, a second release joins the first', async () => {
    const w = world({ script: usualScript() })
    adoptStdio(w, files, { ...WITH_CREDENTIAL, ...SHORT })
    const releasing = stallingReleases(w.credentials, only(2))
    const stalled = stallingLanding(w.landing, only(1))
    const c = core({
      ...w,
      ports: { ...w.ports, landing: stalled.port, credentials: releasing.port },
    })
    const { first, second, answered } = await releaseWhileALandingAnswers(c, stalled.gate)
    expect(w.landing.processes()).toEqual([{ stops: 1 }, { stops: 1 }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 0 },
    ])
    expect(answered()).toBe(false)
    releasing.gate.resolve()
    expect(await first).toEqual(RELEASED)
    expect(await second).toEqual(RELEASED)
    expect(await c.connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
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
    adoptStdio(w, files, { settings: { connectTimeout: VALUE(millisOf(50)) } })
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
      settings: { connectTimeout: VALUE(millisOf(50)) },
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

describe('the stop of what the key left behind is part of the build and under its bound (MC-5)', () => {
  it('a stop that hangs when the connection is rebuilt: the bound ends the build as preparation-failed, nothing is started, the process stays lingering', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()], stop: 'root-only' })
    adoptStdio(w, files)
    const gate = deferred<void>()
    let stops = 0
    const landing: typeof w.landing = {
      ...w.landing,
      async start(access, launch, env) {
        const answer = await w.landing.start(access, launch, env)
        if ('failure' in answer) return answer
        const process = answer.ok
        return {
          ok: {
            ...process,
            async stop() {
              stops += 1
              if (stops === 2) await gate.promise
              return process.stop()
            },
          },
        }
      },
    }
    const bounds = manualBounds()
    const c = core({ ...w, ports: { ...w.ports, landing } }, bounds.runtime)
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(await c.connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'root-only' },
    })
    const rebuilt = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stops).toBe(2)
    bounds.fire('build', 1)
    expect(await rebuilt).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(w.landing.processes()).toEqual([{ stops: 1 }])
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
    expect(c.table.stateOf(alice.tenant, files.holding)).toEqual({
      kind: 'lost',
      reason: 'preparation-failed',
      residual: [{ kind: 'process', confirmed: 'root-only' }],
    })
    gate.resolve()
    await settled()
  })
})

describe('the state of a holding reads its connection that takes requests (S7)', () => {
  it('an older closed entry that still holds a process, listed before the ready one, does not decide the state', async () => {
    const w = world({ script: usualScript(), stop: 'unconfirmed' })
    adoptStdio(w, files)
    const stalled = stallingLanding(w.landing, only(1))
    const bounds = manualBounds()
    const c = core({ ...w, ports: { ...w.ports, landing: stalled.port } }, bounds.runtime)
    const first = c.discovery.refresh(alice, { ref: files })
    await settled()
    expect(stalled.calls()).toBe(1)
    w.adoption.update(alice.tenant, files, { processEnv: [{ name: 'X', value: '1' }] })
    const second = c.discovery.refresh(alice, { ref: files })
    await settled()
    bounds.fire('build', 0)
    expect(await first).toEqual({ failure: { kind: 'connection-unavailable' } })
    expect(await second).toMatchObject({ ok: { kind: 'published' } })
    stalled.gate.resolve()
    await settled()
    expect(w.landing.processes()).toEqual([{ stops: 0 }, { stops: 1 }])
    expect(c.table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'ready' })
  })
})
