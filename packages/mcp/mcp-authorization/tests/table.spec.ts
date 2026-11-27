import { describe, expect, it } from 'vitest'
import { ISSUER, RESOURCE, beginOn, connected, issued, keyOf, never, world } from './fixture.ts'

const use = async (w: ReturnType<typeof world>) => {
  const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
  if (!('ok' in handle)) return handle
  const headers = new Headers()
  await handle.ok.authorize(headers)
  return { ok: headers.get('authorization') }
}

describe('one grant, every state against every operation that reaches it (design 九)', () => {
  it('none: use is missing; disconnect changes nothing; begin makes it connecting', async () => {
    const w = world()
    expect(await use(w)).toEqual({ failure: 'missing' })
    expect(await w.authorization.disconnect(keyOf())).toEqual({ ok: true })
    expect(await w.records.read(keyOf())).toEqual({ ok: 'absent' })
    const { state } = await beginOn(w)
    expect(state).not.toBe('')
  })

  it('connecting: use is missing; a new begin voids the old pending; disconnect voids it too', async () => {
    const w = world()
    const first = await beginOn(w)
    expect(await use(w)).toEqual({ failure: 'missing' })
    const second = await beginOn(w)
    expect(await w.records.take(keyOf().tenant, first.state)).toEqual({ ok: 'absent' })
    expect(await w.authorization.disconnect(keyOf())).toEqual({ ok: true })
    expect(await w.records.take(keyOf().tenant, second.state)).toEqual({ ok: 'absent' })
    expect(w.server.tokenRequests()).toEqual([])
  })

  it('valid: a new connection keeps the old token in use until its callback replaces it', async () => {
    const w = world()
    await connected(w)
    const { state } = await beginOn(w)
    expect(await use(w)).toEqual({ ok: 'Bearer at-1' })
    w.server.answer(issued('at-9', 'rt-9'))
    expect(await w.authorization.callback({ state, code: 'code-9', iss: ISSUER }, never)).toBe(
      'connected',
    )
    expect(await use(w)).toEqual({ ok: 'Bearer at-9' })
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'valid', revision: 2 } })
  })

  it('reconnect: use is refused; a 401 changes nothing; a new connection makes it valid again without the old wanted scopes; disconnect deletes', async () => {
    const w = world()
    await connected(w)
    const held = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in held)) throw new Error('no handle')
    await w.authorization.requireScopes(keyOf(), ['write'])
    expect(await use(w)).toEqual({ failure: 'rejected' })
    await held.ok.reportRejection()
    expect(await w.records.read(keyOf())).toMatchObject({ ok: { state: 'reconnect', revision: 2 } })
    expect(w.server.tokenRequests()).toHaveLength(1)
    const { state } = await beginOn(w)
    w.server.answer(issued('at-2', 'rt-2'))
    expect(await w.authorization.callback({ state, code: 'c2', iss: ISSUER }, never)).toBe(
      'connected',
    )
    const facts = await w.records.read(keyOf())
    expect(facts).toMatchObject({ ok: { state: 'valid' } })
    expect('ok' in facts && facts.ok !== 'absent' ? facts.ok.wanted : 'none').toBeUndefined()
    expect(await w.authorization.disconnect(keyOf())).toEqual({ ok: true })
    expect(await use(w)).toEqual({ failure: 'missing' })
  })

  it('a storage that cannot answer makes use unknown, never missing or valid', async () => {
    const w = world()
    await connected(w)
    w.records.blind()
    expect(await use(w)).toEqual({ failure: 'unknown' })
    expect(await w.authorization.disconnect(keyOf())).toEqual({ failure: 'unavailable' })
  })
})

describe('how a grant stands (C201)', () => {
  it('none, then connecting while its callback is awaited here, then valid, then reconnect; storage that cannot answer says so', async () => {
    const w = world()
    expect(await w.authorization.standing(keyOf())).toEqual({
      ok: { grant: 'none', connecting: false },
    })
    const { state } = await beginOn(w)
    expect(await w.authorization.standing(keyOf())).toEqual({
      ok: { grant: 'none', connecting: true },
    })
    expect(await w.authorization.standing(keyOf('t'))).toEqual({
      ok: { grant: 'none', connecting: false },
    })
    w.server.answer(issued('at-1', 'rt-1'))
    await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)
    expect(await w.authorization.standing(keyOf())).toEqual({
      ok: { grant: 'valid', connecting: false },
    })
    await w.authorization.requireScopes(keyOf(), ['write'])
    expect(await w.authorization.standing(keyOf())).toEqual({
      ok: { grant: 'reconnect', connecting: false },
    })
    await beginOn(w)
    w.advance(600_000)
    expect(await w.authorization.standing(keyOf())).toEqual({
      ok: { grant: 'reconnect', connecting: false },
    })
    w.records.blind()
    expect(await w.authorization.standing(keyOf())).toEqual({ failure: 'unavailable' })
  })
})

describe('secrets never leave (MC-34, C205)', () => {
  it('no answer, failure or stored fact carries a token, refresh material, code or verifier', async () => {
    const w = world()
    const { state, begun } = await beginOn(w)
    const pending = await w.records.take(keyOf().tenant, state)
    if (!('ok' in pending) || pending.ok === 'absent') throw new Error('no pending')
    await w.records.begin(pending.ok)
    w.server.answer(issued('secret-access', 'secret-refresh'))
    const outcomes: unknown[] = [begun]
    outcomes.push(
      await w.authorization.callback({ state, code: 'secret-code', iss: ISSUER }, never),
    )
    w.advance(3600_000)
    w.server.answer({
      status: 400,
      json: { error: 'invalid_grant', error_description: 'secret-refresh is spent' },
    })
    outcomes.push(await w.authorization.acquire(keyOf(), RESOURCE, never))
    outcomes.push(await w.records.read(keyOf()))
    const text = JSON.stringify(outcomes)
    for (const secret of ['secret-access', 'secret-refresh', 'secret-code', pending.ok.verifier])
      expect(text, secret).not.toContain(secret)
  })
})
