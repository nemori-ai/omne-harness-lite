import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { healthRequest, healthResponse } from './fixtures/client.ts'
import { receive } from './fixtures/server.ts'
import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  readGovernanceRequest,
  readGovernanceResponse,
  type GovernanceRequest,
  type GovernanceCodecLimits,
} from '@omne-harness/public-contract'
import { loginStateCodec } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'

const limits: GovernanceCodecLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const version = 'governance-public/1'
const health = {
  protocolVersion: version,
  messageId: 'm',
  operation: 'public-health',
  body: {},
} as const
const login = loginStateCodec.parse('lgn_00000000000000000000000000')
if (!login.ok) throw new Error('invalid test login')
const revoke = {
  protocolVersion: version,
  messageId: '',
  operation: 'revoke-login',
  proof: { kind: 'present', value: 'secret-proof' },
  body: { targetLoginId: login.value },
} as const
const read = (value: unknown) => readGovernanceRequest({ bytes: bytes(value), limits })
const encode = (value: unknown) =>
  encodeGovernanceRequest({ request: value as GovernanceRequest, limits })

it('round trips health and revoke through their public models and correlated responses', () => {
  for (const request of [health, revoke]) {
    const encoded = encodeGovernanceRequest({ request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind !== 'encoded') return
    expect(readGovernanceRequest({ bytes: encoded.bytes, limits })).toEqual({
      kind: 'request',
      request,
    })
  }
  const response = {
    protocolVersion: version,
    messageId: 'm',
    outcome: 'succeeded',
    body: { protocolVersion: version },
  } as const
  const encoded = encodeGovernanceResponse({ operation: 'public-health', response, limits })
  expect(encoded.kind).toBe('encoded')
  if (encoded.kind !== 'encoded') return
  expect(
    readGovernanceResponse({
      bytes: encoded.bytes,
      operation: 'public-health',
      expectedMessageId: 'm',
      limits,
    }),
  ).toEqual({ kind: 'response', response })
  expect(
    readGovernanceResponse({
      bytes: encoded.bytes,
      operation: 'public-health',
      expectedMessageId: 'other',
      limits,
    }),
  ).toEqual({ kind: 'unmatched' })
})

it.each([undefined, ''])(
  'preserves missing/empty proof for identity rather than making a business decision',
  proof => {
    const wire = {
      protocolVersion: version,
      messageId: '',
      operation: 'revoke-login',
      body: { targetLoginId: 'lgn_00000000000000000000000000' },
      ...(proof === undefined ? {} : { loginProof: proof }),
    }
    const result = read(wire)
    expect(result.kind).toBe('request')
    if (result.kind !== 'request' || result.request.operation !== 'revoke-login') return
    expect(result.request.proof).toEqual({ kind: proof === undefined ? 'missing' : 'empty' })
    const encoded = encodeGovernanceRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(JSON.parse(new TextDecoder().decode(encoded.bytes))).toEqual(wire)
  },
)

it.each([
  { ...health, loginProof: '' },
  { ...health, actingTenant: 'tenant' },
  { ...health, extra: 'secret' },
  { ...health, body: { extra: 'secret' } },
  { ...health, body: null },
  { ...health, body: undefined },
  { ...health, protocolVersion: 'other' },
  { ...health, operation: 'toString' },
  { ...health, messageId: 1 },
  {
    ...health,
    operation: 'revoke-login',
    loginProof: 1,
    body: { targetLoginId: 'lgn_00000000000000000000000000' },
  },
])('rejects invalid envelope %# without retaining secret values', wire => {
  const result = read(wire)
  expect(result.kind).toBe('protocol-rejected')
  expect(JSON.stringify(result)).not.toContain('secret')
})

it.each(['disable-subject', 'restore-subject', 'end-subject', 'reopen-after-media-loss'])(
  'stage %s precedes every field check after version validation',
  operation => {
    const wire = {
      protocolVersion: version,
      operation,
      body: 3,
      loginProof: { secret: true },
      arbitrary: true,
    }
    const result = read(wire)
    expect(result).toEqual({
      kind: 'stage-not-provided',
      response: { protocolVersion: version, outcome: 'stage-not-provided', body: {} },
    })
    expect(read({ ...wire, protocolVersion: 'wrong' }).kind).toBe('protocol-rejected')
    if (result.kind !== 'stage-not-provided') return
    const encoded = encodeGovernanceResponse({ response: result.response, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded')
      expect(
        readGovernanceResponse({
          bytes: encoded.bytes,
          operation: 'disable-subject',
          expectedMessageId: 'm',
          limits,
        }),
      ).toEqual({ kind: 'unmatched' })
  },
)

it('validates the entire response before correlation', () => {
  const response = {
    protocolVersion: version,
    messageId: 'different',
    outcome: 'succeeded',
    body: { protocolVersion: version, loginProof: 'secret' },
  }
  expect(
    readGovernanceResponse({
      bytes: bytes(response),
      operation: 'public-health',
      expectedMessageId: 'm',
      limits,
    }).kind,
  ).toBe('unreadable')
  expect(
    readGovernanceResponse({
      bytes: bytes({ protocolVersion: version, outcome: 'protocol-rejected', body: {} }),
      operation: 'public-health',
      expectedMessageId: 'm',
      limits,
    }),
  ).toEqual({ kind: 'unmatched' })
})

describe('hostile local values', () => {
  it('keeps caller mutations of failures out of subsequent request and response diagnostics', () => {
    const invalidRequest = { ...health, unexpected: true }
    const invalidResponse = {
      protocolVersion: version,
      messageId: 'm',
      outcome: 'succeeded',
      body: { protocolVersion: version },
      unexpected: true,
    } as const
    const calls = [
      () => encodeGovernanceRequest({ request: invalidRequest, limits }),
      () =>
        encodeGovernanceResponse({ operation: 'public-health', response: invalidResponse, limits }),
    ]
    for (const call of calls) {
      const first = call()
      expect(first.kind).toBe('invalid')
      if (first.kind !== 'invalid') throw new Error('Expected a closed-field rejection')
      Object.assign(first.diagnostic, { code: 'poisoned-code', secret: 'caller-secret' })
      Object.assign(first, { secret: 'caller-secret' })
      for (const subsequent of calls) {
        expect(subsequent()).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
      }
    }
  })
  it('never invokes model getters or toJSON', () => {
    let calls = 0
    const body = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        calls++
        throw new Error('secret')
      },
    })
    expect(encode({ ...health, body })).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
    expect(
      encode({
        ...health,
        toJSON() {
          calls++
          throw new Error('secret')
        },
      }).kind,
    ).toBe('invalid')
    expect(calls).toBe(0)
  })
  it('contains model reflection exceptions but rejects programming argument exceptions with a fixed TypeError', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('secret')
        },
      },
    )
    expect(encode(hostile)).toEqual({ kind: 'invalid', diagnostic: { code: 'field' } })
    expect(() =>
      encodeGovernanceRequest(hostile as Parameters<typeof encodeGovernanceRequest>[0]),
    ).toThrow(new TypeError('Invalid governance codec arguments'))
    expect(() =>
      readGovernanceRequest({ bytes: bytes(health), limits: hostile as GovernanceCodecLimits }),
    ).toThrow(new TypeError('Invalid governance codec arguments'))
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    expect(encode(revoked.proxy).kind).toBe('invalid')
  })
  it('rejects forged identity, malformed proof, prototypes, symbols, hidden fields and cyclic input', () => {
    expect(
      encode({
        ...revoke,
        body: { targetLoginId: { name: 'LoginStateId', text: 'lgn_00000000000000000000000000' } },
      }).kind,
    ).toBe('invalid')
    for (const proof of [
      { kind: 'present', value: '' },
      { kind: 'missing', value: 'secret' },
      {},
      null,
    ])
      expect(encode({ ...revoke, proof }).kind).toBe('invalid')
    expect(encode(Object.create(health)).kind).toBe('invalid')
    expect(encode({ ...health, [Symbol('secret')]: true }).kind).toBe('invalid')
    expect(encode(Object.defineProperty({ ...health }, 'secret', { value: true })).kind).toBe(
      'invalid',
    )
    expect(encode({ ...health, proof: undefined }).kind).toBe('invalid')
  })
  it('enforces output budgets and safe parameter values', () => {
    expect(
      encodeGovernanceRequest({ request: health, limits: { ...limits, maxBytes: 1 } }),
    ).toEqual({ kind: 'invalid', diagnostic: { code: 'budget' } })
    for (const n of [0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        readGovernanceRequest({ bytes: bytes(health), limits: { ...limits, maxItems: n } }),
      ).toThrow(TypeError)
  })
})

it('demonstrates independent client and server consumption without business providers', () => {
  const request = healthRequest('demo', limits)
  expect(request.kind).toBe('encoded')
  if (request.kind !== 'encoded') return
  const normal = receive(request.bytes, limits)
  expect(normal.kind).toBe('encoded')
  if (normal.kind !== 'encoded') return
  const accepted = healthResponse(normal.bytes, 'demo', limits)
  expect(accepted.kind).toBe('response')
  const duplicate = receive(
    new TextEncoder().encode(
      '{"protocolVersion":"governance-public/1","protocolVersion":"other","messageId":"demo"}',
    ),
    limits,
  )
  expect(duplicate.kind).toBe('encoded')
  if (duplicate.kind !== 'encoded') return
  const refused = healthResponse(duplicate.bytes, 'demo', limits)
  expect(refused.kind === 'response' && refused.response.outcome).toBe('protocol-rejected')
  const stage = receive(
    bytes({ protocolVersion: version, operation: 'disable-subject', body: null }),
    limits,
  )
  expect(stage.kind).toBe('encoded')
  if (stage.kind !== 'encoded') return
  const unmatched = readGovernanceResponse({
    bytes: stage.bytes,
    operation: 'disable-subject',
    expectedMessageId: 'demo',
    limits,
  })
  expect(unmatched).toEqual({ kind: 'unmatched' })
  const evidence = fileURLToPath(
    new URL('../../../../tmp/issue-319/implementation/', import.meta.url),
  )
  mkdirSync(evidence, { recursive: true })
  writeFileSync(evidence + '/demo.json', JSON.stringify({ accepted, refused, unmatched }, null, 2))
})
