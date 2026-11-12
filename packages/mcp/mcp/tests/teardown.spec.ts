// The teardown of one entry (SPEC MC-10, MC-14): one entry point for the close order, every step
// runs when a port rejects, and the breach is absorbed as MC-14 says.
import { describe, expect, it } from 'vitest'
import { core } from './doubles/core.ts'
import { faulty, type Fault } from './doubles/faults.ts'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice } from './doubles/identities.ts'
import { adoptHttp, usualScript, world, type World } from './doubles/world.ts'

const files = endpointRefOf('files')
const WITH_CREDENTIAL = { auth: 'static' } as const

/** Every non-empty combination of the two steps that can reject. */
const COMBINATIONS: readonly (readonly Fault[])[] = [['close'], ['release'], ['close', 'release']]

function closes(w: World): number {
  return w.transports.calls.filter(call => call.kind === 'close').length
}

describe('teardown: every step runs, whichever port rejects (MC-14)', () => {
  it.each(COMBINATIONS.map(faults => [faults.join(' + '), faults] as const))(
    '%s rejecting: the transport is closed, the handle released once',
    async (_name, faults) => {
      const w = world({ script: usualScript() })
      adoptHttp(w, files, WITH_CREDENTIAL)
      const c = core({ ...w, ports: faulty(w, faults) })
      expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
        ok: { kind: 'published' },
      })
      const released = await c.connections.release(alice, files)
      expect(w.trace).toEqual(['transport.close', 'credential.release'])
      expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
      expect(released).toEqual({ ok: { kind: 'released' } })
      expect(await c.status.inspect(alice, files)).toMatchObject({
        ok: { connection: { kind: 'none' } },
      })
      expect(await c.connections.release(alice, files)).toEqual({
        ok: { kind: 'no-connection' },
      })
      // Whatever rejected: the transport was closed once and the handle released once.
      expect(closes(w)).toBe(1)
      expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    },
  )

  it('a close that rejects, then a new adoption revision: the old handle is released', async () => {
    const w = world({ script: [...usualScript(), ...usualScript()] })
    adoptHttp(w, files, WITH_CREDENTIAL)
    const c = core({ ...w, ports: faulty(w, ['close']) })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    w.adoption.update(alice.tenant, files, {})
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 0 },
    ])
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(await c.connections.closeAll()).toEqual([{ ref: files }])
    expect(w.credentials.handles()).toEqual([
      { acquired: 1, released: 1 },
      { acquired: 1, released: 1 },
    ])
  })
})
