import { describe, expect, it } from 'vitest'
import { challengeOf } from '@omne-harness/mcp-authorization'
import {
  ISSUER,
  REDIRECT,
  RESOURCE,
  beginOn,
  issued,
  keyOf,
  never,
  refused,
  world,
} from './fixture.ts'

describe('beginning a connection (C201)', () => {
  it('discovers through the well-known addresses, registers dynamically and answers an authorization address with PKCE S256, state and resource', async () => {
    const w = world()
    const { url, begun } = await beginOn(w)
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
    const params = Object.fromEntries(url.searchParams)
    expect(params).toMatchObject({
      response_type: 'code',
      client_id: 'client-dyn',
      redirect_uri: REDIRECT,
      code_challenge_method: 'S256',
      resource: RESOURCE,
      scope: 'read',
    })
    expect(params['state']?.length).toBeGreaterThanOrEqual(43)
    const pending = await w.records.take(keyOf().tenant, params['state'] ?? '')
    if (!('ok' in pending) || pending.ok === 'absent') throw new Error('no pending')
    expect(challengeOf(pending.ok.verifier)).toBe(params['code_challenge'])
    expect(pending.ok.verifier.length).toBeGreaterThanOrEqual(43)
    expect(begun.expiresAt).toBe(w.now() + 600_000)
    const registerBody = w.server.sent.find(item => item.url === `${ISSUER}/register`)?.body
    expect(registerBody).toMatchObject({
      kind: 'json',
      value: { application_type: 'native', redirect_uris: [REDIRECT] },
    })
  })

  it('a registration made before for the same issuer is used again; the challenge scope and resource metadata address win', async () => {
    const w = world()
    await beginOn(w)
    const before = w.server.sent.length
    w.server.documents.set('https://mcp.example/named-metadata', {
      authorization_servers: [ISSUER],
    })
    const begun = await w.authorization.begin({
      key: keyOf(),
      target: RESOURCE,
      challenge:
        'Bearer resource_metadata="https://mcp.example/named-metadata", scope="files:read"',
      redirectUri: REDIRECT,
      initiator: 'alice',
      signal: never,
    })
    if (!('ok' in begun)) throw new Error(JSON.stringify(begun))
    expect(new URL(begun.ok.url).searchParams.get('scope')).toBe('files:read')
    const after = w.server.sent.slice(before).map(item => item.url)
    expect(after).toEqual([
      'https://mcp.example/named-metadata',
      `${ISSUER}/.well-known/oauth-authorization-server`,
    ])
  })

  it('stops with the reason when discovery or registration cannot go on', async () => {
    const cases: [string, (w: ReturnType<typeof world>) => void, string][] = [
      ['no resource metadata', w => w.server.documents.clear(), 'no-resource-metadata'],
      [
        'no metadata of the server',
        w => w.server.documents.delete(`${ISSUER}/.well-known/oauth-authorization-server`),
        'no-authorization-server',
      ],
      [
        'an impostor issuer',
        w =>
          w.server.documents.set(`${ISSUER}/.well-known/oauth-authorization-server`, {
            issuer: 'https://honest.example',
          }),
        'issuer-mismatch',
      ],
      [
        'no S256',
        w =>
          w.server.documents.set(`${ISSUER}/.well-known/oauth-authorization-server`, {
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/a`,
            token_endpoint: `${ISSUER}/t`,
          }),
        'no-pkce',
      ],
      [
        'a refused registration',
        w => w.server.registerWith({ status: 400, json: { error: 'invalid_client_metadata' } }),
        'registration-refused',
      ],
    ]
    for (const [label, arrange, reason] of cases) {
      const w = world()
      arrange(w)
      const begun = await w.authorization.begin({
        key: keyOf(),
        target: RESOURCE,
        redirectUri: REDIRECT,
        initiator: 'alice',
        signal: never,
      })
      expect(begun, label).toEqual({ failure: reason })
    }
  })
})

describe('the callback exchanges a code only for the pending authorization that stands, after its issuer, at most once (MC-32, C202)', () => {
  it('a checked callback exchanges once with the verifier and the resource; the grant is valid', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.server.answer(issued('at-1', 'rt-1'))
    expect(await w.authorization.callback({ state, code: 'code-1', iss: ISSUER }, never)).toBe(
      'connected',
    )
    const [request] = w.server.tokenRequests()
    expect(request?.body).toMatchObject({
      kind: 'form',
      fields: {
        grant_type: 'authorization_code',
        code: 'code-1',
        redirect_uri: REDIRECT,
        resource: RESOURCE,
        client_id: 'client-dyn',
      },
    })
    expect(await w.records.read(keyOf())).toMatchObject({
      ok: { state: 'valid', minted: 'exchange', revision: 1 },
    })
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBe('at-1')
    expect(w.secrets.peek({ kind: 'refresh', key: keyOf() })).toBe('rt-1')
  })

  it('a wrong state, a wrong or missing issuer, an expired one, a replay and one a newer connection replaced exchange nothing', async () => {
    const w = world()
    const first = await beginOn(w)
    const second = await beginOn(w)
    expect(
      await w.authorization.callback({ state: first.state, code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    expect(
      await w.authorization.callback({ state: 'made-up', code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    expect(await w.authorization.callback({ code: 'c', iss: ISSUER }, never)).toBe('not-connected')
    expect(
      await w.authorization.callback(
        { state: second.state, code: 'c', iss: 'https://evil.example' },
        never,
      ),
    ).toBe('not-connected')
    expect(
      await w.authorization.callback({ state: second.state, code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    const third = await beginOn(w)
    w.advance(600_000)
    expect(
      await w.authorization.callback({ state: third.state, code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    const fourth = await beginOn(w)
    expect(await w.authorization.callback({ state: fourth.state, code: 'c' }, never)).toBe(
      'not-connected',
    )
    expect(w.server.tokenRequests()).toEqual([])
    expect(await w.records.read(keyOf())).toEqual({ ok: 'absent' })
  })

  it('the same callback twice exchanges once', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.server.answer(issued('at-1', 'rt-1'), issued('at-2', 'rt-2'))
    const query = { state, code: 'code-1', iss: ISSUER }
    expect(await w.authorization.callback(query, never)).toBe('connected')
    expect(await w.authorization.callback(query, never)).toBe('not-connected')
    expect(w.server.tokenRequests()).toHaveLength(1)
  })

  it('an error the server sends back, a refused exchange and one with no answer leave no grant; the last says unknown', async () => {
    const w = world()
    const denied = await beginOn(w)
    expect(
      await w.authorization.callback(
        { state: denied.state, error: 'access_denied', iss: ISSUER },
        never,
      ),
    ).toBe('not-connected')
    const refusedOne = await beginOn(w)
    w.server.answer(refused())
    expect(
      await w.authorization.callback({ state: refusedOne.state, code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    const lost = await beginOn(w)
    w.server.answer('no-answer')
    expect(
      await w.authorization.callback({ state: lost.state, code: 'c', iss: ISSUER }, never),
    ).toBe('unknown')
    expect(await w.records.read(keyOf())).toEqual({ ok: 'absent' })
    expect(w.secrets.peek({ kind: 'access', key: keyOf() })).toBeUndefined()
  })

  it('an exchange whose tokens cannot be written answers unknown and makes no grant', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.server.answer(issued('at-1', 'rt-1'))
    w.secrets.failNext('access')
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe('unknown')
    expect(await w.records.read(keyOf())).toEqual({ ok: 'absent' })
  })

  it('a client secret that dynamic registration gives is kept as a secret and authenticates the exchange', async () => {
    const w = world()
    w.server.registerWith({
      status: 201,
      json: { client_id: 'client-conf', client_secret: 'reg-secret' },
    })
    const { state } = await beginOn(w)
    expect(w.secrets.peek({ kind: 'client', tenant: keyOf().tenant, issuer: ISSUER })).toBe(
      'reg-secret',
    )
    w.server.answer(issued('at-1', 'rt-1'))
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe(
      'connected',
    )
    const basic = `Basic ${Buffer.from('client-conf:reg-secret').toString('base64')}`
    expect(w.server.tokenRequests()[0]?.headers).toEqual({ authorization: basic })
    w.server.registerWith({ status: 503, json: undefined })
    const other = await w.authorization.begin({
      key: keyOf('t'),
      target: RESOURCE,
      redirectUri: REDIRECT,
      initiator: 'bob',
      signal: never,
    })
    expect(other).toEqual({ failure: 'unavailable' })
  })

  it('a callback this process did not begin, after a restart, is found by looking through the tenants', async () => {
    const before = world()
    const { state } = await beginOn(before)
    const tenants = [keyOf('t').tenant, keyOf().tenant]
    const after = world({
      records: before.records,
      secrets: before.secrets,
      tenants: async () => ({ ok: tenants }),
    })
    after.server.answer(issued('at-1', 'rt-1'))
    expect(await after.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe(
      'connected',
    )
    const lost = world({ records: before.records, secrets: before.secrets })
    const again = await beginOn(before)
    expect(
      await lost.authorization.callback({ state: again.state, code: 'c', iss: ISSUER }, never),
    ).toBe('not-connected')
    const down = world({
      records: before.records,
      tenants: async () => ({ failure: 'unavailable' }),
    })
    const third = await beginOn(before)
    expect(
      await down.authorization.callback({ state: third.state, code: 'c', iss: ISSUER }, never),
    ).toBe('unknown')
  })

  it('a storage that cannot take the state answers unknown and exchanges nothing', async () => {
    const w = world()
    const { state } = await beginOn(w)
    w.records.blind()
    expect(await w.authorization.callback({ state, code: 'c', iss: ISSUER }, never)).toBe('unknown')
    expect(w.server.tokenRequests()).toEqual([])
  })
})
