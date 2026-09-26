import { governanceCases } from './governance-cases.ts'
import { execFileSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { getEventListeners } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer as createTcpServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type TLSSocket } from 'node:tls'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  GovernanceClientConfigurationError,
  readPublicHealth,
  exchangeGovernance,
} from '../src/index.ts'

let root: string
let certificate: { cert: string; key: string }
let wrongHost: { cert: string; key: string }
let rogue: { cert: string; key: string }
const cleanups: (() => Promise<void>)[] = []
const health = { reachable: true, centerId: 'a'.repeat(32), version: 'fixture-v1' }

function makeCertificate(name: string, sans: string): { cert: string; key: string } {
  const key = join(root, `${name}.key`)
  const cert = join(root, `${name}.pem`)
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      `subjectAltName=${sans}`,
    ],
    { stdio: 'ignore' },
  )
  return { cert: readFileSync(cert, 'utf8'), key: readFileSync(key, 'utf8') }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'omne-health-client-'))
  certificate = makeCertificate('valid', 'DNS:localhost,IP:127.0.0.1')
  wrongHost = makeCertificate('wrong-host', 'DNS:wrong.invalid')
  rogue = makeCertificate('rogue', 'DNS:localhost,IP:127.0.0.1')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(close => close()))
})

function http(body: string | Buffer, status = 200, length = Buffer.byteLength(body)): Buffer {
  return Buffer.concat([
    Buffer.from(
      `HTTP/1.1 ${status} Reply\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n`,
    ),
    Buffer.from(body),
  ])
}

async function peer(
  answer: Buffer | ((socket: TLSSocket) => void) = http(JSON.stringify(health)),
  material = certificate,
  tls12 = false,
) {
  const sockets = new Set<Socket>()
  const observations = { connections: 0, requests: [] as string[], applicationBytes: 0 }
  const server = createServer(
    {
      ...material,
      minVersion: tls12 ? 'TLSv1.2' : 'TLSv1.3',
      ...(tls12 ? { maxVersion: 'TLSv1.2' as const } : {}),
    },
    socket => {
      let bytes = Buffer.alloc(0)
      let responded = false
      socket.on('error', () => {})
      socket.on('data', chunk => {
        observations.applicationBytes += chunk.length
        bytes = Buffer.concat([bytes, chunk])
        const end = bytes.indexOf('\r\n\r\n')
        if (end < 0 || responded) return
        const header = bytes.subarray(0, end).toString()
        const match = /\r\nContent-Length: (\d+)/i.exec(header)
        if (match === null || bytes.length < end + 4 + Number(match[1])) return
        responded = true
        observations.requests.push(bytes.toString())
        if (typeof answer === 'function') answer(socket)
        else socket.end(answer)
      })
    },
  )
  server.on('connection', socket => {
    sockets.add(socket)
    observations.connections += 1
    socket.once('close', () => sockets.delete(socket))
  })
  server.on('tlsClientError', () => {})
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture has no port')
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  return {
    url: `https://127.0.0.1:${String(address.port)}/`,
    observations,
    sockets,
    trust: { mode: 'ca' as const, certificateAuthorities: material.cert },
  }
}

function pin(cert: string): string {
  return createHash('sha256')
    .update(new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')
}

describe('D045 EC2 governance transport', () => {
  it('bundles the exact frozen schema and covers every accepted business route', () => {
    const bundled = readFileSync(
      join(import.meta.dirname, '../schema/governance-center-entry.schema.json'),
    )
    const frozen = readFileSync(
      join(
        import.meta.dirname,
        '../../../../.meta_harness/design/spec/compositions/governance-center-entry/v2/governance-center-entry.schema.json',
      ),
    )
    expect(bundled.equals(frozen)).toBe(true)
    const schema = JSON.parse(frozen.toString()) as {
      $defs: { EnvelopeRouteId: { enum: string[] } }
    }
    expect(governanceCases.map(c => c.operation).sort()).toEqual(
      [...schema.$defs.EnvelopeRouteId.enum].sort(),
    )
  })

  it.each(governanceCases)(
    '$operation: validates the captured envelope and its own result',
    async sample => {
      const p = await peer(http(JSON.stringify(sample.reply)))
      expect(await exchangeGovernance(p, sample.envelope)).toEqual({
        kind: 'reply',
        reply: sample.reply,
        sendAttempted: true,
      })
      expect(p.observations.requests).toHaveLength(1)
      expect(JSON.parse(p.observations.requests[0]?.split('\r\n\r\n')[1] ?? '')).toEqual(
        sample.envelope,
      )
    },
  )

  function sample(ends: string) {
    const found = governanceCases.find(c => c.operation.endsWith(ends))
    if (found === undefined) throw new Error('missing sample')
    return found
  }

  it('rejects a different route result/failure and the wrong OG34 result branch', async () => {
    const list = sample('identity/v3#S-37')
    for (const reply of [{ result: 'ok' }, { failure: 'notAuthorized' }, { result: [] }]) {
      const p = await peer(http(JSON.stringify(reply)))
      expect(await exchangeGovernance(p, list.envelope)).toEqual({
        kind: 'unavailable',
        reason: 'response-invalid',
        sendAttempted: true,
      })
    }
    const one = sample('governance/v2#S-34')
    const p = await peer(http('{"result":true}'))
    expect((await exchangeGovernance(p, one.envelope)).kind).toBe('unavailable')
    const two = { ...one.envelope, payload: { organizations: ['org_a', 'org_b'] } }
    expect(await exchangeGovernance(p, two)).toEqual({
      kind: 'reply',
      reply: { result: true },
      sendAttempted: true,
    })
  })

  it('rejects missing or surplus expectedTenant and obsolete protocol before opening a connection', async () => {
    const p = await peer()
    const scoped = sample('governance/v2#S-58')
    const list = sample('identity/v3#S-37')
    for (const envelope of [
      { ...scoped.envelope, payload: {} },
      {
        ...list.envelope,
        payload: { expectedTenant: { organization: 'org_a', account: 'acc_a' } },
      },
      { ...list.envelope, protocolVersion: '1' },
    ])
      await expect(exchangeGovernance(p, envelope)).rejects.toBeInstanceOf(
        GovernanceClientConfigurationError,
      )
    expect(p.observations.connections).toBe(0)
  })

  it.each([
    '{"result":"ok","result":"ok"}',
    '{"resul\\u0074":"ok","result":"ok"}',
    '{"result":{"x":1,"x":2}}',
    '\ufeff{"result":"ok"}',
    '"version\\u002dmismatch"',
  ])('rejects ambiguous or noncanonical reply: %s', async body => {
    const p = await peer(http(body))
    expect(await exchangeGovernance(p, sample('identity/v3#S-16').envelope)).toEqual({
      kind: 'unavailable',
      reason: 'response-invalid',
      sendAttempted: true,
    })
  })

  it('bounds reply nesting and preserves fixed version mismatch before status rejection', async () => {
    const deep = await peer(http('['.repeat(65) + '0' + ']'.repeat(65)))
    expect(await exchangeGovernance(deep, sample('identity/v3#S-16').envelope)).toEqual({
      kind: 'unavailable',
      reason: 'response-limit',
      sendAttempted: true,
    })
    const p = await peer(http('"version-mismatch"', 426))
    expect(await exchangeGovernance(p, sample('identity/v3#S-16').envelope)).toEqual({
      kind: 'entry-answer',
      answer: 'version-mismatch',
      sendAttempted: true,
    })
  })

  it('trust rejection and early cancellation never attempt sending secrets', async () => {
    const p = await peer()
    const input = sample('identity/v3#S-15').envelope
    expect(
      await exchangeGovernance({ ...p, trust: { mode: 'spki', sha256: '0'.repeat(64) } }, input),
    ).toEqual({ kind: 'unavailable', reason: 'trust', sendAttempted: false })
    expect(await exchangeGovernance({ ...p, signal: AbortSignal.abort() }, input)).toEqual({
      kind: 'unavailable',
      reason: 'cancelled',
      sendAttempted: false,
    })
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('timeout and cancellation after sending retain uncertainty, never retry and remove the abort listener', async () => {
    const p = await peer(() => {})
    const input = sample('identity/v3#S-15').envelope
    expect(await exchangeGovernance({ ...p, timeoutMs: 50 }, input)).toEqual({
      kind: 'unavailable',
      reason: 'timeout',
      sendAttempted: true,
    })
    const ac = new AbortController()
    const stopping = await peer(() => ac.abort())
    expect(await exchangeGovernance({ ...stopping, signal: ac.signal }, input)).toEqual({
      kind: 'unavailable',
      reason: 'cancelled',
      sendAttempted: true,
    })
    expect(getEventListeners(ac.signal, 'abort')).toHaveLength(0)
    expect(p.observations.requests).toHaveLength(1)
    expect(stopping.observations.requests).toHaveLength(1)
  })

  it('captures input before await and does not follow redirects', async () => {
    const source = sample('identity/v3#S-15')
    const input = {
      ...source.envelope,
      payload: { loginIdentifier: 'before', credential: 'one-secret' },
    }
    const p = await peer(http(JSON.stringify(source.reply)))
    const pending = exchangeGovernance(p, input)
    input.payload.credential = 'later-secret'
    input.payload.loginIdentifier = 'after'
    expect((await pending).kind).toBe('reply')
    expect(p.observations.requests[0]).toContain('one-secret')
    expect(p.observations.requests[0]).not.toContain('later-secret')
    const redirected = await peer(
      Buffer.from(
        'HTTP/1.1 307 Redirect\r\nLocation: https://example.invalid/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
      ),
    )
    expect(await exchangeGovernance(redirected, source.envelope)).toEqual({
      kind: 'unavailable',
      reason: 'response-invalid',
      sendAttempted: true,
    })
    expect(redirected.observations.connections).toBe(1)
  })
})

// EC1 S-18, HT1 S-4/5/9/15；这里只允许固定公开请求。
describe('public health transport', () => {
  it('sends only the fixed public request, once on each connection', async () => {
    const p = await peer()
    expect(await readPublicHealth(p)).toEqual({ kind: 'health', reply: health })
    expect(await readPublicHealth(p)).toEqual({ kind: 'health', reply: health })
    expect(p.observations.connections).toBe(2)
    expect(p.observations.requests).toHaveLength(2)
    for (const text of p.observations.requests) {
      expect(text).toMatch(/^POST \/ HTTP\/1\.1\r\n/)
      expect(text).not.toMatch(/Authorization:|Transfer-Encoding:|Expect:|Cookie:/i)
      expect(text.split('\r\n\r\n')[1]).toBe(
        '{"operation":"composition.governance-center-entry/v1#S-18"}',
      )
    }
  })

  it('uses the caller-confirmed SPKI instead of a CA chain', async () => {
    const p = await peer()
    expect(
      await readPublicHealth({
        url: p.url,
        trust: { mode: 'spki', sha256: pin(certificate.cert) },
      }),
    ).toEqual({ kind: 'health', reply: health })
  })

  it('never writes application bytes to an untrusted CA', async () => {
    const p = await peer()
    expect(
      await readPublicHealth({
        url: p.url,
        trust: { mode: 'ca', certificateAuthorities: rogue.cert },
      }),
    ).toEqual({ kind: 'unavailable', reason: 'trust' })
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('never writes application bytes on hostname mismatch', async () => {
    const p = await peer(undefined, wrongHost)
    expect(await readPublicHealth(p)).toEqual({ kind: 'unavailable', reason: 'trust' })
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('never writes application bytes on SPKI mismatch', async () => {
    const p = await peer()
    expect(
      await readPublicHealth({ url: p.url, trust: { mode: 'spki', sha256: '0'.repeat(64) } }),
    ).toEqual({ kind: 'unavailable', reason: 'trust' })
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('does not negotiate TLS 1.2', async () => {
    const p = await peer(undefined, certificate, true)
    expect((await readPublicHealth(p)).kind).toBe('unavailable')
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('captures CA bytes before yielding', async () => {
    const p = await peer()
    const ca = Buffer.from(certificate.cert)
    const reading = readPublicHealth({
      url: p.url,
      trust: { mode: 'ca', certificateAuthorities: ca },
    })
    ca.fill(0)
    expect(await reading).toEqual({ kind: 'health', reply: health })
  })

  it('recognizes exact version mismatch before non-200 status', async () => {
    const p = await peer(http('"version-mismatch"', 503))
    expect(await readPublicHealth(p)).toEqual({ kind: 'entry-answer', answer: 'version-mismatch' })
  })

  it.each(['login-state-rejected', 'invalid-input', 'unavailable'] as const)(
    'classifies %s as an entry answer, never health',
    async answer => {
      const p = await peer(http(JSON.stringify(answer)))
      expect(await readPublicHealth(p)).toEqual({ kind: 'entry-answer', answer })
    },
  )

  it.each([
    ' "version-mismatch"',
    '{"result":"ok"}',
    'not json',
    JSON.stringify({ ...health, extra: 1 }),
    JSON.stringify({ ...health, reachable: false }),
    JSON.stringify({ ...health, centerId: 'A'.repeat(32) }),
    JSON.stringify({ ...health, version: '' }),
    JSON.stringify({ ...health, version: 1 }),
    'null',
    '[]',
  ])('rejects an invalid health shape: %s', async body => {
    const p = await peer(http(body))
    expect(await readPublicHealth(p)).toEqual({ kind: 'unavailable', reason: 'response-invalid' })
  })

  it('rejects malformed UTF-8 instead of accepting replacement characters', async () => {
    const p = await peer(http(Buffer.from([0xff])))
    expect(await readPublicHealth(p)).toEqual({ kind: 'unavailable', reason: 'response-invalid' })
  })

  it('does not follow a redirect or retry it', async () => {
    const p = await peer(
      Buffer.from(
        'HTTP/1.1 302 Redirect\r\nLocation: https://127.0.0.1:1/\r\nContent-Length: 0\r\n\r\n',
      ),
    )
    expect((await readPublicHealth(p)).kind).toBe('unavailable')
    expect(p.observations.connections).toBe(1)
  })

  it.each([
    Buffer.from('HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\n{}'),
    Buffer.from('HTTP/1.1 200 OK\r\n\r\n{}'),
    Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\n{}\r\n0\r\n\r\n'),
    http('{}', 200, 10),
    Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\n{}'),
  ])('never accepts malformed or incomplete framing %#', async raw => {
    const p = await peer(raw)
    expect((await readPublicHealth(p)).kind).toBe('unavailable')
  })

  it('rejects an advertised oversized body before collecting it', async () => {
    const p = await peer(http('', 200, 65537))
    expect(await readPublicHealth(p)).toEqual({ kind: 'unavailable', reason: 'response-limit' })
  })

  it('bounds response headers', async () => {
    const p = await peer(
      Buffer.from(
        `HTTP/1.1 200 OK\r\nX-Large: ${'a'.repeat(17000)}\r\nContent-Length: 2\r\n\r\n{}`,
      ),
    )
    expect((await readPublicHealth(p)).kind).toBe('unavailable')
  })
})

describe('lifecycle and configuration', () => {
  it.each([
    'http://localhost/',
    'https://user:secret@localhost/',
    'https://localhost/?x=y',
    'https://localhost/#x',
    'not-a-url',
  ])('rejects invalid configuration without a request: %s', async url => {
    await expect(readPublicHealth({ url })).rejects.toBeInstanceOf(
      GovernanceClientConfigurationError,
    )
  })

  it.each([0, -1, 1.5, 120001, NaN])('rejects invalid timeout %s', async timeoutMs => {
    await expect(readPublicHealth({ url: 'https://localhost/', timeoutMs })).rejects.toBeInstanceOf(
      GovernanceClientConfigurationError,
    )
  })

  it('does not connect when already cancelled', async () => {
    const p = await peer()
    expect(await readPublicHealth({ ...p, signal: AbortSignal.abort() })).toEqual({
      kind: 'unavailable',
      reason: 'cancelled',
    })
    expect(p.observations.connections).toBe(0)
  })

  it('can cancel before socket assignment and removes the external listener', async () => {
    const p = await peer()
    const controller = new AbortController()
    const pending = readPublicHealth({ ...p, signal: controller.signal })
    controller.abort()
    expect(await pending).toEqual({ kind: 'unavailable', reason: 'cancelled' })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    expect(p.observations.applicationBytes).toBe(0)
  })

  it('times out during a TLS handshake', async () => {
    const sockets = new Set<Socket>()
    const server = createTcpServer(socket => {
      sockets.add(socket)
      socket.on('error', () => {})
      socket.once('close', () => sockets.delete(socket))
      socket.resume()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no TCP fixture port')
    expect(
      await readPublicHealth({ url: `https://127.0.0.1:${String(address.port)}`, timeoutMs: 50 }),
    ).toEqual({ kind: 'unavailable', reason: 'timeout' })
  })

  it('cancels while reading a body and does not leave an abort listener', async () => {
    const controller = new AbortController()
    const p = await peer(socket => {
      socket.write('HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{')
      controller.abort()
    })
    expect(await readPublicHealth({ ...p, signal: controller.signal })).toEqual({
      kind: 'unavailable',
      reason: 'cancelled',
    })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('deadline bounds an incomplete response and releases the signal subscription', async () => {
    const controller = new AbortController()
    const p = await peer(socket => {
      socket.write('HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{')
    })
    expect(await readPublicHealth({ ...p, signal: controller.signal, timeoutMs: 50 })).toEqual({
      kind: 'unavailable',
      reason: 'timeout',
    })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('cleans up a completed request and ignores later abort', async () => {
    const controller = new AbortController()
    const p = await peer()
    expect(await readPublicHealth({ ...p, signal: controller.signal })).toEqual({
      kind: 'health',
      reply: health,
    })
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
    controller.abort()
    expect(p.observations.connections).toBe(1)
  })
})
