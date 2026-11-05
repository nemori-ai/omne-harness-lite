// The three model credential operations (SPEC「模型凭据」): the envelope, the closed bodies, the
// result sets, and that no response can carry the secret.
import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  readGovernanceRequest,
  readGovernanceResponse,
  type GovernanceProvidedOperation,
  type GovernanceResponseEncodeInput,
} from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'

const limits = {
  maxBytes: 100_000,
  maxDepth: 100,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}
const account = 'acc_00000000000000000000000000'
const organization = 'org_00000000000000000000000000'
const tenantId = JSON.stringify({ organization, account })
const at = '2026-11-04T08:00:00.000Z'
const SENTINEL = 'sk-or-sentinel-0123456789'
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
const text = (value: Uint8Array) => new TextDecoder().decode(value)

type CredentialOperation =
  | 'bind-model-credential'
  | 'unbind-model-credential'
  | 'describe-model-credential'

function requestWire(operation: CredentialOperation, body: unknown, envelope: object = {}) {
  return {
    protocolVersion: 'governance-public/1',
    messageId: 'm',
    operation,
    loginProof: 'proof',
    actingTenant: tenantId,
    body,
    ...envelope,
  }
}

function read(operation: GovernanceProvidedOperation, outcome: string, body: unknown) {
  return readGovernanceResponse({
    bytes: bytes({ protocolVersion: 'governance-public/1', messageId: 'm', outcome, body }),
    operation,
    expectedMessageId: 'm',
    limits,
  })
}

describe('requests', () => {
  it('bind-model-credential reads the secret and needs the login proof and the acting tenant', () => {
    const wire = requestWire('bind-model-credential', { secret: SENTINEL })
    const result = readGovernanceRequest({ bytes: bytes(wire), limits })
    expect(result.kind).toBe('request')
    if (result.kind !== 'request') return
    expect(result.request.operation).toBe('bind-model-credential')
    if (result.request.operation === 'bind-model-credential')
      expect(result.request.body.secret).toBe(SENTINEL)
    const encoded = encodeGovernanceRequest({ request: result.request, limits })
    expect(encoded.kind).toBe('encoded')
    if (encoded.kind === 'encoded') expect(JSON.parse(text(encoded.bytes))).toEqual(wire)

    // Controls: an empty or absent secret, a missing acting tenant and a body field beyond the
    // secret are not this protocol. The rejection carries no part of the secret.
    for (const bad of [
      requestWire('bind-model-credential', { secret: '' }),
      requestWire('bind-model-credential', {}),
      requestWire('bind-model-credential', { secret: 1 }),
      requestWire('bind-model-credential', { secret: SENTINEL, route: 'openrouter' }),
      requestWire('bind-model-credential', { secret: SENTINEL }, { actingTenant: undefined }),
    ]) {
      const refused = readGovernanceRequest({ bytes: bytes(bad), limits })
      expect(refused.kind).toBe('protocol-rejected')
      expect(JSON.stringify(refused)).not.toContain(SENTINEL)
    }
  })

  it.each(['unbind-model-credential', 'describe-model-credential'] as const)(
    '%s has an empty body, a login proof and an acting tenant',
    operation => {
      expect(readGovernanceRequest({ bytes: bytes(requestWire(operation, {})), limits }).kind).toBe(
        'request',
      )
      expect(
        readGovernanceRequest({
          bytes: bytes(requestWire(operation, { secret: SENTINEL })),
          limits,
        }).kind,
      ).toBe('protocol-rejected')
      expect(
        readGovernanceRequest({
          bytes: bytes(requestWire(operation, {}, { actingTenant: undefined })),
          limits,
        }).kind,
      ).toBe('protocol-rejected')
    },
  )

  it('a missing login proof is not a protocol failure: identity answers it', () => {
    const wire = requestWire('describe-model-credential', {}, { loginProof: undefined })
    const result = readGovernanceRequest({ bytes: bytes(wire), limits })
    expect(result.kind).toBe('request')
    if (result.kind === 'request' && 'proof' in result.request)
      expect(result.request.proof).toEqual({ kind: 'missing' })
  })
})

describe('responses', () => {
  it('bind-model-credential succeeds with the configuration time only', () => {
    expect(read('bind-model-credential', 'succeeded', { configuredAt: at }).kind).toBe('response')
    for (const body of [
      {},
      { configuredAt: 'not-an-instant' },
      { configuredAt: at, secret: SENTINEL },
      { configuredAt: at, tenantId },
    ])
      expect(read('bind-model-credential', 'succeeded', body).kind).toBe('unreadable')
    expect(read('bind-model-credential', 'no-change', {}).kind).toBe('unreadable')
    expect(read('bind-model-credential', 'not-visible', {}).kind).toBe('unreadable')
  })

  it('unbind-model-credential answers no-change with an empty body when nothing was bound', () => {
    expect(read('unbind-model-credential', 'no-change', {}).kind).toBe('response')
    expect(read('unbind-model-credential', 'succeeded', {}).kind).toBe('response')
    expect(read('unbind-model-credential', 'no-change', { configuredAt: at }).kind).toBe(
      'unreadable',
    )
    expect(read('unbind-model-credential', 'not-visible', {}).kind).toBe('unreadable')
  })

  it('describe-model-credential shows presence, owner and time, never the secret', () => {
    const shown = [
      { state: 'unbound' },
      { state: 'usable', tenantId, configuredAt: at },
      { state: 'usable', tenantId },
      { state: 'unreadable', tenantId, configuredAt: at },
    ]
    for (const body of shown) {
      const result = read('describe-model-credential', 'succeeded', body)
      expect(result.kind).toBe('response')
      if (result.kind !== 'response') continue
      const encoded = encodeGovernanceResponse({
        operation: 'describe-model-credential',
        response: result.response,
        limits,
      } as GovernanceResponseEncodeInput)
      expect(encoded.kind).toBe('encoded')
      if (encoded.kind === 'encoded') expect(JSON.parse(text(encoded.bytes)).body).toEqual(body)
    }
    for (const body of [
      {},
      { state: 'unbound', tenantId },
      { state: 'unbound', configuredAt: at },
      { state: 'usable' },
      { state: 'usable', tenantId, secret: SENTINEL },
      { state: 'usable', tenantId, configuredAt: at, value: SENTINEL },
      { state: 'revoked', tenantId },
      { state: 'usable', tenantId: 'not-a-tenant' },
    ])
      expect(read('describe-model-credential', 'succeeded', body).kind).toBe('unreadable')
    for (const outcome of ['unknown', 'no-change', 'not-visible'])
      expect(read('describe-model-credential', outcome, {}).kind).toBe('unreadable')
  })

  it('the encoder refuses a success body that carries the secret', () => {
    const encoded = encodeGovernanceResponse({
      operation: 'bind-model-credential',
      response: {
        protocolVersion: 'governance-public/1',
        messageId: 'm',
        outcome: 'succeeded',
        body: { configuredAt: at, secret: SENTINEL },
      },
      limits,
    } as unknown as GovernanceResponseEncodeInput)
    expect(encoded.kind).toBe('invalid')
    expect(JSON.stringify(encoded)).not.toContain(SENTINEL)
  })
})
