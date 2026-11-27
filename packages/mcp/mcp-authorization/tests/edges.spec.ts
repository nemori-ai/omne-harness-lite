import { describe, expect, it } from 'vitest'
import { judgeCallback, readServerMetadata, readTokenAnswer } from '@omne-harness/mcp-authorization'
import { samplePending } from '@omne-harness/mcp-contract/testing'
import {
  ISSUER,
  REDIRECT,
  RESOURCE,
  beginOn,
  connected,
  issued,
  keyOf,
  never,
  serverMetadata,
  world,
} from './fixture.ts'

const use = async (w: ReturnType<typeof world>, key = keyOf()) => {
  const handle = await w.authorization.acquire(key, RESOURCE, never)
  if (!('ok' in handle)) return handle
  const headers = new Headers()
  return {
    ok: {
      authorized: await handle.ok.authorize(headers),
      header: headers.get('authorization'),
      purpose: handle.ok.purpose,
    },
  }
}

describe('what the answers and the metadata carry, exactly', () => {
  it('a token answer carries only the members the server sent; a success that is not 200 or has no token type is not known', () => {
    expect(
      readTokenAnswer({ ok: { status: 200, json: { access_token: 'a', token_type: 'Bearer' } } }),
    ).toStrictEqual({
      kind: 'issued',
      access: 'a',
    })
    expect(
      readTokenAnswer({ ok: { status: 201, json: { access_token: 'a', token_type: 'Bearer' } } }),
    ).toStrictEqual({ kind: 'unknown' })
    expect(readTokenAnswer({ ok: { status: 200, json: { access_token: 'a' } } })).toStrictEqual({
      kind: 'unknown',
    })
    expect(judgeCallback(samplePending(keyOf(), 's'), { code: '', iss: ISSUER }, 0)).toStrictEqual({
      kind: 'rejected',
      reason: 'malformed',
    })
  })

  it('server metadata keeps what it read and nothing it did not; a missing authorization endpoint is malformed; an unsafe registration endpoint is refused', () => {
    const withoutRegistration = serverMetadata({
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ['none'],
    })
    delete withoutRegistration['registration_endpoint']
    expect(readServerMetadata(ISSUER, withoutRegistration)).toStrictEqual({
      ok: {
        issuer: ISSUER,
        authorizationEndpoint: `${ISSUER}/authorize`,
        tokenEndpoint: `${ISSUER}/token`,
        metadataDocuments: true,
        issRequired: true,
        scopesSupported: ['read', 'write'],
        authMethods: ['none'],
      },
    })
    const noAuthorization = serverMetadata()
    delete noAuthorization['authorization_endpoint']
    expect(readServerMetadata(ISSUER, noAuthorization)).toStrictEqual({ failure: 'malformed' })
    expect(
      readServerMetadata(
        ISSUER,
        serverMetadata({ registration_endpoint: 'http://auth.example/register' }),
      ),
    ).toStrictEqual({
      failure: 'insecure-endpoint',
    })
  })
})

describe('a grant at the edges', () => {
  it('two grants refresh each on its own, at the same time', async () => {
    const w = world()
    const other = keyOf('t')
    await connected(w, keyOf(), 'at-1', 'rt-1')
    await connected(w, other, 'at-a', 'rt-a')
    w.advance(3600_000)
    const gate = Promise.withResolvers<void>()
    const held = async (answer: ReturnType<typeof issued>) => {
      await gate.promise
      return answer
    }
    w.server.answer(
      () => held(issued('at-2', 'rt-2')),
      () => held(issued('at-b', 'rt-b')),
    )
    const both = Promise.all([use(w), use(w, other)])
    await new Promise(resolve => setTimeout(resolve, 10))
    gate.resolve()
    const [mine, theirs] = await both
    expect([mine, theirs].map(item => ('ok' in item ? item.ok.header : item))).toEqual([
      'Bearer at-2',
      'Bearer at-b',
    ])
    expect(w.server.tokenRequests()).toHaveLength(4)
  })

  it('a waiter whose bound passes while the refresh is out answers unknown at once', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer(() => new Promise(() => undefined))
    const bound = new AbortController()
    const waiting = w.authorization.acquire(keyOf(), RESOURCE, bound.signal)
    await new Promise(resolve => setTimeout(resolve, 10))
    bound.abort()
    expect(await waiting).toStrictEqual({ failure: 'unknown' })
  })

  it('a grant without refresh material or expiry: the token is used as long as it is held; a 401 on it asks for a new connection', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.server.answer({ status: 200, json: { access_token: 'at-1', token_type: 'Bearer' } })
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe(
      'connected',
    )
    w.advance(100 * 3600_000)
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error(JSON.stringify(handle))
    expect(await use(w)).toStrictEqual({
      ok: { authorized: { ok: true }, header: 'Bearer at-1', purpose: 'http-authorization' },
    })
    await w.records.write(
      keyOf(),
      { ...(await factsOf(w)), expiresAt: w.now() - 1, revision: 2 },
      1,
    )
    expect(await use(w)).toMatchObject({ ok: { header: 'Bearer at-1' } })
    expect(w.server.tokenRequests()).toHaveLength(1)
    await handle.ok.reportRejection()
    expect(await factsOf(w)).toMatchObject({ state: 'reconnect' })
    expect(w.server.tokenRequests()).toHaveLength(1)
  })

  it('a refresh that sends no new refresh material keeps the old one; one with a scope takes it, one without keeps the old scopes', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer({
      status: 200,
      json: { access_token: 'at-2', token_type: 'Bearer', expires_in: 60 },
    })
    expect(await use(w)).toMatchObject({ ok: { header: 'Bearer at-2' } })
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-1')
    expect(await factsOf(w)).toMatchObject({ scopes: ['read'] })
    w.advance(60_000)
    w.server.answer(issued('at-3', 'rt-3', 3600, 'read write'))
    expect(await use(w)).toMatchObject({ ok: { header: 'Bearer at-3' } })
    expect(await factsOf(w)).toMatchObject({ scopes: ['read', 'write'] })
  })

  it('a refusal stores the grant as reconnect and adds nothing else', async () => {
    const w = world()
    await connected(w)
    const before = await factsOf(w)
    w.advance(3600_000)
    w.server.answer({ status: 400, json: { error: 'invalid_grant' } })
    expect(await use(w)).toStrictEqual({ failure: 'rejected' })
    expect(await factsOf(w)).toStrictEqual({ ...before, state: 'reconnect', revision: 2 })
  })

  it('secrets that cannot be read make use unknown; the access token alone gone means the grant cannot be used', async () => {
    const w = world()
    await connected(w)
    await w.secrets.remove({ kind: 'access', key: keyOf() })
    await w.secrets.remove({ kind: 'refresh', key: keyOf() })
    expect(await use(w)).toStrictEqual({ failure: 'missing' })
    w.secrets.cut()
    expect(await use(w)).toStrictEqual({ failure: 'unknown' })
  })

  it('a 401 reported after the grant is gone, or while storage cannot answer, changes nothing and does not throw', async () => {
    const w = world()
    await connected(w)
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error('no handle')
    await w.authorization.disconnect(keyOf())
    await expect(handle.ok.reportRejection()).resolves.toBeUndefined()
    w.records.blind()
    await expect(handle.ok.reportRejection()).resolves.toBeUndefined()
    expect(w.server.tokenRequests()).toHaveLength(1)
  })

  it('wanting scopes of a grant that is not there writes nothing; storage that cannot answer says so', async () => {
    const w = world()
    expect(await w.authorization.requireScopes(keyOf(), ['write'])).toStrictEqual({ ok: true })
    expect(await w.records.read(keyOf())).toStrictEqual({ ok: 'absent' })
    w.records.blind()
    expect(await w.authorization.requireScopes(keyOf(), ['write'])).toStrictEqual({
      failure: 'unavailable',
    })
  })

  it('a configured client with a secret authenticates with HTTP Basic at the token endpoint; a secret that cannot be read makes the refresh unknown', async () => {
    let secretUp = true
    const w = world({
      configuredSecret: async () => (secretUp ? { ok: 'shh' } : { failure: 'unavailable' }),
    })
    const begun = await w.authorization.begin({
      key: keyOf(),
      target: RESOURCE,
      configured: { clientId: 'mine', secret: 'shh' },
      redirectUri: REDIRECT,
      initiator: 'alice',
      signal: never,
    })
    if (!('ok' in begun)) throw new Error(JSON.stringify(begun))
    const state = new URL(begun.ok.url).searchParams.get('state') ?? ''
    w.server.answer(issued('at-1', 'rt-1'))
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe(
      'connected',
    )
    const [exchange] = w.server.tokenRequests()
    expect(exchange?.headers).toStrictEqual({
      authorization: `Basic ${Buffer.from('mine:shh').toString('base64')}`,
    })
    expect(exchange?.body).toMatchObject({
      kind: 'form',
      fields: { grant_type: 'authorization_code' },
    })
    expect(JSON.stringify(exchange?.body)).not.toContain('shh')
    w.advance(3600_000)
    secretUp = false
    expect(await use(w)).toStrictEqual({ failure: 'unknown' })
    expect(w.server.tokenRequests()).toHaveLength(1)
  })
})

describe('the rules on the 401 path and against a broken port', () => {
  it('a 401 whose refresh has no answer keeps the grant valid: only a refusal asks for a new connection', async () => {
    const w = world()
    await connected(w)
    const handle = await w.authorization.acquire(keyOf(), RESOURCE, never)
    if (!('ok' in handle)) throw new Error('no handle')
    w.server.answer('no-answer')
    await handle.ok.reportRejection()
    expect(await factsOf(w)).toMatchObject({ state: 'valid', revision: 1 })
  })

  it('a grant with refresh material and no expiry is not refreshed before a 401', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.server.answer({
      status: 200,
      json: { access_token: 'at-1', token_type: 'Bearer', refresh_token: 'rt-1' },
    })
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe(
      'connected',
    )
    w.advance(100 * 3600_000)
    expect(await use(w)).toMatchObject({ ok: { header: 'Bearer at-1' } })
    expect(w.server.tokenRequests()).toHaveLength(1)
  })

  it('a port that throws during a refresh makes the use unknown; it does not throw', async () => {
    const w = world()
    await connected(w)
    w.advance(3600_000)
    w.server.answer(async () => {
      throw new Error('broken port')
    })
    expect(await use(w)).toStrictEqual({ failure: 'unknown' })
  })
})

async function factsOf(w: ReturnType<typeof world>) {
  const read = await w.records.read(keyOf())
  if (!('ok' in read) || read.ok === 'absent') throw new Error('no grant')
  return read.ok
}
