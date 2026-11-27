import { describe, expect, it } from 'vitest'
import { samplePending } from '@omne-harness/mcp-contract/testing'
import {
  chooseRegistration,
  judgeCallback,
  readResourceMetadata,
  readServerMetadata,
  readTokenAnswer,
  serverMetadataCandidatesOf,
  type AuthorizationServer,
} from '@omne-harness/mcp-authorization'
import { ISSUER, keyOf, serverMetadata } from './fixture.ts'

describe('authorization server discovery (MCP authorization-server-discovery)', () => {
  it('an issuer without a path tries OAuth then OIDC; with a path, OAuth insertion, OIDC insertion, OIDC appending', () => {
    expect(serverMetadataCandidatesOf('https://auth.example')).toEqual([
      'https://auth.example/.well-known/oauth-authorization-server',
      'https://auth.example/.well-known/openid-configuration',
    ])
    expect(serverMetadataCandidatesOf('https://auth.example/tenant1/')).toEqual([
      'https://auth.example/.well-known/oauth-authorization-server/tenant1',
      'https://auth.example/.well-known/openid-configuration/tenant1',
      'https://auth.example/tenant1/.well-known/openid-configuration',
    ])
  })

  it('metadata is used only with the identical issuer, S256 among the PKCE methods and safe endpoints', () => {
    expect(readServerMetadata(ISSUER, serverMetadata())).toMatchObject({
      ok: { issuer: ISSUER, tokenEndpoint: `${ISSUER}/token`, issRequired: true },
    })
    expect(
      readServerMetadata(ISSUER, serverMetadata({ issuer: 'https://honest.example' })),
    ).toEqual({
      failure: 'issuer-mismatch',
    })
    expect(readServerMetadata(`${ISSUER}/`, serverMetadata())).toEqual({
      failure: 'issuer-mismatch',
    })
    const noPkce = serverMetadata()
    delete noPkce['code_challenge_methods_supported']
    expect(readServerMetadata(ISSUER, noPkce)).toEqual({ failure: 'no-pkce' })
    expect(
      readServerMetadata(ISSUER, serverMetadata({ code_challenge_methods_supported: ['plain'] })),
    ).toEqual({ failure: 'no-pkce' })
    expect(
      readServerMetadata(ISSUER, serverMetadata({ token_endpoint: 'http://auth.example/token' })),
    ).toEqual({ failure: 'insecure-endpoint' })
    const loopback = 'http://127.0.0.1:9000'
    expect(
      readServerMetadata(loopback, {
        ...serverMetadata({ issuer: loopback }),
        authorization_endpoint: `${loopback}/authorize`,
        token_endpoint: `${loopback}/token`,
        registration_endpoint: `${loopback}/register`,
      }),
    ).toMatchObject({ ok: { issuer: loopback } })
    expect(readServerMetadata(ISSUER, serverMetadata({ token_endpoint: 7 }))).toEqual({
      failure: 'malformed',
    })
    expect(readServerMetadata(ISSUER, ['x'])).toEqual({ failure: 'malformed' })
  })

  it('the protected resource names its first authorization server; one that is not a safe address is no server', () => {
    expect(
      readResourceMetadata({
        authorization_servers: [ISSUER, 'https/b'],
        scopes_supported: ['read'],
      }),
    ).toEqual({ issuer: ISSUER, scopes: ['read'] })
    expect(readResourceMetadata({ authorization_servers: [] })).toBeUndefined()
    expect(readResourceMetadata({ authorization_servers: ['http://evil.example'] })).toBeUndefined()
  })
})

const server = (overrides: Partial<AuthorizationServer> = {}): AuthorizationServer => ({
  issuer: ISSUER,
  authorizationEndpoint: `${ISSUER}/authorize`,
  tokenEndpoint: `${ISSUER}/token`,
  registrationEndpoint: `${ISSUER}/register`,
  metadataDocuments: true,
  issRequired: true,
  scopesSupported: [],
  authMethods: [],
  ...overrides,
})

describe('the order of registration (C203)', () => {
  const saved = { way: 'dynamic', clientId: 'old-dyn', authMethod: 'none' } as const
  it('a client the person configured comes first, with a secret method only when it has a secret', () => {
    expect(
      chooseRegistration({
        server: server(),
        configured: { clientId: 'mine' },
        metadataDocument: 'https://omne.example/client',
        saved,
      }),
    ).toEqual({
      ok: {
        kind: 'ready',
        registration: { way: 'configured', clientId: 'mine', authMethod: 'none' },
      },
    })
    expect(
      chooseRegistration({
        server: server({ authMethods: ['client_secret_post'] }),
        configured: { clientId: 'mine', secret: 's' },
      }),
    ).toEqual({
      ok: {
        kind: 'ready',
        registration: { way: 'configured', clientId: 'mine', authMethod: 'client_secret_post' },
      },
    })
  })

  it('then a metadata document the server supports, then a registration made before, then dynamic, else none', () => {
    const document = 'https://omne.example/client'
    expect(chooseRegistration({ server: server(), metadataDocument: document, saved })).toEqual({
      ok: {
        kind: 'ready',
        registration: { way: 'metadata-document', clientId: document, authMethod: 'none' },
      },
    })
    expect(
      chooseRegistration({
        server: server({ metadataDocuments: false }),
        metadataDocument: document,
        saved,
      }),
    ).toEqual({
      ok: { kind: 'ready', registration: saved },
    })
    expect(chooseRegistration({ server: server({ metadataDocuments: false }) })).toEqual({
      ok: { kind: 'register', endpoint: `${ISSUER}/register` },
    })
    const bare = server({ metadataDocuments: false })
    const { registrationEndpoint: _, ...withoutEndpoint } = bare
    expect(chooseRegistration({ server: withoutEndpoint })).toEqual({ failure: 'no-registration' })
  })
})

describe('the callback and the token answer', () => {
  const pending = samplePending(keyOf(), 's1')
  const now = pending.expiresAt - 1

  it('checks expiry, then the issuer as RFC 9207 says, then the error, then the code', () => {
    expect(judgeCallback(pending, { code: 'c', iss: ISSUER }, pending.expiresAt)).toEqual({
      kind: 'rejected',
      reason: 'expired',
    })
    expect(judgeCallback(pending, { code: 'c' }, now)).toEqual({
      kind: 'rejected',
      reason: 'issuer',
    })
    expect(judgeCallback(pending, { code: 'c', iss: `${ISSUER}/` }, now)).toEqual({
      kind: 'rejected',
      reason: 'issuer',
    })
    expect(
      judgeCallback(pending, { error: 'access_denied', iss: 'https://evil.example' }, now),
    ).toEqual({
      kind: 'rejected',
      reason: 'issuer',
    })
    expect(judgeCallback(pending, { error: 'access_denied', iss: ISSUER }, now)).toEqual({
      kind: 'denied',
    })
    expect(judgeCallback(pending, { iss: ISSUER }, now)).toEqual({
      kind: 'rejected',
      reason: 'malformed',
    })
    expect(judgeCallback(pending, { code: 'c', iss: ISSUER }, now)).toEqual({
      kind: 'exchange',
      code: 'c',
    })
    const loose = { ...pending, issRequired: false }
    expect(judgeCallback(loose, { code: 'c' }, now)).toEqual({ kind: 'exchange', code: 'c' })
    expect(judgeCallback(loose, { code: 'c', iss: 'https://evil.example' }, now)).toMatchObject({
      kind: 'rejected',
    })
  })

  it('a 400 or 401 with an error is a refusal; no answer, 5xx, a non-Bearer or unreadable success is not known', () => {
    const ok = (json: unknown) => ({ ok: { status: 200, json } })
    expect(
      readTokenAnswer(
        ok({
          access_token: 'a',
          token_type: 'bearer',
          expires_in: 60,
          refresh_token: 'r',
          scope: 'read write',
        }),
      ),
    ).toEqual({
      kind: 'issued',
      access: 'a',
      refresh: 'r',
      expiresIn: 60,
      scopes: ['read', 'write'],
    })
    expect(readTokenAnswer({ ok: { status: 400, json: { error: 'invalid_grant' } } })).toEqual({
      kind: 'refused',
    })
    expect(readTokenAnswer({ ok: { status: 401, json: { error: 'invalid_client' } } })).toEqual({
      kind: 'refused',
    })
    expect(readTokenAnswer({ ok: { status: 400, json: {} } })).toEqual({ kind: 'unknown' })
    expect(readTokenAnswer({ ok: { status: 503, json: { error: 'x' } } })).toEqual({
      kind: 'unknown',
    })
    expect(readTokenAnswer({ failure: 'no-answer' })).toEqual({ kind: 'unknown' })
    expect(readTokenAnswer(ok({ access_token: 'a', token_type: 'mac' }))).toEqual({
      kind: 'unknown',
    })
    expect(readTokenAnswer(ok({ token_type: 'Bearer' }))).toEqual({ kind: 'unknown' })
  })
})
