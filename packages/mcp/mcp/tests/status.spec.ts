// The status port (SPEC S1, S7): the credential in four states and never its value, use in two
// states, the connection state with its residual, and the same answer to a principal without
// access whether the endpoint exists or not.
import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { core } from './doubles/core.ts'
import { alice, bob, mallory, ref } from './doubles/values.ts'
import { INVALID, adoptHttp, adoptStdio, usualScript, world } from './doubles/world.ts'

const files = ref('files')
const nowhere = ref('nowhere')

describe('status.inspect', () => {
  it.each([
    ['not-required', (w: ReturnType<typeof world>) => adoptStdio(w, files)],
    ['present', (w: ReturnType<typeof world>) => adoptHttp(w, files)],
    [
      'absent',
      (w: ReturnType<typeof world>) =>
        adoptHttp(w, files, { settings: { credential: { kind: 'absent' } } }),
    ],
    [
      'invalid',
      (w: ReturnType<typeof world>) => adoptHttp(w, files, { settings: { credential: INVALID } }),
    ],
  ] as const)(
    'reports the credential as %s and nothing else about it',
    async (credential, adopt) => {
      const { w, status } = core(world())
      adopt(w)
      const view = await status.inspect(alice, files)
      expect(view).toEqual({
        ok: { ref: files, connection: { kind: 'none' }, credential, use: { kind: 'usable' } },
      })
      expect(JSON.stringify(view)).not.toContain('hunter2')
      expect(JSON.stringify(view)).not.toContain('main')
    },
  )

  it('reports use as blocked with the reason for an eligible principal a setting blocks', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    w.eligibility.block(alice, files, 'local-command-not-enabled')
    expect(await status.inspect(alice, files)).toEqual({
      ok: {
        ref: files,
        connection: { kind: 'none' },
        credential: 'not-required',
        use: { kind: 'blocked', reason: 'local-command-not-enabled' },
      },
    })
  })

  it('reports the connection as ready after a refresh, and opens nothing itself', async () => {
    const { w, status, discovery } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' } },
    })
    await discovery.refresh(alice, { ref: files })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
    expect(w.transports.calls.filter(call => call.kind === 'open')).toHaveLength(1)
  })

  it('reports lost with the residual a failed preparation left', async () => {
    const { w, status, discovery } = core(
      world({
        script: [{ discover: { kind: 'not-sent', cause: 'connection-unavailable' } }],
        stop: 'unconfirmed',
      }),
    )
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: {
        connection: {
          kind: 'lost',
          reason: 'preparation-failed',
          residual: [{ kind: 'process', confirmed: 'unconfirmed' }],
        },
      },
    })
  })

  it('answers not-available-to-you to a principal without eligibility', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    expect(await status.inspect(bob, files)).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('answers an outsider the same for an adopted and a missing endpoint', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    const forAdopted = await status.inspect(mallory, files)
    const forMissing = await status.inspect(mallory, nowhere)
    assert.deepStrictEqual(forAdopted, { failure: { kind: 'not-available-to-you' } })
    assert.deepStrictEqual(forMissing, forAdopted)
    const forBob = await status.inspect(bob, nowhere)
    assert.deepStrictEqual(forBob, forAdopted)
  })

  it('answers unknown when the adoption or the eligibility cannot be read', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    w.eligibility.setUnreadable(alice, files, true)
    expect(await status.inspect(alice, files)).toEqual({ failure: { kind: 'unknown' } })
    w.adoption.setUnreadable(true)
    expect(await status.inspect(alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('closes the connection of an endpoint that is now blocked (invariant 6)', async () => {
    const { w, status, discovery, table } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    await discovery.refresh(alice, { ref: files })
    w.eligibility.block(alice, files, 'disabled')
    expect(await status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'none' }, use: { kind: 'blocked', reason: 'disabled' } },
    })
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
    expect(w.trace).toEqual(['transport.close', 'process.stop'])
  })
})

describe('status.list', () => {
  it('lists the usable and the blocked endpoints of the scope, not the ones without eligibility', async () => {
    const { w, status } = core(world())
    const shell = ref('shell')
    const vault = ref('vault')
    const elsewhere = ref('elsewhere')
    adoptStdio(w, files)
    adoptStdio(w, shell)
    adoptHttp(w, vault)
    adoptStdio(w, elsewhere, { scope: 'other' })
    w.eligibility.block(alice, shell, 'local-command-not-enabled')
    w.eligibility.revoke(alice, vault)
    const listed = await status.list(alice, 'ws')
    expect(listed).toEqual({
      ok: [
        {
          ref: files,
          connection: { kind: 'none' },
          credential: 'not-required',
          use: { kind: 'usable' },
        },
        {
          ref: shell,
          connection: { kind: 'none' },
          credential: 'not-required',
          use: { kind: 'blocked', reason: 'local-command-not-enabled' },
        },
      ],
    })
    expect(await status.list(bob, 'ws')).toEqual({ ok: [] })
  })

  it('answers unknown for the whole list when any eligibility is unknown', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    adoptStdio(w, ref('shell'))
    w.eligibility.setUnreadable(alice, ref('shell'), true)
    expect(await status.list(alice, 'ws')).toEqual({ failure: 'unknown' })
  })

  it('answers unknown when the adoption cannot be read', async () => {
    const { w, status } = core(world())
    adoptStdio(w, files)
    w.adoption.setUnreadable(true)
    expect(await status.list(alice, 'ws')).toEqual({ failure: 'unknown' })
  })

  it('answers an empty list to an outsider, and opens nothing', async () => {
    const { w, status } = core(world({ script: usualScript() }))
    adoptStdio(w, files)
    expect(await status.list(mallory, 'ws')).toEqual({ ok: [] })
    expect(w.transports.calls).toHaveLength(0)
  })
})
