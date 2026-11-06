// The connections port (SPEC S8, S9, group page "close()"): the close order, the report of the
// confirmed range only, the HTTP handle released with the close, and `closeAll` for the host.
import { describe, expect, it } from 'vitest'
import { core } from './doubles/core.ts'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice, bob, mallory } from './doubles/identities.ts'
import { adoptHttp, adoptStdio, usualScript, world } from './doubles/world.ts'

const files = endpointRefOf('files')

describe('connections.release', () => {
  it('closes the transport before it stops the process, and reports the confirmed range', async () => {
    const { w, discovery, connections, status } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(await connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'tree-confirmed' },
    })
    expect(w.trace).toEqual(['transport.close', 'process.stop'])
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it.each(['root-only', 'unconfirmed'] as const)(
    'reports %s and keeps the state lost (close-unconfirmed) with the residual',
    async stop => {
      const { w, discovery, connections, status } = core(world({ script: usualScript(), stop }))
      adoptStdio(w, files)
      await discovery.refresh(alice, { ref: files })
      expect(await connections.release(alice, files)).toEqual({
        ok: { kind: 'released', process: stop },
      })
      expect(await status.inspect(alice, files)).toMatchObject({
        ok: {
          connection: {
            kind: 'lost',
            reason: 'close-unconfirmed',
            residual: [{ kind: 'process', confirmed: stop }],
          },
        },
      })
      // A second release asks the process to stop again and reports what it confirms now.
      expect(await connections.release(alice, files)).toEqual({
        ok: { kind: 'released', process: stop },
      })
      expect(w.landing.processes()).toEqual([{ stops: 2 }])
    },
  )

  it('rebuilds after an unconfirmed close with the next generation and no residual', async () => {
    const { w, discovery, connections, status } = core(
      world({ script: [...usualScript(), ...usualScript()], stop: 'root-only' }),
    )
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    await connections.release(alice, files)
    expect(await discovery.refresh(alice, { ref: files })).toEqual({
      ok: { kind: 'published', revision: 2 },
    })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(await discovery.peer(alice, files)).toMatchObject({ ok: { generation: 2 } })
  })

  it('releases the HTTP credential handle exactly once, and reports no-process', async () => {
    const { w, discovery, connections } = core(world({ script: usualScript() }))
    adoptHttp(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    expect(await connections.release(alice, files)).toEqual({
      ok: { kind: 'released', process: 'no-process' },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.trace).toEqual(['transport.close', 'credential.release'])
  })

  it('releases the process credential handle once, after the process stopped', async () => {
    const { w, discovery, connections } = core(world({ script: usualScript() }))
    adoptStdio(w, files, { auth: 'static', env: [{ name: 'TOKEN', source: 'credential' }] })
    await discovery.refresh(alice, { ref: files })
    await connections.release(alice, files)
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.trace).toEqual(['transport.close', 'process.stop', 'credential.release'])
  })

  it('answers no-connection when nothing was connected', async () => {
    const { w, connections } = core(world())
    adoptStdio(w, files)
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it('answers the gate refusal; a blocked endpoint is closed all the same', async () => {
    const { w, discovery, connections, status } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    w.eligibility.block(alice, files, 'disabled')
    expect(await connections.release(alice, files)).toEqual({
      failure: { kind: 'blocked', reason: 'disabled' },
    })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(await connections.release(bob, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(await connections.release(mallory, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
  })
})

describe('connections.closeAll', () => {
  it('closes every connection without asking adoption or eligibility', async () => {
    const { w, discovery, connections, status } = core(
      world({ script: [...usualScript(), ...usualScript()] }),
    )
    const shell = endpointRefOf('shell')
    adoptStdio(w, files)
    adoptHttp(w, shell)
    await discovery.refresh(alice, { ref: files })
    await discovery.refresh(alice, { ref: shell })
    const adoptionCalls = w.adoption.calls()
    const eligibilityCalls = w.eligibility.calls()
    expect(await connections.closeAll()).toEqual([
      { ref: files, process: 'tree-confirmed' },
      { ref: shell, process: 'no-process' },
    ])
    expect(w.adoption.calls()).toBe(adoptionCalls)
    expect(w.eligibility.calls()).toBe(eligibilityCalls)
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(await status.inspect(alice, shell)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(await connections.closeAll()).toEqual([])
  })

  it('reports only the confirmed range', async () => {
    const { w, discovery, connections } = core(
      world({ script: usualScript(), stop: 'unconfirmed' }),
    )
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(await connections.closeAll()).toEqual([{ ref: files, process: 'unconfirmed' }])
    expect(await connections.closeAll()).toEqual([{ ref: files, process: 'unconfirmed' }])
  })
})
