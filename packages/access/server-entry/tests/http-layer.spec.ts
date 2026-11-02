// The HTTP layer before the public judgment order: loopback only, path, method, Host,
// Content-Type, the body limit per path, the entry's own fault, and stop.
import { afterEach, describe, expect, it } from 'vitest'
import { createServerEntry } from '../src/index.ts'
import {
  GOVERNANCE_PATH,
  SESSION_PATH,
  baseConfig,
  governance,
  identityDouble,
  login,
  raw,
  send,
  sessionMessage,
  startFixture,
  userMessageWire,
  type Fixture,
} from './support/harness.ts'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { createSessionDouble } from './support/session-double.ts'

let fixture: Fixture | undefined
afterEach(async () => {
  await fixture?.stop()
  fixture = undefined
})

function rawRequest(
  path: string,
  body: string,
  headers: readonly string[] = ['Host: 127.0.0.1', 'Content-Type: application/json'],
  method = 'POST',
): string {
  const lines = [
    `${method} ${path} HTTP/1.1`,
    ...headers,
    `Content-Length: ${Buffer.byteLength(body)}`,
    'Connection: close',
    '',
    body,
  ]
  return lines.join('\r\n')
}

describe('listening', () => {
  it('binds 127.0.0.1 only and refuses another address at start', async () => {
    fixture = await startFixture()
    expect(fixture.port).toBeGreaterThan(0)
    const other = createServerEntry({
      config: baseConfig({ listenAddress: '0.0.0.0' }),
      dependencies: {
        identity: identityDouble(),
        issuer: inProcessPrincipalAuthority().issuer,
        session: createSessionDouble({ members: new Map() }).faces,
        resolveDefinition: () => undefined,
      },
    })
    await expect(other.start()).rejects.toThrow(/127\.0\.0\.1/)
    const wildcard = createServerEntry({
      config: baseConfig({ listenAddress: '::' }),
      dependencies: {
        identity: identityDouble(),
        issuer: inProcessPrincipalAuthority().issuer,
        session: createSessionDouble({ members: new Map() }).faces,
        resolveDefinition: () => undefined,
      },
    })
    await expect(wildcard.start()).rejects.toThrow(/127\.0\.0\.1/)
  })

  it('reports the bound loopback address', async () => {
    fixture = await startFixture()
    const listening = await fixture.entry.start()
    expect(listening.address).toBe('127.0.0.1')
    expect(listening.port).toBe(fixture.port)
  })
})

describe('request rules before the message', () => {
  it('answers 404 with an empty body to another path or a query string', async () => {
    fixture = await startFixture()
    const other = await send(fixture.port, '/other', { body: '{}' })
    expect(other.status).toBe(404)
    expect(other.body.byteLength).toBe(0)
    const query = await send(fixture.port, `${GOVERNANCE_PATH}?x=1`, { body: '{}' })
    expect(query.status).toBe(404)
    expect(query.body.byteLength).toBe(0)
  })

  it('answers 405 with Allow: POST to other methods, OPTIONS included, and calls no member', async () => {
    fixture = await startFixture()
    for (const method of ['GET', 'OPTIONS', 'PUT']) {
      const reply = await send(fixture.port, SESSION_PATH, { method, body: '' })
      expect(reply.status).toBe(405)
      expect(reply.headers.allow).toBe('POST')
      expect(reply.body.byteLength).toBe(0)
    }
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('answers 421 to a missing, repeated or foreign Host and accepts localhost with a port', async () => {
    fixture = await startFixture()
    const body = governance('public-health', {})
    const missing = await raw(
      fixture.port,
      rawRequest(GOVERNANCE_PATH, body, ['Content-Type: application/json']),
    )
    expect(missing).toMatch(/^HTTP\/1\.1 421 /)
    const repeated = await raw(
      fixture.port,
      rawRequest(GOVERNANCE_PATH, body, [
        'Host: 127.0.0.1',
        'Host: 127.0.0.1',
        'Content-Type: application/json',
      ]),
    )
    expect(repeated).toMatch(/^HTTP\/1\.1 421 /)
    const foreign = await raw(
      fixture.port,
      rawRequest(GOVERNANCE_PATH, body, ['Host: evil.example', 'Content-Type: application/json']),
    )
    expect(foreign).toMatch(/^HTTP\/1\.1 421 /)
    expect(foreign.endsWith('\r\n\r\n')).toBe(true)
    const local = await raw(
      fixture.port,
      rawRequest(GOVERNANCE_PATH, body, ['Host: LocalHost:9', 'Content-Type: application/json']),
    )
    expect(local).toMatch(/^HTTP\/1\.1 501 /)
  })

  it('answers 415 with the location protocol-rejected to a bad Content-Type', async () => {
    fixture = await startFixture()
    const body = governance('public-health', {})
    const cases: readonly (readonly string[])[] = [
      ['Host: 127.0.0.1'],
      ['Host: 127.0.0.1', 'Content-Type: text/plain'],
      ['Host: 127.0.0.1', 'Content-Type: application/json; charset=latin1'],
      ['Host: 127.0.0.1', 'Content-Type: application/json; version=1'],
      ['Host: 127.0.0.1', 'Content-Type: application/json', 'Content-Type: application/json'],
    ]
    for (const headers of cases) {
      const reply = await raw(fixture.port, rawRequest(GOVERNANCE_PATH, body, headers))
      expect(reply, headers.join(' | ')).toMatch(/^HTTP\/1\.1 415 /)
      expect(reply).toContain(
        '{"protocolVersion":"governance-public/1","outcome":"protocol-rejected","body":{}}',
      )
    }
    const session = await raw(
      fixture.port,
      rawRequest(SESSION_PATH, body, ['Host: 127.0.0.1', 'Content-Type: text/plain']),
    )
    expect(session).toMatch(/^HTTP\/1\.1 415 /)
    expect(session).toContain(
      '{"protocolVersion":"session-public/1","outcome":"protocol-rejected","body":{}}',
    )
    for (const accepted of [
      'Content-Type: Application/JSON',
      'Content-Type: application/json; charset=utf-8',
      'Content-Type: application/json;charset="UTF-8"',
    ]) {
      const reply = await raw(
        fixture.port,
        rawRequest(GOVERNANCE_PATH, body, ['Host: 127.0.0.1', accepted]),
      )
      expect(reply, accepted).toMatch(/^HTTP\/1\.1 501 /)
    }
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('writes Cache-Control: no-store and the JSON content type on every answer', async () => {
    fixture = await startFixture()
    const reply = await send(fixture.port, GOVERNANCE_PATH, { body: 'not json' })
    expect(reply.status).toBe(400)
    expect(reply.headers['cache-control']).toBe('no-store')
    expect(reply.headers['content-type']).toBe('application/json; charset=utf-8')
    const empty = await send(fixture.port, '/other', { body: '' })
    expect(empty.headers['cache-control']).toBe('no-store')
  })
})

describe('request body limits', () => {
  it('answers 413 with protocol-rejected to a governance body over small and closes the connection', async () => {
    fixture = await startFixture({ config: { maxBodyBytes: { small: 64, input: 4096 } } })
    const large = governance('issue-login', { loginIdentifier: 'a'.repeat(100), credential: 'b' })
    const reply = await send(fixture.port, GOVERNANCE_PATH, { body: large })
    expect(reply.status).toBe(413)
    expect(reply.json).toEqual({
      protocolVersion: 'governance-public/1',
      outcome: 'protocol-rejected',
      body: {},
    })
    expect(reply.headers.connection).toBe('close')
    expect(fixture.session.controls.calls()).toEqual([])
  })

  it('refuses a Content-Length over the limit before reading the body', async () => {
    fixture = await startFixture({ config: { maxBodyBytes: { small: 64, input: 4096 } } })
    const text = await raw(
      fixture.port,
      [
        `POST ${GOVERNANCE_PATH} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        'Content-Length: 100000',
        '',
        '{',
      ].join('\r\n'),
    )
    expect(text).toMatch(/^HTTP\/1\.1 413 /)
  })

  it('lets a session body over small but within input enter the judgment order', async () => {
    fixture = await startFixture({ config: { maxBodyBytes: { small: 64, input: 8192 } } })
    const create = sessionMessage(
      'create-session',
      { createCallId: 'c1', definition: 'assistant', purpose: 'p'.repeat(200) },
      {
        loginProof: 'not-issued',
        actingTenant:
          '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
      },
    )
    expect(Buffer.byteLength(create)).toBeGreaterThan(64)
    const reply = await send(fixture.port, SESSION_PATH, { body: create })
    expect(reply.status).toBe(403)
    expect((reply.json as { outcome: string }).outcome).toBe('denied')
  })

  it('accepts a large send-input within input and refuses one over it', async () => {
    fixture = await startFixture({ config: { maxBodyBytes: { small: 256, input: 6000 } } })
    const who = await login(fixture, 'alice')
    const createReply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'c1', definition: 'assistant', purpose: 'p' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(createReply.status).toBe(200)
    const session = (createReply.json as { body: { session: string } }).body.session
    const sendBody = (size: number) =>
      sessionMessage(
        'send-input',
        {
          tenant: who.tenantText,
          session,
          acceptId: 'a1',
          inputId: 'i1',
          message: userMessageWire('x'.repeat(size)),
        },
        { loginProof: who.loginProof },
      )
    const within = await send(fixture.port, SESSION_PATH, { body: sendBody(4000) })
    expect(within.status).toBe(200)
    const over = await send(fixture.port, SESSION_PATH, { body: sendBody(7000) })
    expect(over.status).toBe(413)
    expect((over.json as { outcome: string }).outcome).toBe('protocol-rejected')
  })
})

describe('the entry has no trustworthy answer', () => {
  it('writes an empty 500 and closes the connection when its own definition mapping throws', async () => {
    fixture = await startFixture({
      dependencies: {
        resolveDefinition: () => {
          throw new Error('mapping exploded')
        },
      },
    })
    const who = await login(fixture, 'alice')
    const reply = await send(fixture.port, SESSION_PATH, {
      body: sessionMessage(
        'create-session',
        { createCallId: 'c1', definition: 'assistant', purpose: 'p' },
        { loginProof: who.loginProof, actingTenant: who.tenantText },
      ),
    })
    expect(reply.status).toBe(500)
    expect(reply.body.byteLength).toBe(0)
    expect(reply.headers.connection).toBe('close')
    expect(fixture.session.controls.calls()).toEqual([])
  })
})

describe('stop', () => {
  it('stops accepting new connections', async () => {
    fixture = await startFixture()
    const port = fixture.port
    await fixture.stop()
    await expect(send(port, GOVERNANCE_PATH, { body: '{}' })).rejects.toThrow()
    fixture = undefined
  })
})
