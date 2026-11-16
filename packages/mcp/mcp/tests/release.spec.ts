import { describe, expect, it } from 'vitest'
import { core } from './doubles/core.ts'
import { endpointRefOf } from '@omne-harness/mcp-contract/testing'
import { alice, bob, mallory } from './doubles/identities.ts'
import { adoptHttp, usualScript, world } from './doubles/world.ts'

const files = endpointRefOf('files')

describe('connections.release', () => {
  it('closes the transport and reports released', async () => {
    const { w, discovery, connections, status } = core(world({ script: usualScript() }))
    adoptHttp(w, files, { auth: 'none' })
    await discovery.refresh(alice, { ref: files })
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'released' } })
    expect(w.trace).toEqual(['transport.close'])
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it('releases the HTTP credential handle exactly once', async () => {
    const { w, discovery, connections } = core(world({ script: usualScript() }))
    adoptHttp(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 0 }])
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'released' } })
    expect(w.credentials.handles()).toEqual([{ acquired: 1, released: 1 }])
    expect(w.trace).toEqual(['transport.close', 'credential.release'])
  })

  it('answers no-connection when nothing was connected', async () => {
    const { w, connections } = core(world())
    adoptHttp(w, files, { auth: 'none' })
    expect(await connections.release(alice, files)).toEqual({ ok: { kind: 'no-connection' } })
  })

  it('answers the gate refusal; a blocked endpoint is closed all the same', async () => {
    const { w, discovery, connections, status } = core(world({ script: usualScript() }))
    adoptHttp(w, files, { auth: 'none' })
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
    adoptHttp(w, files, { auth: 'none' })
    adoptHttp(w, shell)
    await discovery.refresh(alice, { ref: files })
    await discovery.refresh(alice, { ref: shell })
    const adoptionCalls = w.adoption.calls()
    const eligibilityCalls = w.eligibility.calls()
    expect(await connections.closeAll()).toEqual([{ ref: files }, { ref: shell }])
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
})
