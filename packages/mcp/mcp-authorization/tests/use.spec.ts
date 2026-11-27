import { describe, expect, it } from 'vitest'
import { RESOURCE, connected, issued, keyOf, never, refused, world } from './fixture.ts'

async function bearerOf(w: ReturnType<typeof world>, signal = never) {
  const handle = await w.authorization.acquire(keyOf(), RESOURCE, signal)
  if (!('ok' in handle)) return handle
  const headers = new Headers()
  await handle.ok.authorize(headers)
  return { ok: headers.get('authorization'), handle: handle.ok }
}

describe('using a grant (C204)', () => {
  it('a token in time is used as it is; near its expiry it is refreshed first, with the refresh material and the resource', async () => {
    const w = world()
    await connected(w)
    expect(await bearerOf(w)).toMatchObject({ ok: 'Bearer at-1' })
    expect(w.server.tokenRequests()).toHaveLength(1)
    w.advance(3600_000 - 60_000)
    w.server.answer(issued('at-2', 'rt-2'))
    expect(await bearerOf(w)).toMatchObject({ ok: 'Bearer at-2' })
    expect(w.server.tokenRequests()[1]?.body).toMatchObject({
      kind: 'form',
      fields: {
        grant_type: 'refresh_token',
        refresh_token: 'rt-1',
        resource: RESOURCE,
        client_id: 'client-dyn',
      },
    })
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-2')
    expect(await w.records.read(keyOf())).toMatchObject({
      ok: { minted: 'refresh', revision: 2, state: 'valid' },
    })
  })

  it('requests that need a refresh at the same time send one refresh and all get its token (I10)', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    const gate = Promise.withResolvers<void>()
    w.server.answer(async () => {
      await gate.promise
      return issued('at-2', 'rt-2')
    })
    const all = Promise.all([bearerOf(w), bearerOf(w), bearerOf(w)])
    await new Promise(resolve => setTimeout(resolve, 10))
    gate.resolve()
    expect((await all).map(item => ('ok' in item ? item.ok : item))).toEqual([
      'Bearer at-2',
      'Bearer at-2',
      'Bearer at-2',
    ])
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('a refusal of the refresh asks for a new connection; the token is not used and nothing is deleted', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer(refused())
    expect(await bearerOf(w)).toEqual({ failure: 'rejected' })
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'reconnect' } })
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-1')
    expect(await bearerOf(w)).toEqual({ failure: 'rejected' })
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('a refresh with no answer keeps every value and the grant; this use is unknown, the next one tries again (P_UnknownKeeps)', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer('no-answer', issued('at-2', 'rt-2'))
    expect(await bearerOf(w)).toEqual({ failure: 'unknown' })
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'valid', revision: 1 } })
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBe('at-1')
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-1')
    expect(await bearerOf(w)).toMatchObject({ ok: 'Bearer at-2' })
  })

  it('a write that fails while adopting a refresh makes this use unknown and leaves the older values whole', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer(issued('at-2', 'rt-2'))
    w.secrets.failNext('refresh')
    expect(await bearerOf(w)).toEqual({ failure: 'unknown' })
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-1')
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBe('at-1')
    w.server.answer(issued('at-3', 'rt-3'))
    w.secrets.failNext('access')
    expect(await bearerOf(w)).toEqual({ failure: 'unknown' })
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-3')
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBe('at-1')
  })

  it('a waiter whose own bound passes answers unknown; the refresh goes on and the next use gets its token', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    const gate = Promise.withResolvers<void>()
    w.server.answer(async () => {
      await gate.promise
      return issued('at-2', 'rt-2')
    })
    const bound = new AbortController()
    const waiting = bearerOf(w, bound.signal)
    bound.abort()
    expect(await waiting).toEqual({ failure: 'unknown' })
    gate.resolve()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(await bearerOf(w)).toMatchObject({ ok: 'Bearer at-2' })
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('a 401 refreshes once; the token that refresh gave, refused again, asks for a new connection', async () => {
    const w = world()
    await connected(w)
    const first = await bearerOf(w)
    if (!('handle' in first)) throw new Error('no handle')
    w.server.answer(issued('at-2', 'rt-2'))
    await first.handle.reportRejection()
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'valid', minted: 'retry' } })
    const second = await bearerOf(w)
    if (!('handle' in second)) throw new Error('no handle')
    expect(second.ok).toBe('Bearer at-2')
    await first.handle.reportRejection()
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'valid' } })
    await second.handle.reportRejection()
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'reconnect' } })
    expect(w.server.tokenRequests()).toHaveLength(2)
  })

  it('insufficient scope asks for a new connection with the scopes asked before and now; the next connection asks for them', async () => {
    const w = world()
    await connected(w)
    expect(await w.authorization.requireScopes(keyOf(), ['write'])).toEqual({ ok: true })
    expect(await w.records.read(keyOf())).toMatchObject({
      ok: { state: 'reconnect', wanted: ['read', 'write'] },
    })
    expect(await bearerOf(w)).toEqual({ failure: 'rejected' })
    const begun = await w.authorization.begin({
      key: keyOf(),
      target: RESOURCE,
      redirectUri: 'http://127.0.0.1:7801/callback',
      initiator: 'alice',
      signal: never,
    })
    if (!('ok' in begun)) throw new Error(JSON.stringify(begun))
    expect(new URL(begun.ok.url).searchParams.get('scope')).toBe('read write')
  })

  it('a token goes only to a request for the resource it was granted for', async () => {
    const w = world()
    await connected(w)
    expect(await w.authorization.acquire(keyOf(), 'https://other.example/mcp', never)).toEqual({
      failure: 'rejected',
    })
  })

  it('disconnecting deletes both secrets and the facts; the grant is missing after it', async () => {
    const w = world()
    await connected(w)
    expect(await w.authorization.disconnect(keyOf())).toEqual({ ok: true })
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBeUndefined()
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBeUndefined()
    expect(await w.records.read(keyOf())).toEqual({ ok: 'absent' })
    expect(await bearerOf(w)).toEqual({ failure: 'missing' })
  })
})
